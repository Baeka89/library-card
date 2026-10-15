import {css, el, field, setSelectOptions, confirmAction, captureDisclosures, mountOriginalEditor, whenOpen, visibleInSections} from './library-ui.js?v=0.5.2';
import {STANDARD_CARDS, cardConstructor, cachedOriginalEditor, updateOriginalEditor, createRenderedCard} from './library-ha-ui.js?v=0.5.2';
import {editorOverrides, restoreBindings, updateLocalField, designOverrides, clone, getAt, setAt, resolveTemplate, overlap, bindingValue, newId, validateCard, importLibrary, validatePopupRoutes, popupTemplateInfo, popupTemplateRoute, inputErrors} from './library-core.js?v=0.5.2';
import {configurationYaml, scanDashboards, usages} from './library-tools.js?v=0.5.2';
import {installTools} from './library-manager-tools.js?v=0.5.2';
import {installWorkflows} from './library-workflows.js?v=0.5.2';
import {installPopupActions} from './library-popup.js?v=0.5.2';
const clients = new WeakMap();
// Inspect only requested templates and their actual dependencies. Snapshot data
// is authoritative; no draft or persistent browser data enters these caches.
const resolvedSnapshots = new WeakMap();
function requestedTemplate(library, id) {
  let snapshot = resolvedSnapshots.get(library);
  if (!snapshot) { snapshot = {templates: new Map(), entries: new Map()}; resolvedSnapshots.set(library, snapshot); }
  let requested = snapshot.templates.get(id);
  if (!requested) {
    const template = Object.hasOwn(library.templates, id) ? library.templates[id] : null;
    if (!template) throw Error('Vorlage fehlt: ' + id);
    const config = template.config, bindings = template.bindings || [];
    const fingerprint = JSON.stringify([config, bindings, bindings.map(binding => bindingValue(library, binding))]);
    requested = {fingerprint, library: {templates: {[id]: {config, bindings}}, groups: library.groups, people: library.people}};
    snapshot.templates.set(id, requested);
  }
  return {snapshot, requested};
}
function resolvedCard(state, reference) {
  const overrides = reference.overrides === undefined ? [] : reference.overrides;
  if (!Array.isArray(overrides)) throw Error('Lokale Anpassungen müssen eine Liste sein');
  // Template existence/dependencies are checked before any helpers or native card.
  const {snapshot, requested} = requestedTemplate(state.library, reference.template);
  const key = JSON.stringify([reference.template, overrides]);
  let entry = snapshot.entries.get(key);
  if (entry) return entry;
  state.resolvedEntries ||= new Map();
  const previous = state.resolvedEntries.get(key);
  if (previous?.fingerprint === requested.fingerprint) entry = previous.entry;
  else {
    const config = resolveTemplate(requested.library, reference.template, overrides);
    entry = {config, signature: JSON.stringify(config), decorations: decorationSignature(config)};
    if (state.resolvedEntries.size >= 256) state.resolvedEntries.delete(state.resolvedEntries.keys().next().value);
    state.resolvedEntries.set(key, {fingerprint: requested.fingerprint, entry});
  }
  if (snapshot.entries.size >= 256) snapshot.entries.delete(snapshot.entries.keys().next().value);
  snapshot.entries.set(key, entry);
  return entry;
}
// External decorators can be installed by HA/card-mod at factory creation time.
// Updating the underlying element alone does not necessarily rerun those hooks.
function decorationSignature(config) {
  const entries = [];
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'card_mod' || (key === 'theme' && typeof node.type === 'string')) entries.push([[...path, key], value]);
      else visit(value, [...path, key]);
    }
  }
  visit(config, []); return JSON.stringify(entries);
}
function bindRenderedChild(owner, child) {
  owner.child = child;
  child.addEventListener('ll-rebuild', event => {
    event.stopPropagation();
    if (owner._detached || owner.child !== child) return;
    owner.signature = null; owner.child = null; owner.render();
  });
  child.addEventListener('ll-upgrade', event => {
    if (owner._detached || event.target !== child || owner.child !== child) return;
    event.stopPropagation();
    if (Object.hasOwn(child, 'hass')) delete child.hass;
    child.hass = owner._hass;
  });
}
function reloadOriginalEditor(owner, error) {
  const cache = owner.originalEditorCache;
  if (cache?.listener) owner.editor?.removeEventListener('config-changed', cache.listener);
  owner.editor = null; owner.originalEditorCache = null;
  owner.notice = 'Originaleditor wird neu geladen: ' + (error.message || String(error));
  queueMicrotask(() => {
    if (!owner._detached && !owner.originalEditorCache && owner.state?.library) owner.render();
  });
}
function client(hass) {
  let state = clients.get(hass.connection);
  if (!state) {
    state = {listeners: new Set(), library: null, error: null, generation: 0};
    state.start = () => {
      if (state.pending) return;
      const generation = ++state.generation;
      state.error = null; state.library = null;
      const previous = state.unsubscribe; state.unsubscribe = null;
      state.listeners.forEach(fn => fn());
      state.pending = (async () => {
        if (previous) await previous();
        const unsubscribe = await hass.connection.subscribeMessage(data => {
          if (generation !== state.generation) return;
          if (data.available === false) { state.library = null; state.error = Error('Die Card-Library-Integration ist deaktiviert.'); }
          else { state.library = data; state.error = null; }
          state.listeners.forEach(fn => fn());
        }, {type: 'card_library/subscribe'});
        state.unsubscribe = unsubscribe;
      })().catch(error => {
        if (generation !== state.generation) return;
        state.error = error; state.listeners.forEach(fn => fn());
      }).finally(() => { state.pending = null; });
    };
    clients.set(hass.connection, state); state.start();
  }
  return state;
}
function button(parent, text, action) { const b = el('button', text, parent); b.type = 'button'; b.onclick = event => { if (!b.disabled) return action(event); }; return b; }
let popupWatchedState, popupLibraryListener;
function currentPopupReference(hass, reference) {
  const state = client(hass);
  if (state.error) throw state.error;
  if (!state.library) throw Error('Die Vorlagenbibliothek ist noch nicht verfügbar.');
  const config = resolvedCard(state, reference).config, errors = inputErrors(state.library.templates[reference.template],config);
  if (errors.length) throw Error(errors.join(' · '));
  return config;
}
const popupController = installPopupActions(async (hass, reference) => {
  const state = client(hass);
  if (!state.library && !state.error) await new Promise((resolve, reject) => {
    const finish = () => {
      if (!state.library && !state.error) return;
      clearTimeout(timer); state.listeners.delete(finish);
      state.error ? reject(state.error) : resolve();
    };
    const timer = setTimeout(() => { state.listeners.delete(finish); reject(Error('Die Vorlagenbibliothek antwortet nicht. Bitte erneut versuchen.')); }, 5000);
    state.listeners.add(finish); finish();
  });
  if (state.error) throw state.error;
  return currentPopupReference(hass, reference);
}, (hass, update) => {
  const state = client(hass);
  if (state === popupWatchedState) return;
  popupWatchedState?.listeners.delete(popupLibraryListener);
  popupWatchedState = state;
  update(null);
  popupLibraryListener = () => update(state.library);
  state.listeners.add(popupLibraryListener);
  popupLibraryListener();
}, currentPopupReference);
function popupRouteButton(parent, owner, template, library = () => owner.draft) {
  const hash = field(parent, 'Wirksamer Popup-Hash'); hash.readOnly = true;
  const output = field(parent, 'Popup-Button (YAML)', 'textarea', false); output.readOnly = true; output.rows = 8;
  const notice = el('p', '', parent); notice.className = 'hint';
  const update = () => {
    if (!parent.isConnected) return;
    try {
      const route = popupTemplateRoute(library(), template());
      hash.value = route?.hash || '';
      output.value = route ? configurationYaml({type:'button', name:route.options.name || template().name, icon:'mdi:open-in-new',tap_action:{action:'navigate',navigation_path:route.hash}}) : '';
      notice.textContent = route ? 'Nur den Button ins Dashboard einsetzen. Eine zusätzliche Popup-Karte ist nicht nötig.' : 'Zuerst einen Popup-Hash festlegen und zentral speichern.';
    } catch (error) { hash.value = ''; output.value = ''; notice.textContent = error.message || String(error); }
  };
  update(); return update;
}
function popupRouteSettings(parent, owner, template) {
  const section = el('details', undefined, parent); el('summary', 'Popup über #Hash öffnen', section);
  const native = popupTemplateInfo(template.config);
  if (native?.supported) {
    el('p', 'Hash und Gestaltung im originalen Bubble-Editor bearbeiten und zentral speichern. Der Karten-Hash wird automatisch erkannt.', section);
    if (!template.popup) { owner.popupRouteRefresh = popupRouteButton(section, owner, () => template); return; }
    el('p', 'Diese Zuordnung überschreibt den Karten-Hash. Entfernen, um wieder den Karten-Hash zu verwenden.', section);
  }
  el('p', 'Hash festlegen und zentral speichern. Ein Button mit Navigation auf diesen Hash genügt. Zum Entfernen den Hash leeren.', section);
  const hash = field(section, 'Popup-Hash'); hash.value = template.popup?.hash || '';
  const title = field(section, 'Popup-Titel'); title.value = template.popup?.options?.name || '';
  const width = field(section, 'Breite am Desktop (optional)'); width.value = template.popup?.options?.width_desktop || '';
  const notice = el('p', '', section); notice.className = 'error';
  const change = () => {
    const previous = template.popup;
    if (!hash.value.trim()) delete template.popup;
    else {
      const options = clone(previous?.options || {});
      if (title.value) options.name = title.value; else delete options.name;
      if (width.value.trim()) options.width_desktop = width.value; else delete options.width_desktop;
      template.popup = {hash:hash.value.trim(), options};
    }
    try { validatePopupRoutes(owner.draft); notice.textContent = ''; owner.edit(); }
    catch (error) { if (previous) template.popup = previous; else delete template.popup; notice.textContent = error.message; }
  };
  hash.onchange = title.onchange = width.onchange = change;
  owner.popupRouteRefresh = popupRouteButton(section, owner, () => template);
  const extra = el('details', undefined, section); el('summary', 'Weitere originale Bubble-Einstellungen', extra);
  whenOpen(extra, () => {
    if (!template.popup) { el('p', 'Zuerst einen gültigen Popup-Hash eintragen.', extra); return; }
    tree(extra, template.popup.options || {}, (path, value) => {
      if (!template.popup) { notice.textContent = 'Die Popup-Zuordnung wurde entfernt. Zuerst wieder einen Hash eintragen.'; return; }
      const previous = clone(template.popup.options || {});
      try { if (path.length) setAt(template.popup.options, path, value); else template.popup.options = value; validatePopupRoutes(owner.draft); owner.edit(); notice.textContent = ''; }
      catch (error) { template.popup.options = previous; notice.textContent = error.message; }
    });
    el('p', 'Weitere Bubble-Optionen über popup.options importieren. type, card_type, hash und cards werden automatisch gesetzt.', extra);
  });
}
async function storePopupLink(owner, id, previousHash, link) {
  if (!owner._hass?.user?.is_admin) throw Error('Popup-Verknüpfungen können nur Administratoren speichern.');
  const state = owner.state, saved = state?.library, draft = owner.draft;
  if (!saved || (draft && owner.draftConflict())) throw Error(owner.draftConflict?.() || 'Die Bibliothek ist nicht verfügbar.');
  const source = draft || saved, draftSignature = draft && JSON.stringify(draft), candidate = clone(source);
  if (!Object.hasOwn(candidate.templates,id)) throw Error('Die Vorlage wurde entfernt.');
  const item = candidate.templates[id], links = item.popup_links || [];
  const index = previousHash ? links.findIndex(entry => entry.hash === previousHash) : -1;
  if (previousHash && index < 0) throw Error('Die Verknüpfung wurde inzwischen entfernt. Neu laden und erneut auswählen.');
  if (index >= 0) links.splice(index,1);
  if (link) links.push(clone(link));
  if (links.length) item.popup_links = links; else delete item.popup_links;
  importLibrary({format:'ha-card-library',version:2,library:{templates:candidate.templates,groups:candidate.groups,people:candidate.people || {}}});
  const current = () => {
    owner.assertLibraryConnection(state);
    if (state.library !== saved || owner.draft !== draft || draft && JSON.stringify(draft)!==draftSignature) throw Error('Die Bibliothek wurde inzwischen geändert. Neu laden und erneut versuchen.');
  };
  if (previousHash && (!link || link.hash !== previousHash)) {
    const inventory = await scanDashboards(owner._hass); current();
    if (usages(inventory,id,saved).some(entry => entry.reference?.popup_hash === previousHash)) throw Error('Dieser Hash wird noch von Dashboard-Buttons verwendet. Zuerst deren Aufruf ändern.');
    if (inventory.failures.length && !await confirmAction(owner, 'Nicht alle Dashboards konnten geprüft werden. Verknüpfung trotzdem ändern?')) throw Error('Änderung abgebrochen.');
  }
  current();
  if (draft) { owner.draft = candidate; owner.edit(); return 'Im Entwurf übernommen. Zentrale Änderungen speichern.'; }
  const hass = owner._hass;
  const result = await hass.callWS({type:'card_library/save',revision:saved.revision,library:{templates:candidate.templates,groups:candidate.groups,people:candidate.people || {}}});
  owner.assertLibraryConnection(state);
  importLibrary({format:'ha-card-library',version:2,library:{templates:result.templates,groups:result.groups,people:result.people || {}}});
  if (!Number.isInteger(result.revision) || result.revision <= saved.revision) throw Error('Die Bibliothek hat keinen gültigen Speicherstand bestätigt.');
  if (state.library?.revision <= result.revision) {
    state.library = result;
    state.listeners.forEach(fn => fn());
  }
  return link ? 'Verknüpfung gespeichert. Nur ihren Button ins Dashboard einsetzen.' : 'Verknüpfung entfernt.';
}
function popupUsage(parent, owner, template, overrides = []) {
  if (owner.popupUsageTemplate !== template) {
    owner.popupUsageTemplate = template; owner.bubbleOptions = {}; owner.popupLinkOverrides = null; owner.popupLinkDraft = {hash:'',previousHash:''};
  }
  const section = el('details', undefined, parent); el('summary', 'Als Bubble-Popup verwenden', section);
  el('p', 'Popup per Button öffnen. Benötigt Bubble Card ab 3.2.0.', section);
  const central = el('fieldset', undefined, section); el('legend','Zentralen Popup-Hash verwenden',central);
  const savedLibrary = () => owner.state.library;
  const savedTemplate = () => savedLibrary().templates[template];
  const refreshCentral = popupRouteButton(central,owner,savedTemplate,savedLibrary);
  el('p','Örtliche Anpassungen gelten nicht für diesen zentralen Aufruf.',central);
  const local = el('fieldset', undefined, section); el('legend','Eigene Popup-Verknüpfung',local);
  el('p','Eigener Hash, gleiche Vorlage. Örtliche Kartenänderungen und Popup-Einstellungen werden als Ausnahmen gespeichert.',local);
  owner.bubbleOptions ||= {};
  owner.popupLinkDraft ||= {hash:'',previousHash:''};
  const links = (owner.draft || savedLibrary()).templates[template]?.popup_links || [];
  const chosen = select(local,[['','Neue Verknüpfung'],...links.map(link=>[link.hash,link.hash])],owner.popupLinkDraft.previousHash,hash => {
    const link = links.find(entry=>entry.hash===hash);
    owner.popupLinkDraft = {hash:link?.hash || '',previousHash:link?.hash || ''};
    if (link) {
      owner.bubbleOptions = clone(link.options || {});
      owner.popupLinkOverrides = clone(link.overrides || []);
      if (owner.config?.template === template) {
        owner.config.overrides = clone(link.overrides || []); owner.syncLocalEditor(); owner.changed();
      }
    }
    owner.render();
  },'Popup-Verknüpfung');
  const hash = field(local,'Eigener Popup-Hash'); hash.value = owner.popupLinkDraft.hash; hash.placeholder = '#Menu-Wohnzimmer';
  hash.oninput = () => { owner.popupLinkDraft.hash = hash.value; update(false); };
  const title = field(local, 'Popup-Titel');
  const width = field(local, 'Breite am Desktop (optional)');
  const currentOverrides = () => owner.config?.template === template ? owner.config.overrides || [] : owner.popupLinkOverrides || overrides;
  const baseOptions = () => savedTemplate()?.popup?.options || {};
  const inherited = () => {
    const library = owner.draft || savedLibrary();
    const config = resolveTemplate(library,template,currentOverrides()), info = popupTemplateInfo(config);
    return {...(info ? getAt(config,info.path) : {}),...baseOptions()};
  };
  const effectiveOptions = () => ({...baseOptions(),...owner.bubbleOptions});
  const action = () => ({action:'popup',template,...(currentOverrides().length ? {overrides:clone(currentOverrides())} : {}),popup:clone(owner.bubbleOptions)});
  const linkValue = () => ({hash:owner.popupLinkDraft.hash.trim(),...(currentOverrides().length ? {overrides:clone(currentOverrides())} : {}),...(Object.keys(owner.bubbleOptions).length ? {options:clone(owner.bubbleOptions)} : {})});
  const ownOutput = field(local,'Hash-Button (YAML)','textarea',false); ownOutput.readOnly = true; ownOutput.rows = 8;
  const notice = el('p','',local); notice.className = 'hint';
  let save, remove, preview;
  const update = (values = true) => {
    if (!section.isConnected) return;
    refreshCentral();
    try {
      const defaults = inherited();
      if (values) { title.value = owner.bubbleOptions.name ?? defaults.name ?? ''; width.value = owner.bubbleOptions.width_desktop ?? defaults.width_desktop ?? ''; }
      const value = linkValue(), stored = savedTemplate()?.popup_links?.find(entry=>entry.hash === value.hash);
      const matches = stored && JSON.stringify(stored.overrides || [])===JSON.stringify(value.overrides || []) && JSON.stringify(stored.options || {})===JSON.stringify(value.options || {});
      ownOutput.value = matches ? configurationYaml({type:'button',name:effectiveOptions().name || defaults.name || savedTemplate().name,icon:'mdi:open-in-new',tap_action:{action:'navigate',navigation_path:value.hash}}) : '';
      output.value = configurationYaml({type:'button',name:effectiveOptions().name || defaults.name || 'Vorlage öffnen',icon:'mdi:open-in-new',tap_action:{action:'fire-dom-event',card_library:action()}});
      if (!owner.popupLinkSaving) notice.textContent = matches ? 'Gespeichert. Nur diesen Button einsetzen.' : 'Für einen eigenen Hash zuerst die Verknüpfung speichern.';
      if (save) save.disabled = Boolean(owner.popupLinkSaving || !owner._hass?.user?.is_admin || !value.hash);
      if (remove) remove.disabled = Boolean(owner.popupLinkSaving || !owner._hass?.user?.is_admin || !owner.popupLinkDraft.previousHash);
      if (preview) preview.disabled = Boolean(owner.dirty || owner.popupLinkSaving);
    } catch (error) { ownOutput.value=''; output.value=''; notice.textContent=error.message || String(error); if (save) save.disabled=true; }
  };
  const changeOption = (key,input) => {
    const value=input.value.trim(), defaults=inherited();
    if (!value || value===defaults[key]) delete owner.bubbleOptions[key]; else owner.bubbleOptions[key]=value;
    update();
  };
  title.onchange = () => changeOption('name',title); width.onchange = () => changeOption('width_desktop',width);
  el('p','Angezeigt werden die übernommenen Werte. Ein leeres Feld übernimmt wieder den Vorlagenwert.',local);
  const persist = async deleting => {
    if (owner.popupLinkSaving) return;
    const context = owner.popupLinkDraft, previous = context.previousHash, value = deleting ? null : linkValue();
    owner.popupLinkSaving=true;update(false);notice.textContent='Verknüpfung wird gespeichert …';
    try {
      const message=await storePopupLink(owner,template,previous,value);
      if (owner.popupLinkDraft === context) { context.previousHash=value?.hash || ''; if (deleting) context.hash=''; }
      owner.popupLinkSaving=false;
      owner.notice=message;if (!owner._detached) owner.render();
    } catch (error) { owner.popupLinkSaving=false;owner.popupUsageRefresh?.(false);update(false);notice.textContent=error.message || String(error);notice.className='error'; }
  };
  save=button(local,'Verknüpfung speichern',()=>persist(false));save.className='primary';
  remove=button(local,'Verknüpfung entfernen',()=>persist(true));
  if (!owner._hass?.user?.is_admin) el('p','Nur Administratoren können Hash-Verknüpfungen speichern oder entfernen.',local);
  const advanced=el('details',undefined,section);el('summary','Direkter Button-Aufruf ohne eigenen Hash',advanced);
  el('p','Öffnet die Vorlage direkt mit lokalen Änderungen. Kein eigener Hash nötig.',advanced);
  const output=field(advanced,'Button zum Öffnen (YAML)','textarea',false);output.readOnly=true;output.rows=12;
  preview=button(local,'Bubble-Popup testen',async()=>{
    try {notice.textContent='';if(!popupController)throw Error('Popup-Steuerung ist nicht verfügbar.');await popupController.open(action());}
    catch(error){notice.textContent=error.message || String(error);}
  });
  owner.popupUsageRefresh=update;update();
}
function select(parent, items, value, change, caption) {
  const label = caption || (items[0]?.[0] === 'string' ? 'Datentyp' : (items[0]?.[1] || 'Auswahl').replace(/ auswählen$| wählen$/, ''));
  const s = field(parent, label, 'select');
  setSelectOptions(s, items);
  s.value = value || ''; s.libraryLastValue = s.value; s.onchange = () => change(s.value); return s;
}
function tree(parent, value, update, selectPath, path = []) {
  if (value !== null && typeof value === 'object') {
    const box = el('details', undefined, parent); box.open = path.length < 2;
    const summary = el('summary', `${path.at(-1) ?? 'Einstellungen'} (${Array.isArray(value) ? 'Liste' : 'Objekt'})`, box);
    if (path.length && selectPath) button(summary, 'Auswählen', e => { e.stopPropagation(); e.preventDefault(); selectPath(path); });
    for (const [key, child] of Object.entries(value)) {
      const part = Array.isArray(value) ? Number(key) : key;
      tree(box, child, update, selectPath, [...path, part]);
    }
    return;
  }
  const row = el('div', undefined, parent); row.className = 'field';
  const type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
  const input = field(row, String(path.at(-1) ?? 'Wert'), 'input', true, type);
  if (input.type === 'checkbox') input.checked = value; else input.value = value ?? '';
  input.onchange = () => update(path, input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value);
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    const color = field(row, 'Farbe', 'input', true, 'color'); color.value = value;
    color.onchange = () => { input.value = color.value; update(path, color.value); };
  }
  if (path.length && selectPath) button(row, 'Auswählen', () => selectPath(path));
}
class Base extends HTMLElement {
  constructor() { super(); this.attachShadow({mode: 'open'}); }
  set hass(hass) {
    this._hass = hass;
    if (this._connection !== hass.connection) {
      this.inventory = null;
      this.unwatch(); this._connection = hass.connection; this.state = client(hass);
      this._listener = () => this.refreshLibrary();
      if (!this._detached) { this.state.listeners.add(this._listener); this.refreshLibrary(); }
    }
    if (this._detached) return;
    this.child && (this.child.hass = hass);
    if (this.editor?.isConnected && (!this.localEditorSection || (!this.manage && this.localEditorSection.open))) this.editor.hass = hass;
    this.picker && (this.picker.hass = hass);
    for (const picker of [...(this.buttonVariablePickers || []),...(this.definedInputPickers || [])]) if (picker.isConnected) picker.hass = hass;
    this.manager && (this.manager.hass = hass);
    for (const host of this.shadowRoot.querySelectorAll?.('[data-library-preview]') || []) if (host.previewChild && visibleInSections(host)) host.previewChild.hass = hass;
  }
  connectedCallback() {
    this._detached = false;
    if (this.state && this._listener) this.state.listeners.add(this._listener);
    if (this._hass) this.refreshLibrary();
  }
  disconnectedCallback() { this._detached = true; this.unwatch(); clearTimeout(this.previewTimer); this.token = (this.token || 0) + 1; this.renderGeneration = (this.renderGeneration || 0) + 1; }
  unwatch() { if (this.state && this._listener) this.state.listeners.delete(this._listener); }
  assertLibraryConnection(state) {
    if (this.state !== state) throw Error('HA-Verbindung gewechselt. Entwurf bei Bedarf exportieren, dann „Entwurf verwerfen / neu laden“ wählen.');
  }
  shell(title) {
    this.renderGeneration = (this.renderGeneration || 0) + 1;
    captureDisclosures(this, this.shadowRoot);
    this.shadowRoot.replaceChildren(); el('style', css, this.shadowRoot);
    const frame = el('ha-card', undefined, this.shadowRoot); frame.className = this.embedded ? 'embedded' : '';
    const card = el('div', undefined, frame); card.className = 'card-config';
    card.libraryScope = this.constructor.name + ':' + (this.mode || (this.manage ? 'configuration' : 'insertion'));
    card.libraryOwner = this;
    if (title && !this.embedded) el('h2', title, card); return card;
  }
  fail(error) { const p = el('p', error?.message || String(error), this.shadowRoot); p.className = 'error'; }
  showUnavailable(title) {
    if (this.state?.library) return false;
    const card = this.shell(title);
    el('p', this.state?.error?.message || 'Vorlagenbibliothek wird geladen …', card);
    if (this.state?.error) button(card, 'Erneut verbinden', () => this.state.start());
    return true;
  }
  refreshLibrary() {
    if (this._detached) return;
    try { this.libraryChanged(); }
    catch (error) { this.fail(error); }
  }
  libraryChanged() { this.render(); }
}
class LibraryCard extends Base {
  static getConfigElement() { return document.createElement('library-card-editor'); }
  static getStubConfig() { return {template: ''}; }
  setConfig(config) { if (JSON.stringify(config) === JSON.stringify(this.config)) return; this.config = clone(config); if (this.state) this.render(); }
  getCardSize() { return this.child?.getCardSize?.() ?? 3; }
  getGridOptions() { return this.child?.getGridOptions?.() || {columns:12, rows:'auto'}; }
  async render() {
    if (this._detached) return;
    const token = this.token = (this.token || 0) + 1;
    if (!this.config || !this._hass) return;
    if (!this.state.library) { this.signature = null; this.child = null; this.showUnavailable('Vorlagenkarte'); return; }
    try {
      let {config, signature, decorations} = resolvedCard(this.state, this.config);
      const errors = inputErrors(this.state.library.templates[this.config.template],config);
      if (errors.length) throw Error(errors.join(' · '));
      if (this.config.popup_content) {
        const native = popupTemplateInfo(config);
        if (native) {
          if (!native.supported) throw Error('Die Vorlage enthält keinen unterstützten Bubble-Popup-Inhalt.');
          config = native.path.length ? {...config, cards:config.cards.slice(1)} : {type:'vertical-stack',cards:config.cards};
          signature = JSON.stringify(config); decorations = decorationSignature(config);
        } else if (this.config.popup_content !== 'auto') throw Error('Die Vorlage enthält keinen unterstützten Bubble-Popup-Inhalt.');
      }
      const referenceSignature = JSON.stringify([this.config.template, this.config.overrides || [], Boolean(this.config.popup_content)]);
      if (signature === this.signature && this.child) { this.referenceSignature = referenceSignature; this.child.hass = this._hass; return; }
      if (this.child && this.childType === config.type && this.referenceSignature === referenceSignature && this.decorations === decorations && typeof this.child.setConfig === 'function') {
        try {
          this.child.setConfig(clone(config));
          if (token !== this.token) return;
          this.signature = signature; this.child.hass = this._hass; return;
        } catch { /* A card that cannot update is recreated through HA's factory. */ }
      }
      const helpers = await window.loadCardHelpers();
      if (token !== this.token) return;
      const {element:child} = createRenderedCard(helpers, config, this._hass); this.child = child; this.childType = config.type; this.decorations = decorations; this.referenceSignature = referenceSignature;
      bindRenderedChild(this, child);
      child.hass = this._hass;
      if (token !== this.token) return;
      this.shadowRoot.replaceChildren(child); this.signature = signature;
    } catch (error) { if (token !== this.token) return; this.signature = null; this.child = null; this.shell('Vorlagenkarte'); this.fail(error); }
  }
}
// Private rendering adapter for HA footer/header envelopes. The inner card
// keeps its original renderer and editor; this element only limits its width.
class LibraryContainerCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); }
  setConfig(config) { validateCard(config); this.config = clone(config); this.render(); }
  set hass(value) { this._hass = value; if (this._detached) return; if (this.child) this.child.hass = value; else this.render(); }
  connectedCallback() { this._detached = false; this.render(); }
  disconnectedCallback() { this._detached = true; this.token = (this.token || 0) + 1; }
  getCardSize() { return this.child?.getCardSize?.() ?? 1; }
  getGridOptions() { return this.child?.getGridOptions?.() || {columns:12, rows:'auto'}; }
  async render() {
    if (this._detached) return;
    const token = this.token = (this.token || 0) + 1;
    if (!this.config || !this._hass) return;
    try {
      const config = this.config.card, signature = JSON.stringify(config), decorations = decorationSignature(config);
      const styleText = ':host{display:block;width:100%;max-width:' + (this.config.max_width ? this.config.max_width + 'px' : '100%') + ';margin-inline:auto}';
      if (this.child && signature === this.signature) {
        this.widthStyle.textContent = styleText; this.child.hass = this._hass; return;
      }
      if (this.child && this.childType === config.type && this.decorations === decorations && typeof this.child.setConfig === 'function') {
        try {
          this.child.setConfig(clone(config));
          if (token !== this.token) return;
          this.signature = signature; this.widthStyle.textContent = styleText; this.child.hass = this._hass; return;
        } catch { /* Fall back to a fresh native card. */ }
      }
      const helpers = await window.loadCardHelpers();
      if (token !== this.token) return;
      const {element:child} = createRenderedCard(helpers, config, this._hass);
      bindRenderedChild(this, child);
      child.hass = this._hass;
      if (token !== this.token) return;
      const style = this.widthStyle = el('style', styleText, undefined);
      this.signature = signature; this.childType = config.type; this.decorations = decorations; this.child = child; this.shadowRoot.replaceChildren(style, child);
    } catch (error) { if (token === this.token) {this.child = null; this.shadowRoot.replaceChildren(); el('p', error.message || String(error), this.shadowRoot);} }
  }
}
class LibraryEditor extends Base {
  libraryViewSignature() {
    const library = this.state?.library;
    if (!library || !this.config) return null;
    const id = this.config.template;
    const template = Object.hasOwn(library.templates, id) ? library.templates[id] : null;
    let fingerprint;
    if (template) {
      try { fingerprint = requestedTemplate(library, id).requested.fingerprint; }
      catch (error) { fingerprint = ['invalid', error.message || String(error)]; }
    }
    return JSON.stringify([
      Object.entries(library.templates).map(([key, value]) => [key, value.name]), id, fingerprint,
      template && Object.fromEntries(Object.keys(template).filter(key => key !== 'config' && key !== 'bindings').map(key => [key,template[key]])),
    ]);
  }
  libraryChanged() {
    // Unrelated saves must not remount the native form or interrupt typing.
    // Selected bindings, metadata and selector names still refresh immediately.
    if (this.state?.library && this.libraryRenderState === this.state && this.libraryRenderSignature === this.libraryViewSignature()) return;
    this.render();
  }
  setConfig(config) {
    if (JSON.stringify(config) === JSON.stringify(this.config)) return;
    if (config.template !== this.config?.template) this.resetLocalContext();
    this.config = clone(config); if (this.state) this.render();
  }
  resetLocalContext() {
    this.localPath = null; this.stylePath = null;
    this.localStyleDraft = null; this.localYamlDraft = null;
    this.popupUsageRefresh = null; this.popupUsageTemplate = null;
    this.bubbleOptions = {}; this.popupLinkOverrides = null; this.popupLinkDraft = null;
  }
  schedulePreview() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      if (this.localPreview?.isConnected && this.localPreviewSection?.open) this.previewCard(this.localPreview, this.state.library, this.config.template, this.config.overrides);
    }, 180);
  }
  async attachLocalEditor(host) {
    const id = this.config.template, generation = this.renderGeneration;
    const loading = el('p', 'Originaler Karteneditor wird geladen …', host);
    try {
      const resolved = resolveTemplate(this.state.library, id, this.config.overrides);
      const {editor, cache} = await cachedOriginalEditor(this, id, this._hass, resolved, this.lovelace);
      if (!host.isConnected || generation !== this.renderGeneration || id !== this.config.template) return;
      if (cache.listener) editor.removeEventListener('config-changed', cache.listener);
      updateOriginalEditor(editor, cache, this._hass, resolveTemplate(this.state.library, id, this.config.overrides), this.lovelace);
      this.editor = editor;
      cache.listener = event => {
        event.stopPropagation(); if (!host.isConnected || !event.detail?.config) return;
        try {
          if (event.detail.error) throw Error(event.detail.error);
          if (host.editorError) host.editorError.textContent = '';
          validateCard(event.detail.config);
          if (JSON.stringify(event.detail.config) === cache.signature) return;
          const overrides = editorOverrides(this.state.library, id, this.config.overrides, event.detail.config);
          const normalized = resolveTemplate(this.state.library, id, overrides);
          const normalizedSignature = JSON.stringify(normalized);
          const changed = JSON.stringify(overrides) !== JSON.stringify(this.config.overrides || []);
          if (changed) this.config.overrides = overrides;
          if (host.editorError) host.editorError.textContent = '';
          // Restore protected fields in the visible native form as well as in
          // storage. Ordinary keystrokes keep the existing form untouched.
          if (event.detail.config.type !== normalized.type || this.state.library.templates[id].bindings?.some(binding => JSON.stringify(getAt(event.detail.config, binding.path)) !== JSON.stringify(getAt(normalized, binding.path)))) {
            cache.signature = JSON.stringify(event.detail.config);
            this.syncLocalEditor();
          }
          cache.signature = normalizedSignature;
          if (!changed) return;
          this.changed(); this.schedulePreview();
          if (host.editorError) host.editorError.textContent = '';
        } catch (error) {
          host.editorError ||= el('p', undefined, host); host.editorError.textContent = error.message || String(error);
        }
      };
      editor.addEventListener('config-changed', cache.listener);
      loading.textContent = ''; loading.remove?.();
      mountOriginalEditor(host, editor);
    } catch (error) { loading.textContent = ''; if (host.isConnected && generation === this.renderGeneration) el('p', 'Originaler Editor nicht verfügbar: ' + (error.message || String(error)), host); }
  }
  syncLocalEditor() {
    if (!this.editor?.isConnected || !this.originalEditorCache) return;
    try {
      updateOriginalEditor(this.editor, this.originalEditorCache, this._hass,
        resolveTemplate(this.state.library, this.config.template, this.config.overrides), this.lovelace);
    } catch (error) {
      // A third-party editor failure must not swallow an accepted local change.
      reloadOriginalEditor(this, error);
    }
  }
  localYamlPanel(parent) {
    const section = el('details', undefined, parent); el('summary', 'Vollständige lokale Konfiguration (YAML)', section);
    whenOpen(section, () => {
      el('p', 'Komplette Karten-YAML bearbeiten. Nur Änderungen gelten lokal; übrige Felder bleiben verknüpft. Zentrale Bindungen und der Kartentyp sind geschützt.', section);
      const source = field(section, 'Lokale Kartenkonfiguration (YAML)', 'textarea'); source.rows = 20;
      source.setAttribute('style', 'width:100%;box-sizing:border-box;font-family:monospace');
      const status = el('p', undefined, section); status.setAttribute('aria-live', 'polite');
      let loadedSignature;
      const templateId = this.config.template;
      const load = () => {
        const config = resolveTemplate(this.state.library, templateId, this.config.overrides);
        source.value = configurationYaml(config); loadedSignature = JSON.stringify(config);
        this.localYamlDraft = null;
      };
      const draft = this.localYamlDraft;
      if (draft?.template === templateId) { source.value = draft.text; loadedSignature = draft.baseline; }
      else load();
      source.oninput = () => {
        if (this.config.template === templateId) this.localYamlDraft = {template: templateId, text: source.value, baseline: loadedSignature};
      };
      button(section, 'Aktuelle Konfiguration laden', load);
      const apply = button(section, 'YAML lokal übernehmen', async () => {
        if (apply.disabled) return;
        const generation = this.renderGeneration, id = this.config.template;
        const baseline = JSON.stringify(resolveTemplate(this.state.library, id, this.config.overrides));
        if (baseline !== loadedSignature) { status.textContent = 'Die Konfiguration wurde inzwischen geändert. Aktuelle Konfiguration laden und Änderungen erneut eintragen.'; return; }
        apply.disabled = true; status.textContent = 'Konfiguration wird geprüft …';
        try {
          const edited = await this._hass.callWS({type:'card_library/parse_card', yaml:source.value});
          if (generation !== this.renderGeneration || id !== this.config.template || !section.isConnected) return;
          if (baseline !== JSON.stringify(resolveTemplate(this.state.library, id, this.config.overrides))) throw Error('Die Konfiguration wurde inzwischen geändert. Aktuelle Konfiguration laden und Änderungen erneut eintragen.');
          if (edited.type !== resolveTemplate(this.state.library, id, this.config.overrides).type) throw Error('Der oberste Kartentyp wird von der Vorlage bestimmt.');
          this.config.overrides = editorOverrides(this.state.library, id, this.config.overrides, edited);
          this.syncLocalEditor();
          loadedSignature = JSON.stringify(resolveTemplate(this.state.library, id, this.config.overrides));
          this.localYamlDraft = null;
          this.changed(); this.schedulePreview(); status.textContent = 'Lokale Konfiguration übernommen. Anschließend das Dashboard speichern.';
        } catch (error) { if (generation === this.renderGeneration) status.textContent = error.message || String(error); }
        finally { apply.disabled = false; }
      }); apply.className = 'primary';
    });
  }
  localStylePanel(parent) {
    const section = el('details', undefined, parent); el('summary', 'Zusätzliche lokale Styles', section);
    whenOpen(section, () => {
      el('p', 'Nur CSS eintragen. card_mod.style benötigt card-mod; style_ha_card funktioniert nur in Karten, die dieses Feld unterstützen.', section);
      const templateId = this.config.template;
      const prefix = resolveTemplate(this.state.library, this.config.template, this.config.overrides).type === 'custom:library-container-card' ? 'card.' : '';
      const pathInput = field(section, 'Feldpfad'); pathInput.value = this.stylePath || prefix + 'card_mod.style';
      pathInput.placeholder = 'cards.0.card_mod.style';
      const cssInput = field(section, 'CSS', 'textarea'); cssInput.rows = 10;
      const status = el('p', undefined, section); status.setAttribute('aria-live', 'polite');
      const path = () => pathInput.value.trim().split('.').map(key => /^(0|[1-9][0-9]*)$/.test(key) ? Number(key) : key);
      const load = () => {
        try {
          const value = getAt(resolveTemplate(this.state.library, this.config.template, this.config.overrides), path());
          cssInput.value = typeof value === 'string' ? value : '';
          status.textContent = value !== undefined && typeof value !== 'string' ? 'Dieses Feld enthält keinen CSS-Text. Einen untergeordneten Style-Pfad auswählen.' : '';
        } catch (error) { status.textContent = error.message; }
      };
      for (const [key, label] of [['card_mod.style', 'card-mod'], ['style_ha_card', 'style_ha_card']]) {
        button(section, label, () => { pathInput.value = prefix + key; this.stylePath = pathInput.value; this.localStyleDraft = null; load(); });
      }
      const remember = () => {
        if (this.config.template === templateId) this.localStyleDraft = {template: templateId, path: pathInput.value, text: cssInput.value};
      };
      pathInput.oninput = remember; cssInput.oninput = remember;
      pathInput.onchange = () => { this.stylePath = pathInput.value; load(); remember(); };
      const draft = this.localStyleDraft;
      if (draft?.template === templateId) { pathInput.value = draft.path; cssInput.value = draft.text; }
      else load();
      const apply = inherit => {
        try {
          const keys = path();
          if (!keys.length || keys.some(key => key === '')) throw Error('Einen gültigen Feldpfad eingeben.');
          const current = getAt(resolveTemplate(this.state.library, this.config.template, this.config.overrides), keys);
          if (!inherit && current !== undefined && typeof current !== 'string') throw Error('Dieses Feld enthält keinen CSS-Text. Einen untergeordneten Style-Pfad auswählen.');
          this.config.overrides = updateLocalField(this.state.library, this.config.template, this.config.overrides, keys, cssInput.value, inherit, true);
          this.stylePath = pathInput.value; this.localStyleDraft = null;
          this.syncLocalEditor();
          this.changed(); this.schedulePreview();
          status.textContent = inherit ? 'Style wieder mit der Vorlage verknüpft.' : 'Style für diese Dashboard-Stelle übernommen.';
          if (inherit) load();
        } catch (error) { status.textContent = error.message || String(error); }
      };
      button(section, 'Style lokal übernehmen', () => apply(false)).className = 'primary';
      button(section, 'Style wieder aus Vorlage übernehmen', () => apply(true));
    });
  }
  definedInputPanel(parent,resolved) {
    this.definedInputPickers=[];
    const template=this.state.library.templates[this.config.template],definitions=template.inputs || [];
    if(!definitions.length)return;
    const section=el('details',undefined,parent);section.open=true;el('summary','Eingaben dieser Verwendung',section);
    el('p','Nur diese Werte werden örtlich angepasst. Gestaltung und weitere Einstellungen bleiben verknüpft.',section);
    const id=this.config.template,state=this.state;
    for(const definition of definitions){
      const value=getAt(resolved,definition.path),row=el('div',undefined,section),label=definition.label+(definition.required?' *':'');let input;
      const apply=(next,inherit=false)=>{
        if(this._detached||!input.isConnected||this.config.template!==id)return;
        try{this.assertLibraryConnection(state);this.config.overrides=updateLocalField(this.state.library,id,this.config.overrides,definition.path,next,inherit,true);this.syncLocalEditor();this.changed();this.schedulePreview();status.textContent=inputErrors(template,resolveTemplate(this.state.library,id,this.config.overrides)).join(' · ');if(inherit){const current=getAt(resolveTemplate(this.state.library,id,this.config.overrides),definition.path);if(definition.type==='boolean')input.checked=current;else input.value=current ?? '';}}
        catch(error){status.textContent=error.message;}
      };
      if(definition.type==='entity'&&customElements.get('ha-entity-picker')){
        input=el('ha-entity-picker',undefined,row);input.hass=this._hass;input.label=label;input.value=value ?? '';input.includeDomains=definition.domains;input.allowCustomEntity=true;this.definedInputPickers.push(input);
        input.addEventListener('value-changed',event=>{if(event.target!==input)return;event.stopPropagation();input.value=event.detail.value ?? '';apply(input.value);});
      }else if(definition.type==='select')input=select(row,[['','Bitte wählen'],...definition.options.map(option=>[option,option])],value ?? '',next=>apply(next),label);
      else{input=field(row,label,'input',true,definition.type==='boolean'?'checkbox':definition.type==='number'?'number':'text');if(definition.type==='boolean')input.checked=Boolean(value);else input.value=value ?? '';input.onchange=()=>apply(definition.type==='boolean'?input.checked:definition.type==='number'?(input.value===''?null:Number(input.value)):input.value);}
      input.required=Boolean(definition.required);const status=el('p','',row);status.className='hint';button(row,'Wert aus Vorlage übernehmen',()=>apply(undefined,true));
    }
    for(const error of inputErrors(template,resolved))el('p',error,section).className='error';
  }
  buttonVariablePanel(parent, resolved) {
    this.buttonVariablePickers = [];
    if (resolved.type !== 'custom:button-card' || !resolved.variables || Array.isArray(resolved.variables) || typeof resolved.variables !== 'object') return;
    const definitions = this.state.library.templates[this.config.template].inputs || [];
    const variables = Object.entries(resolved.variables).filter(([key,value]) => !definitions.some(input=>overlap(input.path,['variables',key])) && ( value == null || ['string','number','boolean'].includes(typeof value)));
    if (!variables.length) return;
    const section = el('details', undefined, parent); section.open = true;
    el('summary', 'Entitäten und Variablen dieser Verwendung', section);
    el('p', 'Hier nur Entitäten, Name und weitere Variablen festlegen. Gestaltung und Logik bleiben mit der Vorlage verknüpft.', section);
    const state = this.state, id = this.config.template;
    const captions = {entity_cover:'Rollladen',entity_modus:'Automatikmodus',entity_beschattung:'Beschattungsmodus',entity_override_auto:'Lokale Automatik-Ausnahme',entity_override_besch:'Lokale Beschattungs-Ausnahme',friendly_name:'Anzeigename',nav_anchor:'Popup-Hash ohne #'};
    for (const [key,value] of variables) {
      const path = ['variables',key], row = el('div', undefined, section);
      const locked = this.state.library.templates[id].bindings?.some(binding => overlap(binding.path,path));
      let input;
      if ((key === 'entity' || key.startsWith('entity_')) && customElements.get('ha-entity-picker') && typeof value === 'string' && !value.includes('[[[')) {
        input = el('ha-entity-picker',undefined,row); input.hass = this._hass; input.label = captions[key] || key; input.value = value; input.allowCustomEntity = true; this.buttonVariablePickers.push(input);
        if (key === 'entity_cover') input.includeDomains = ['cover'];
      } else {
        input = field(row,captions[key] || key,'input',true,typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text');
        if (typeof value === 'boolean') input.checked = value; else input.value = value ?? '';
      }
      input.disabled = Boolean(locked);
      const status = el('p','',row); status.className = 'hint';
      const update = (next, inherit=false) => {
        if (this._detached || !input.isConnected) return;
        try {
          this.assertLibraryConnection(state);
          if (this.config.template !== id) throw Error('Die Vorlagenauswahl wurde geändert.');
          this.config.overrides = updateLocalField(this.state.library,id,this.config.overrides,path,next,inherit);
          this.syncLocalEditor(); this.changed(); this.schedulePreview(); status.textContent = inherit ? 'Wieder mit Vorlage verknüpft.' : 'Örtliche Änderung. Anschließend das Dashboard speichern.';
          if (inherit) { const current = getAt(resolveTemplate(this.state.library,id,this.config.overrides),path); if (typeof value === 'boolean') input.checked = current; else input.value = current ?? ''; }
        } catch (error) { status.textContent = error.message; }
      };
      if (input.tagName?.toLowerCase() === 'ha-entity-picker') input.addEventListener('value-changed',event => { if (event.target !== input) return; event.stopPropagation(); input.value = event.detail.value ?? ''; update(input.value); });
      else input.onchange = () => update(typeof value === 'boolean' ? input.checked : typeof value === 'number' ? Number(input.value) : input.value);
      const reset = button(row,'Wert aus Vorlage übernehmen',()=>update(undefined,true)); reset.disabled = Boolean(locked);
    }
  }
  changed() { this.popupUsageRefresh?.(); this.dispatchEvent(new CustomEvent('config-changed', {detail: {config: clone(this.config)}, bubbles: true, composed: true})); }
  render() {
    if (this._detached) return;
    this.libraryRenderState = this.state;
    this.libraryRenderSignature = this.libraryViewSignature();
    this.popupUsageRefresh = null;
    if (!this.config) return;
    if (this.showUnavailable('Vorlage auswählen')) return;
    const card = this.shell('Vorlagenkarte');
    if (this.notice) el('p', this.notice, card).className = 'error';
    const admin = this._hass.user?.is_admin && !this.usageEditing;
    if (!admin) this.manage = false;
    const tabs = el('nav', undefined, card); tabs.className = 'library-nav workflow-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Vorlagenkarte');
    for (const [manage, label] of [[false, 'Vorlagen einsetzen'], ...(admin ? [[true, 'Konfiguration']] : [])]) {
      const tab = button(tabs, label, () => { this.manage = manage; this.notice = ''; this.render(); });
      tab.className = Boolean(this.manage) === manage ? 'nav-active' : '';
      tab.id = manage ? 'library-configuration-tab' : 'library-insertion-tab';
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(Boolean(this.manage) === manage));
      tab.tabIndex = Boolean(this.manage) === manage ? 0 : -1;
      tab.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        this.manage = admin && (event.key === 'End' || (event.key !== 'Home' && !manage));
        this.render();
        this.shadowRoot.querySelector?.('#' + (this.manage ? 'library-configuration-tab' : 'library-insertion-tab'))?.focus();
      };
      tab.setAttribute('aria-controls', manage ? 'library-configuration-panel' : 'library-insertion-panel');
    }
    const panel = el('div', undefined, card); panel.className = 'workflow-panel'; panel.id = this.manage ? 'library-configuration-panel' : 'library-insertion-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', this.manage ? 'library-configuration-tab' : 'library-insertion-tab');
    if (this.manage) {
      el('p', 'Vorlagen zentral verwalten. Gespeicherte Änderungen gelten für alle verknüpften Verwendungen.', panel).className = 'workflow-description';
      this.manager ||= document.createElement('library-manager');
      this.manager.embedded = true; this.manager.setConfig({type: 'custom:library-manager'});
      this.manager.onUseTemplate = id => {
        this.config.template = id; this.resetLocalContext(); this.notice = ''; this.config.overrides = []; this.manage = false;
        this.changed(); this.render();
      };
      panel.append(this.manager); this.manager.hass = this._hass;
      return;
    }
    el('p', 'Vorlage auswählen. Lokale Änderungen gelten nur für diese Verwendung; übrige Felder bleiben verknüpft.', panel).className = 'workflow-description';
    const selection = el('fieldset', undefined, panel); el('legend', 'Vorlage auswählen', selection);
    const templateSelect = select(selection, [['', 'Vorlage auswählen'], ...Object.entries(this.state.library.templates).map(([id, t]) => [id, t.name])], this.config.template, id => {
      this.config.template = id; this.resetLocalContext(); this.notice = ''; this.config.overrides = []; this.changed(); this.render();
    });
    templateSelect.disabled = Boolean(this.usageEditing);
    if (!Object.keys(this.state.library.templates).length) el('p', admin ? 'Noch keine Vorlagen vorhanden. Im Reiter Konfiguration eine Vorlage erstellen oder importieren.' : 'Ein Administrator muss zuerst Vorlagen erstellen oder importieren.', panel);
    if (!this.config.template) return;
    // Recovery must stay available even if old overrides no longer resolve.
    const reset = () => { this.config.overrides = []; this.resetLocalContext(); this.notice = ''; this.changed(); this.render(); };
    const inheritance = el('details', undefined, panel); el('summary', 'Übernahme aus der Vorlage', inheritance);
    button(inheritance, 'Alles aus Vorlage übernehmen', reset);
    button(inheritance, 'Lokale Anpassungen zurücksetzen', reset);
    try {
      const resolved = resolveTemplate(this.state.library, this.config.template, this.config.overrides);
      this.definedInputPanel(panel,resolved);
      this.buttonVariablePanel(panel, resolved);
      if(!this.usageEditing)popupUsage(panel, this, this.config.template, this.config.overrides || []);
      const previewSection = el('details', undefined, panel); el('summary', 'Vorschau dieser Verwendung', previewSection);
      this.localPreviewSection = previewSection;
      const preview = this.localPreview = el('div', undefined, previewSection);
      whenOpen(previewSection, () => this.previewCard(preview, this.state.library, this.config.template, this.config.overrides), true);
      button(inheritance, 'Nur markiertes Design übernehmen', () => {
        try { this.config.overrides = designOverrides(this.state.library, this.config.template, this.config.overrides); this.notice = ''; this.changed(); this.render(); }
        catch (error) { this.notice = error.message; this.render(); }
      });
      el('p', 'Markiertes Design bleibt zentral. Andere vorhandene Felder, auch Entitäten, werden lokal festgehalten. Zentrale Bindungen gelten weiter; neue Felder außerhalb lokaler Bereiche werden übernommen.', inheritance);
      const template = this.state.library.templates[this.config.template];
      const local = this.localEditorSection = el('details', undefined, panel); local.open = this.localEditing ?? Boolean(this.config.overrides?.length);
      el('summary', 'Örtliche Anpassungen', local);
      local.addEventListener('toggle', () => { this.localEditing = local.open; if (local.open && this.editor?.isConnected) this.editor.hass = this._hass; });
      el('p', 'Originaleditor für diese Verwendung. Änderungen gelten nur hier.', local);
      const nativeHost = el('div', undefined, local); whenOpen(local, () => this.attachLocalEditor(nativeHost));
      this.localStylePanel(local);
      this.localYamlPanel(local);
      const advanced = el('details', undefined, panel); el('summary', 'Weitere Einstellungen und Feldverknüpfungen', advanced); advanced.open = Boolean(this.localPath) || advanced.open;
      whenOpen(advanced, () => tree(advanced, resolveTemplate(this.state.library, this.config.template, this.config.overrides), (path, value) => {
        if (path[0] === 'type' || template.bindings?.some(b => overlap(b.path, path))) { this.notice = 'Dieses Feld wird zentral verwaltet.'; this.render(); return; }
        try { this.config.overrides = updateLocalField(this.state.library, this.config.template, this.config.overrides, path, value); this.notice = ''; this.changed(); }
        catch (error) { this.notice = error.message; }
        this.schedulePreview();
      }, path => { this.localPath = path; this.render(); }));
      if (this.localPath && this.localPath[0] !== 'type') {
        const path = this.localPath;
        const locked = template.bindings?.some(b => overlap(b.path, path));
        el('p', 'Ausgewählt: ' + path.join(' → '), advanced);
        const local = this.config.overrides?.some(o => overlap(o.path, path));
        el('p', locked ? 'Zentral verbindlich' : local ? 'Individueller Wert' : 'Mit Vorlage verknüpft', advanced);
        button(advanced, 'Feld individuell festhalten', () => {
          if (locked) { this.notice = 'Dieses Feld wird zentral verwaltet.'; this.render(); return; }
          try { this.config.overrides = updateLocalField(this.state.library, this.config.template, this.config.overrides, path, getAt(resolveTemplate(this.state.library, this.config.template, this.config.overrides), path)); this.notice = ''; this.changed(); }
          catch (error) { this.notice = error.message; }
          this.render();
        });
        button(advanced, 'Feld wieder aus Vorlage übernehmen', () => {
          try { this.config.overrides = updateLocalField(this.state.library, this.config.template, this.config.overrides, path, undefined, true); this.notice = ''; this.changed(); }
          catch (error) { this.notice = error.message; }
          this.render();
        });
      }
    } catch (error) { this.fail(error); }
  }
}
class LibraryManager extends Base {
  static getConfigElement() { return document.createElement('library-manager-editor'); }
  static getStubConfig() { return {}; }
  setConfig(config) { this.config = config; }
  getCardSize() { return 8; }
  draftConflict() {
    if (!this.dirty || !this.state?.library) return '';
    if (this.draftState && this.draftState !== this.state) return 'Der Entwurf stammt aus einer vorherigen HA-Verbindung. Vor dem Speichern den Entwurf gegebenenfalls exportieren und neu laden.';
    return this.state.library.revision !== this.draft.revision ? 'Die Bibliothek wurde anderswo geändert. Entwurf verwerfen und neu laden, bevor du weiterarbeitest.' : '';
  }
  libraryChanged() {
    if (this.saving) return;
    if (this.dirty && this.liveUI && this.state.library) {
      if (this.conflictNode) this.conflictNode.textContent = this.draftConflict();
      this.popupUsageRefresh?.();
      return;
    }
    if (!this.dirty && this.state.library) { this.draft = clone(this.state.library); this.draftState = this.state; }
    this.render();
  }
  edit() {
    this.dirty = true;
    if (this.useButton) this.useButton.disabled = true;
    if (this.saveButton) this.saveButton.disabled = false;
    if (this.statusBadge) this.statusBadge.textContent = 'Ungespeicherte Änderungen';
    this.popupRouteRefresh?.();
    this.popupUsageRefresh?.();
  }
  async save() {
    if (this.saving || this.busy || !this.draft || !this.state?.library) return; this.saving = true;
    const state = this.state, hass = this._hass, candidate = clone(this.draft); this.render();
    try {
      this.assertLibraryConnection(this.draftState || state);
      importLibrary({format:'ha-card-library', version:2, library:{templates:candidate.templates,groups:candidate.groups,people:candidate.people || {}}});
      await this.checkRemovedTemplates(candidate);
      this.assertLibraryConnection(state);
      const result = await hass.callWS({type: 'card_library/save', revision: candidate.revision,
        library: {templates: candidate.templates, groups: candidate.groups, people: candidate.people || {}}});
      this.assertLibraryConnection(state);
      // Subscription snapshots may advance again before the save reply arrives.
      // The acknowledged save must not replace a newer authoritative revision.
      this.draft = clone(this.state.library?.revision > result.revision ? this.state.library : result);
      this.draftState = this.state;
      this.dirty = false; this.notice = 'Gespeichert. Verknüpfte Karten wurden aktualisiert.';
    } catch (error) { this.notice = error.message || String(error); }
    this.saving = false; this.render();
  }
  render() {
    if (this._detached) return;
    this.liveUI = false;
    this.popupRouteRefresh = null;
    this.popupUsageRefresh = null;
    const card = this.shell('Konfiguration · Kartenbibliothek');
    if (!this._hass?.user?.is_admin) { el('p', 'Die Verwaltung ist nur für Administratoren verfügbar.', card); return; }
    if (!this.state?.library) { this.showUnavailable('Kartenbibliothek'); return; }
    if (!this.draft) { this.fail(this.state?.error || Error('Bibliothek wird geladen …')); return; }
    this.liveUI = true;
    el('p', 'Hier zentrale Vorlagen verwalten. Lokale Änderungen unter „Vorlagen einsetzen“ festlegen.', card).className = 'workflow-description';
    if (this.notice) el('p', this.notice, card);
    if (this.saving || this.busy) { el('p', 'Vorgang läuft …', card); return; }
    this.conflictNode = el('p', this.draftConflict(), card); this.conflictNode.className = 'error';
    const saveBar = el('div', undefined, card); saveBar.className = 'save-bar';
    this.statusBadge = el('span', this.dirty ? 'Ungespeicherte Änderungen' : 'Alles gespeichert', saveBar); this.statusBadge.className = 'status-badge'; this.statusBadge.setAttribute('aria-live', 'polite');
    this.saveButton = button(saveBar, 'Zentrale Änderungen speichern', () => this.save()); this.saveButton.className = 'primary'; this.saveButton.disabled = !this.dirty;
    const review=button(saveBar,'Änderungsvorschau',()=>{this.mode='review';this.render();if(!this.inventory)this.scan();});review.disabled=!this.dirty;
    if (this.renderTools(card)) return;
    const mode = this.mode || 'templates';
    if(mode==='templates')this.templateFilters(card);
    select(card, [['', mode === 'groups' ? 'Einstellung auswählen' : 'Vorlage auswählen'], ...(mode==='templates'?this.filteredTemplates():Object.entries(this.draft[mode])).map(([id, t]) => [id, t.name])], this.selected, id => { this.selected = id; this.path = null; this.groupPath = null; this.inputDraft=null;this.inputEditingPath=null;this.render(); });
    const item = this.draft[mode][this.selected];
    if (!item) {
      el('p', mode === 'templates' ? 'Vorlage auswählen oder unter „Vorlage hinzufügen“ eine Karte erstellen bzw. übernehmen.' : 'Gemeinsame Einstellung auswählen. Neue Einstellungen in der Vorlage verknüpfen.', card);
      return;
    }
    const name = field(card, mode === 'groups' ? 'Name der Einstellung' : 'Name der Vorlage'); name.value = item.name; name.setAttribute('aria-label', 'Name');
    name.readOnly=Boolean(mode==='templates'&&(item.protected||this.state.library.templates[this.selected]?.protected));
    name.onchange = () => { if(!name.readOnly){item.name = name.value; this.edit();} };
    const itemActions = el('details', undefined, card); itemActions.className = 'item-actions'; el('summary', mode === 'groups' ? 'Einstellungsaktionen' : 'Vorlagenaktionen', itemActions);
    button(itemActions, 'Löschen', () => this.run(() => this.deleteItem(mode, this.selected))).className = 'danger';
    if (mode === 'groups') {
      el('p', 'Änderungen gelten für alle unten aufgeführten Vorlagen.', card);
      tree(card, item.value, (path, value) => { if (path.length) setAt(item.value, path, value); else item.value = value; this.edit(); }, path => { this.groupPath = path; this.render(); });
      this.groupFieldTools(card, item);
      for (const t of Object.values(this.draft.templates)) if (t.bindings?.some(b => b.group === this.selected)) el('p', 'Verwendet von: ' + t.name, card);
      return;
    }
    try { resolveTemplate(this.draft,this.selected); } catch (error) { el('p', error.message || String(error), card).className='error'; return; }
    if(this.protectionPanel(card,item))return;
    this.metadataPanel(card,item);
    el('p', 'Kartentyp: ' + item.config.type, card);
    el('h3', 'Zentrale Vorlage bearbeiten', card);
    popupRouteSettings(card, this, item);
    const editorHost = el('div', undefined, card); this.attachEditor(editorHost, item);
    const previewSection = el('details', undefined, card); el('summary', 'Kartenvorschau', previewSection);
    this.previewSection = previewSection;
    const previewHost = this.previewHost = el('div', undefined, previewSection);
    const previewId = this.selected;
    whenOpen(previewSection, () => this.previewCard(previewHost, this.draft, previewId), true);
    if (this.onUseTemplate) {
      this.useButton = button(card, 'Diese Vorlage verwenden', () => {
        if (this.dirty || !Object.hasOwn(this.state.library.templates,this.selected)) return;
        this.onUseTemplate(this.selected);
      });
      this.useButton.disabled = this.dirty || !Object.hasOwn(this.state.library.templates,this.selected);
    }
    const nativePopup = popupTemplateInfo(item.config)?.supported;
    el('p', nativePopup ? 'Popup über seinen Hash-Button öffnen.' : this.onUseTemplate ? 'Zentral speichern, dann „Diese Vorlage verwenden“ wählen.' : 'Für die Dashboard-Anzeige eine Vorlagenkarte mit dieser Vorlage einsetzen.', card);
    const insert = el('details', undefined, card); el('summary', 'Im Dashboard einbauen', insert);
    if (!nativePopup) {
      el('p', 'Zuerst zentral speichern. Diese Referenz zeigt den verknüpften Inhalt als Dashboard-Karte.', insert);
      const reference = field(insert, 'Dashboard-Referenz', 'textarea', false); reference.readOnly = true; reference.rows = 3;
      reference.value = 'type: custom:library-card\ntemplate: ' + JSON.stringify(this.selected);
      reference.setAttribute('aria-label', 'Dashboard-Referenz');
    } else el('p', 'Zuerst zentral speichern. Zum Öffnen genügt der Hash-Button.', insert);
    popupUsage(insert, this, this.selected);
    if (item.config.type === 'custom:library-container-card') {
      el('p', 'Den footer-Block in die Abschnitte-Ansicht einsetzen. Inhalt und Breite bleiben zentral; die Position steuert HA.', insert);
      const footer = field(insert, 'Fußzeilen-Referenz', 'textarea', false); footer.readOnly = true; footer.rows = 4;
      footer.value = 'footer:\n  card:\n    type: custom:library-card\n    template: ' + JSON.stringify(this.selected);
      footer.setAttribute('aria-label', 'Fußzeilen-Referenz');
    }
    this.templateTools(card, item);
    const controls = el('details', undefined, card); el('summary', 'Vorlagenfelder, Design und Verknüpfungen', controls); controls.open = Boolean(this.path) || controls.open;
    el('h3', 'Gemeinsame Einstellungen verknüpfen', controls);
    el('p', 'Wähle ein Feld oder einen ganzen Bereich, etwa die Liste mit Personen und Farben.', controls);
    whenOpen(controls, () => tree(controls, resolveTemplate(this.draft, this.selected), (path, value) => {
      if (path[0] === 'type') return;
      if (item.bindings?.some(b => overlap(b.path, path))) {
        this.notice = 'Dieses Feld bitte unter Gemeinsame Einstellungen bearbeiten.'; this.render(); return;
      }
      setAt(item.config, path, value); this.edit(); this.refreshPreview();
    }, path => { this.path = path; this.render(); }));
    if (item.design_paths?.length) {
      const designs = el('fieldset', undefined, controls); el('legend', 'Gespeicherte Designmarkierungen', designs);
      for (const path of item.design_paths) {
        const row = el('div', undefined, designs); el('span', path.join(' → '), row);
        button(row, 'Diese Designmarkierung entfernen', () => {
          item.design_paths = item.design_paths.filter(p => JSON.stringify(p) !== JSON.stringify(path)); this.edit(); this.render();
        });
      }
    }
    const fields = el('fieldset', undefined, controls);
    el('legend', 'Feld hinzufügen (auch für Karten ohne eigenen Editor)', fields);
    const parentPath = this.path && typeof getAt(item.config, this.path) === 'object' && getAt(item.config, this.path) !== null ? this.path : (this.path || []).slice(0, -1);
    el('p', 'Ziel: ' + (parentPath.join(' → ') || 'Kartenkonfiguration'), fields);
    const fieldName = field(fields, 'Neues Feld'); fieldName.placeholder = 'Feldname (bei Listen automatisch)';
    const fieldType = select(fields, [['string', 'Text'], ['number', 'Zahl'], ['boolean', 'Schalter'], ['object', 'Objekt'], ['array', 'Liste']], 'string', () => {});
    button(fields, 'Feld anlegen', () => {
      const parent = getAt(item.config, parentPath);
      if (!parent || typeof parent !== 'object') { this.notice = 'Der gewählte Zielbereich existiert nicht mehr. Bitte ein anderes Feld auswählen.'; this.render(); return; }
      const key = Array.isArray(parent) ? parent.length : fieldName.value.trim();
      if (key === '' || key === 'type' || ['__proto__', 'constructor', 'prototype'].includes(key)) return;
      const path = [...parentPath, key];
      if (item.bindings?.some(b => overlap(b.path, path))) { this.notice = 'Dieser Bereich wird zentral verwaltet.'; this.render(); return; }
      if (Object.hasOwn(parent, key)) { this.notice = 'Feld existiert bereits.'; this.render(); return; }
      setAt(item.config, path, {string: '', number: 0, boolean: false, object: {}, array: []}[fieldType.value]);
      this.edit(); this.render();
    });
    if (this.path && this.path[0] !== 'type') {
      this.personBindingTools(controls, item);
      el('p', 'Ausgewählt: ' + this.path.join(' → '), controls);
      const designPaths = item.design_paths || [];
      el('p', 'Designfelder: ' + (designPaths.map(p => p.join(' → ')).join(', ') || 'noch keine'), controls);
      button(controls, 'Auswahl als Design markieren', () => {
        item.design_paths = [...designPaths.filter(p => !overlap(p, this.path)), clone(this.path)]; this.edit(); this.render();
      });
      button(controls, 'Designmarkierung entfernen', () => {
        item.design_paths = designPaths.filter(p => !overlap(p, this.path)); this.edit(); this.render();
      });
      const groupName = field(controls, 'Name der gemeinsamen Einstellung'); groupName.placeholder = 'Name der gemeinsamen Einstellung';
      button(controls, 'Auswahl zentral speichern und verknüpfen', () => {
        if (!groupName.value.trim()) return;
        const id = newId();
        const value = getAt(resolveTemplate(this.draft, this.selected), this.path);
        if (value === undefined) { this.notice = 'Das ausgewählte Feld existiert nicht mehr.'; this.render(); return; }
        this.draft.groups[id] = {name: groupName.value.trim(), value: clone(value)};
        if (!this.bind(item, id)) { delete this.draft.groups[id]; this.render(); return; }
        this.edit(); this.render();
      });
      const groupChoice = select(card, [['', 'Bestehende Einstellung wählen'], ...Object.entries(this.draft.groups).map(([id, g]) => [id, g.name])], '', () => {});
      button(controls, 'Hier verknüpfen', () => { if (!groupChoice.value) return; this.bind(item, groupChoice.value); this.edit(); this.render(); });
    }
    for (const binding of item.bindings || []) {
      const row = el('div', undefined, controls);
      el('span', `${binding.path.join(' → ')} ← ${binding.person ? this.draft.people[binding.person]?.name + ' / ' + binding.field : this.draft.groups[binding.group]?.name}`, row);
      button(row, 'Verknüpfung lösen', () => {
        setAt(item.config, binding.path, bindingValue(this.draft, binding));
        item.bindings = item.bindings.filter(b => b !== binding); this.edit(); this.render();
      });
    }
    button(itemActions, 'Vorlage duplizieren', () => {
      const id = newId(); this.draft.templates[id] = clone(item);
      delete this.draft.templates[id].popup;
      delete this.draft.templates[id].popup_links;
      if (popupTemplateInfo(resolveTemplate(this.draft, id))?.supported) {
        this.draft.templates[id].popup = {hash:'#popup-' + id, ...(item.popup?.options ? {options:clone(item.popup.options)} : {})};
      }
      this.draft.templates[id].name += ' – Kopie'; this.selected = id; this.edit(); this.render();
    });
  }
  refreshPreview() {
    clearTimeout(this.previewTimer);
    const host = this.previewHost;
    if (host) this.previewTimer = setTimeout(() => {
      if (host.isConnected && host === this.previewHost && this.previewSection?.open) this.previewCard(host, this.draft, this.selected);
    }, 180);
  }
  async createTemplate(type) {
    return this.run(async () => {
      const constructor = await cardConstructor(this._hass, {type});
      const stub = constructor?.getStubConfig ? await constructor.getStubConfig(this._hass, [], []) : {};
      this.addTemplate({...(['horizontal-stack', 'vertical-stack', 'grid'].includes(type) ? {cards: []} : {}), ...stub, type});
    });
  }
  applyBinding(item, binding) {
    try {
      const next = clone(item.config);
      setAt(next, binding.path, bindingValue(this.draft, binding));
      validateCard(next);
      const bindings = (item.bindings || []).filter(b => !overlap(b.path, binding.path));
      item.config = next; item.bindings = [...bindings, clone(binding)];
      this.notice = ''; return true;
    } catch (error) { this.notice = error.message || String(error); return false; }
  }
  bind(item, group) { return this.applyBinding(item, {path: clone(this.path), group}); }
  async newCard(card) {
    try {
      await window.loadCardHelpers();
      if (!card.isConnected) return;
      const host = el('fieldset', undefined, card);
      el('legend', 'Karte hinzufügen', host);
      const standardSection = el('details', undefined, host); standardSection.open = true; el('summary', 'Home-Assistant-Karten', standardSection);
      const standard = select(standardSection, [['', 'HA-Karte wählen'], ...STANDARD_CARDS], '', () => {});
      button(standardSection, 'HA-Karte hinzufügen', () => { if (standard.value) return this.createTemplate(standard.value); });
      // HA's full picker is shown when already loaded; the explicit list always works.
      if (customElements.get('hui-card-picker')) {
        this.picker = document.createElement('hui-card-picker');
        this.picker.hass = this._hass; this.picker.lovelace = this.lovelace || {config: {views: []}};
        this.picker.addEventListener('config-changed', event => {
          event.stopPropagation(); const config = event.detail?.config;
          if (!host.isConnected || !config?.type) return;
          if (Object.keys(config).length === 1) this.createTemplate(config.type); else this.addTemplate(config);
        });
        const pickerSection = el('details', undefined, standardSection); el('summary', 'Originale HA-Kartenauswahl', pickerSection);
        const pickerMount = el('div', undefined, pickerSection); pickerMount.append(this.picker);
      }
      const customSection = el('details', undefined, host); el('summary', 'Installierte Custom Cards', customSection);
      const registered = (window.customCards || []).filter(card => !['library-card', 'library-manager'].includes(card.type));
      if (registered.length) {
        const choice = select(customSection, [['', 'Registrierte Custom Card wählen'], ...registered.map(card => [card.type, card.name || card.type])], '', () => {});
        button(customSection, 'Registrierte Karte hinzufügen', () => { if (choice.value) this.createTemplate(choice.value.startsWith('custom:') ? choice.value : 'custom:' + choice.value); });
      }
      const manual = el('details', undefined, customSection); el('summary', 'Kartentyp manuell hinzufügen', manual);
      el('p', 'Manuell geladene Custom Cards: Den registrierten Typ eingeben, z. B. custom:deine-karte.', manual);
      const type = field(manual, 'Manueller Kartentyp'); type.placeholder = 'custom:…';
      button(manual, 'Kartentyp hinzufügen', () => { if (type.value.trim()) this.createTemplate(type.value.trim()); });
    } catch (error) { this.fail(error); }
  }
  addTemplate(config) {
    try { validateCard(config); } catch (error) { this.notice = error.message || String(error); this.render(); return null; }
    const id = newId();
    this.draft.templates[id] = {name: config.type === 'custom:library-container-card' ? 'Kopf-/Fußzeile' : config.type, config: clone(config), bindings: []};
    this.selected = id; this.mode = 'templates'; this.path = null; this.edit(); this.render();
    return id;
  }
  async attachEditor(host, item) {
    const generation = this.renderGeneration, id = this.selected;
    const loading = el('p', 'Originaler Karteneditor wird geladen …', host);
    try {
      const resolved = resolveTemplate(this.draft, id);
      const {editor, cache} = await cachedOriginalEditor(this, id, this._hass, resolved, this.lovelace);
      if (!host.isConnected || generation !== this.renderGeneration || id !== this.selected) return;
      if (cache.listener) editor.removeEventListener('config-changed', cache.listener);
      updateOriginalEditor(editor, cache, this._hass, resolveTemplate(this.draft, id), this.lovelace);
      this.editor = editor;
      cache.listener = event => {
        event.stopPropagation();
        const config = event.detail?.config;
        if (!host.isConnected || !config || (config.type && config.type !== item.config.type)) return;
        try {
          if (event.detail.error) throw Error(event.detail.error);
          if (host.editorError) host.editorError.textContent = '';
          const submitted = {...config, type:item.config.type};
          validateCard(submitted);
          if (JSON.stringify(config) === cache.signature) return;
          const next = clone(submitted);
          restoreBindings(this.draft, id, next);
          validateCard(next);
          const normalizedSignature = JSON.stringify(next);
          const changed = JSON.stringify(next) !== JSON.stringify(resolveTemplate(this.draft, id));
          if (changed) { item.config = next; this.edit(); }
          if (host.editorError) host.editorError.textContent = '';
          if (config.type !== next.type || item.bindings?.some(binding => JSON.stringify(getAt(config, binding.path)) !== JSON.stringify(getAt(next, binding.path)))) {
            cache.signature = JSON.stringify(config);
            try { updateOriginalEditor(editor, cache, this._hass, next, this.lovelace); }
            catch (error) { reloadOriginalEditor(this, error); }
          }
          cache.signature = normalizedSignature;
          if (changed) this.refreshPreview();
        } catch (error) {
          host.editorError ||= el('p', undefined, host); host.editorError.className='error';
          host.editorError.textContent = error.message || String(error);
        }
      };
      editor.addEventListener('config-changed', cache.listener);
      loading.textContent = ''; loading.remove?.();
      mountOriginalEditor(host, editor);
    } catch (error) { loading.textContent = ''; if (host.isConnected && generation === this.renderGeneration) el('p', 'Karteneditor nicht verfügbar: ' + (error.message || error), host); }
  }
}
installTools(LibraryManager, {el, field, button, select, tree, whenOpen});
installWorkflows(LibraryManager, {el,field,button,select,whenOpen});
LibraryEditor.prototype.previewCard = LibraryManager.prototype.previewCard;
class LibraryManagerEditor extends LibraryManager {}
customElements.define('library-container-card', LibraryContainerCard);
customElements.define('library-card', LibraryCard);
customElements.define('library-card-editor', LibraryEditor);
customElements.define('library-manager', LibraryManager);
customElements.define('library-manager-editor', LibraryManagerEditor);
window.customCards = window.customCards || [];
window.customCards.push({type: 'library-card', name: 'Vorlagenkarte', description: 'Zentrale Kartenvorlage mit gemeinsamen Einstellungen', preview: false});
window.customCards.push({type: 'library-manager', name: 'Kartenbibliothek', description: 'Vorlagen und gemeinsame Einstellungen grafisch verwalten', preview: false});
