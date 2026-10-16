import {clone, getAt, popupTemplateInfo, popupTemplateRoute, resolveTemplate, validateJson, validatePopupContent} from './library-core.js?v=1.0.0';
import {configurationYaml} from './library-tools.js?v=1.0.0';

function popupOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ['type', 'card_type', 'hash', 'cards'].some(key => Object.hasOwn(value, key))) throw Error('Ungültige Popup-Einstellungen');
  validateJson(value); return clone(value);
}

export function templateYamlConfig(library, id, hash = '') {
  const template = Object.hasOwn(library.templates, id) ? library.templates[id] : null;
  if (!template) throw Error('Vorlage fehlt: ' + id);
  const links = hash ? (template.popup_links || []).filter(link => link.hash === hash) : [];
  if (hash && links.length !== 1) throw Error('Die gespeicherte Hash-Variante existiert nicht mehr oder ist nicht eindeutig.');
  const link = links[0], config = resolveTemplate(library, id, link?.overrides ?? []);
  const native = popupTemplateInfo(config);
  if (hash) {
    validatePopupContent(config);
    const options = {...popupOptions(template.popup?.options), ...popupOptions(link.options)};
    if (native) Object.assign(getAt(config, native.path), options, {hash});
    else return {...options, type:'custom:bubble-card', card_type:'pop-up', hash, cards:[config]};
  } else if (native?.supported) {
    const route = popupTemplateRoute(library, template);
    if (route) Object.assign(getAt(config, native.path), popupOptions(route.options), {hash:route.hash});
  }
  // The container is an import/rendering adapter. Native HA header/footer YAML
  // uses its card and sizing fields directly, without this internal card type.
  if (config.type === 'custom:library-container-card') {
    const {type, ...container} = config;
    return container;
  }
  return config;
}

function selectYamlText(text) {
  const pending = [text], visited = new Set();
  while (pending.length) {
    const candidate = pending.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);
    candidate.focus?.();
    if (typeof candidate.select === 'function') { candidate.select(); return; }
    if (typeof candidate.setSelectionRange === 'function') { candidate.setSelectionRange(0, text.value.length); return; }
    for (const root of [candidate.shadowRoot, candidate.renderRoot]) {
      for (const child of root?.querySelectorAll?.('textarea, input, ha-textarea, wa-textarea, mwc-textarea') || []) pending.push(child);
    }
  }
}

export function installYamlTools(Manager, {el, field, button, select, whenOpen}) {
  Object.assign(Manager.prototype, {
    yamlExportPanel(parent) {
      const id = this.selected;
      const section = el('details', undefined, parent); el('summary', 'YAML anzeigen / kopieren', section);
      let body, selectedHash = '', text, notice, copy;
      const current = () => {
        if (this.selected !== id || !this.draft?.templates || !Object.hasOwn(this.draft.templates, id)) throw Error('Die ausgewählte Vorlage ist inzwischen geändert worden. YAML erneut öffnen.');
        return this.draft;
      };
      const update = () => {
        try {
          text.value = configurationYaml(templateYamlConfig(current(), id, selectedHash));
          copy.disabled = false; notice.textContent = ''; notice.className = 'hint';
          return text.value;
        } catch (error) {
          text.value = ''; copy.disabled = true;
          notice.textContent = error.message || String(error); notice.className = 'error';
          return null;
        }
      };
      whenOpen(section, () => {
        body ||= el('div', undefined, section); body.replaceChildren();
        const library = current(), links = library.templates[id].popup_links || [];
        if (!links.some(link => link.hash === selectedHash)) selectedHash = '';
        select(body, [['', 'Zentrale Vorlage'], ...links.map(link => [link.hash, 'Hash-Variante ' + link.hash])], selectedHash, hash => { selectedHash = hash; update(); }, 'YAML-Auswahl');
        el('p', 'Momentaufnahme des aktuellen Entwurfs mit aufgelösten gemeinsamen Werten. Eine Hash-Variante enthält ihre gespeicherten lokalen Ausnahmen und Popup-Einstellungen. Kopieren verändert keine Vorlage oder Verknüpfung.', body).className = 'hint';
        text = field(body, 'Vollständige Kartenkonfiguration (YAML)', 'textarea', false);
        text.readOnly = true; text.rows = 16; text.setAttribute('spellcheck', 'false');
        notice = el('p', '', body); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
        copy = button(body, 'YAML kopieren', async () => {
          const value = update(); if (value === null) return;
          try {
            if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw Error('Zwischenablage nicht verfügbar');
            await globalThis.navigator.clipboard.writeText(value);
            if (section.isConnected && this.selected === id && text.value === value) notice.textContent = 'YAML kopiert.';
          } catch {
            if (!section.isConnected || this.selected !== id) return;
            // A failed clipboard request can outlive an edit. Refresh the
            // manually selectable text rather than retaining a stale snapshot.
            if (update() === null) return;
            selectYamlText(text);
            notice.textContent = 'Automatisches Kopieren ist nicht verfügbar. YAML im Textfeld markieren und manuell kopieren.';
          }
        });
        update();
      }, true);
      return section;
    }
  });
}
