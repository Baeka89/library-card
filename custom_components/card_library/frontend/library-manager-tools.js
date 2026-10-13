import {confirmAction} from './library-ui.js?v=0.5.1';
import {clone, getAt, setAt, resolveTemplate, overlap, bindingValue, exportLibrary, importLibrary, changedTemplates, newId} from './library-core.js?v=0.5.1';
import {scanDashboards, usages, dependencyReport} from './library-tools.js?v=0.5.1';
import {createRenderedCard} from './library-ha-ui.js?v=0.5.1';

export function installTools(Manager, {el, field, button, select, tree, whenOpen}) {
  Object.assign(Manager.prototype, {
    async run(task) {
      if (this.busy || this.saving) return;
      this.busy = true; this.render();
      try { await task(); } catch (error) { this.notice = error.message || String(error); }
      finally { this.busy = false; this.render(); }
    },
    async checkRemovedTemplates(candidate) {
      const removed = Object.keys(this.state.library.templates).filter(id => !Object.hasOwn(candidate.templates, id));
      if (!removed.length) return;
      this.inventory = await scanDashboards(this._hass);
      if (removed.some(id => usages(this.inventory, id, this.state.library).length)) throw Error('Verwendete Vorlagen würden entfernt. Zuerst die Dashboard-Verwendungen anpassen.');
      if (this.inventory.failures.length && !await confirmAction(this, 'Die Dashboard-Prüfung ist unvollständig. Bibliothek trotzdem speichern?')) throw Error('Speichern abgebrochen.');
    },
    async scan() {
      if (this.scanning) return;
      this.scanning = true; this.render();
      try { this.inventory = await scanDashboards(this._hass); }
      catch (error) { this.notice = error.message || String(error); }
      this.scanning = false; this.render();
    },
    renderTools(card) {
      const activeMode = ['groups', 'people'].includes(this.mode) ? this.mode : 'templates';
      select(card, [['templates', 'Kartenvorlagen'], ['groups', 'Gemeinsame Einstellungen'], ['people', 'Personen']], activeMode,
        value => { this.mode = value; this.selected = null; this.path = null; this.groupPath = null; this.render(); }, 'Konfigurationsbereich');
      const actions = el('div', undefined, card); actions.className = 'library-actions';
      const create = el('details', undefined, actions); create.className = 'action-menu'; el('summary', 'Vorlage hinzufügen', create);
      button(create, 'Neue Karte', () => { this.mode = 'create'; this.selected = null; this.render(); });
      button(create, 'Karte aus YAML', () => { this.mode = 'yaml'; this.render(); });
      button(create, 'Dashboards / Übernahme', () => { this.mode = 'dashboards'; this.render(); if (!this.inventory) this.scan(); });
      const tools = el('details', undefined, actions); tools.className = 'action-menu'; el('summary', 'Werkzeuge', tools);
      const maintenance = el('details', undefined, tools); el('summary', 'Verlauf und Wartung', maintenance);
      const toolbar = maintenance;
      button(toolbar, 'Entwurf verwerfen / neu laden', () => {
        this.draft = clone(this.state.library); this.draftState = this.state;
        this.path = null; this.groupPath = null; this.dirty = false; this.notice = ''; this.render();
      });
      button(toolbar, 'Änderungen vergleichen', () => { this.mode = 'preview'; this.render(); });
      button(toolbar, 'Versionsverlauf', () => this.run(async () => {
        const state = this.state, history = await this._hass.callWS({type: 'card_library/history'});
        this.assertLibraryConnection(state);
        this.history = history; this.mode = 'history';
      }));
      const transfer = el('details', undefined, tools); el('summary', 'Import und Export', transfer);
      button(transfer, 'Bibliothek exportieren', () => {
        const blob = new Blob([JSON.stringify(exportLibrary(this.draft), null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'card-library.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      const importLabel = el('label', 'Vorlagen importieren: JSON-Datei auswählen', transfer);
      const file = el('input', undefined, importLabel); file.type = 'file'; file.hidden = true; button(transfer, 'JSON-Datei auswählen', () => file.click()); file.accept = '.json,application/json'; file.setAttribute('aria-label', 'Bibliothek importieren');
      file.onchange = () => this.run(async () => {
        const selected = file.files[0]; if (!selected) return;
        if (selected.size > 32 * 1024 * 1024) throw Error('Importdatei überschreitet 32 MiB');
        this.pendingImport = importLibrary(JSON.parse(await selected.text())); this.mode = 'import';
      });
      el('p', 'Import und Wiederherstellung ersetzen die gesamte Bibliothek.', tools).className = 'hint';
      if (!['people', 'dashboards', 'preview', 'history', 'import', 'yaml', 'create'].includes(this.mode)) return false;
      const back = () => { this.mode = 'templates'; this.selected = null; this.render(); };
      button(card, 'Zurück zu Vorlagen', back).className = 'back-link';
      if (this.mode === 'people') this.peoplePanel(card);
      if (this.mode === 'dashboards') this.dashboardPanel(card);
      if (this.mode === 'preview') this.previewPanel(card);
      if (this.mode === 'history') this.historyPanel(card);
      if (this.mode === 'import') this.importPanel(card);
      if (this.mode === 'yaml') this.yamlPanel(card);
      if (this.mode === 'create') this.newCard(card);
      return true;
    },
    yamlPanel(card) {
      el('h3', 'Kartenkonfiguration direkt einfügen', card);
      el('p', 'Karten-YAML mit Entitäten und Einstellungen einfügen. Kopf-/Fußzeilen nutzen card und optional max_width. JSON importiert eine ganze Bibliothek.', card);
      const text = field(card, 'Karten-YAML', 'textarea', false); text.rows = 14; text.value = this.yamlDraft || '';
      text.placeholder = 'type: custom:energy-flow-card-plus\ntitle: Energiefluss';
      text.setAttribute('aria-label', 'Karten-YAML'); text.setAttribute('style', 'width:100%;box-sizing:border-box;font-family:monospace');
      text.oninput = () => { this.yamlDraft = text.value; };
      button(card, 'YAML als Karte übernehmen', () => this.run(async () => {
        const source = this.yamlDraft || text.value;
        if (!source.trim()) throw Error('Bitte eine Kartenkonfiguration einfügen.');
        const config = await this._hass.callWS({type: 'card_library/parse_card', yaml: source});
        if (this.addTemplate(config)) this.yamlDraft = '';
      }));
      el('p', 'Entwurf im originalen Editor prüfen und zentral speichern. Vorhandene Vorlagen bleiben erhalten.', card);
    },
    groupFieldTools(card, item) {
      if (!item.value || typeof item.value !== 'object') return;
      const selected = this.groupPath || [];
      const selectedValue = getAt(item.value, selected);
      const parentPath = selectedValue && typeof selectedValue === 'object' ? selected : selected.slice(0,-1);
      const parent = getAt(item.value, parentPath);
      if (!parent || typeof parent !== 'object') return;
      const box = el('fieldset', undefined, card); el('legend', 'Gemeinsames Feld hinzufügen', box);
      el('p', 'Ziel: ' + (parentPath.join(' → ') || 'Gemeinsame Einstellung'), box);
      const name = field(box, 'Neues Feld'); name.placeholder = 'Feldname, z. B. calendar.sophie_2';
      const type = select(box, [['string','Text / Farbe'], ['number','Zahl'], ['boolean','Schalter'], ['object','Objekt'], ['array','Liste']], 'string', () => {});
      button(box, 'Gemeinsames Feld anlegen', () => {
        const key = Array.isArray(parent) ? parent.length : name.value.trim();
        if (key === '' || ['__proto__','constructor','prototype'].includes(key)) return;
        if (Object.hasOwn(parent, key)) { this.notice = 'Feld existiert bereits.'; this.render(); return; }
        setAt(item.value, [...parentPath,key], {string:'',number:0,boolean:false,object:{},array:[]}[type.value]);
        this.edit(); this.render();
      });
    },
    peoplePanel(card) {
      this.draft.people ||= {};
      el('h3', 'Zentrale Personen', card);
      button(card, 'Person hinzufügen', () => {
        const id = newId(); this.draft.people[id] = {name: 'Neue Person', color: '#0088cc'};
        this.selected = id; this.edit(); this.render();
      });
      select(card, [['', 'Person auswählen'], ...Object.entries(this.draft.people).map(([id, p]) => [id, p.name])], this.selected, id => { this.selected = id; this.render(); });
      const person = this.draft.people[this.selected]; if (!person) return;
      el('p', 'Feste Kennung: ' + this.selected, card);
      tree(card, person, (path, value) => { setAt(person, path, value); this.edit(); });
      for (const template of Object.values(this.draft.templates)) {
        if (template.bindings?.some(b => b.person === this.selected)) el('p', 'Verwendet von: ' + template.name, card);
      }
      button(card, 'Person löschen', () => this.deleteItem('people', this.selected));
      el('p', 'In der Vorlage Name oder Farbe mit dieser Person verknüpfen. Die Kennung bleibt bei Umbenennung gleich.', card);
    },
    personBindingTools(card, item) {
      if (!Object.keys(this.draft.people || {}).length) return;
      const box = el('fieldset', undefined, card); el('legend', 'Person zuordnen', box);
      const person = select(box, [['', 'Person wählen'], ...Object.entries(this.draft.people).map(([id, p]) => [id, p.name])], '', () => {});
      const field = select(box, [['color', 'Farbe'], ['name', 'Name']], 'color', () => {});
      button(box, 'Personenfeld hier verknüpfen', () => {
        if (!person.value) return;
        const binding = {path: clone(this.path), person: person.value, field: field.value};
        if (this.applyBinding(item, binding)) this.edit(); this.render();
      });
    },
    dashboardPanel(card) {
      el('h3', 'Bestehende Dashboard-Karten', card);
      button(card, this.scanning ? 'Prüft …' : 'Dashboards erneut lesen', () => this.scan()).disabled = this.scanning;
      if (!this.inventory) { el('p', 'Noch keine Bestandsaufnahme.', card); return; }
      el('p', 'Stand: ' + new Date(this.inventory.scannedAt).toLocaleString(), card);
      for (const failure of this.inventory.failures) el('p', failure, card).className = 'error';
      const filter = field(card, 'Dashboard-Karten filtern'); filter.placeholder = 'Dashboard, Ansicht oder Kartentyp filtern'; filter.value = this.cardFilter || '';
      filter.onchange = () => { this.cardFilter = filter.value; this.render(); };
      for (const source of this.inventory.cards) {
        const text = `${source.dashboard} / ${source.view} / ${source.config.type} / ${source.path.join(' → ')}`;
        if (this.cardFilter && !text.toLowerCase().includes(this.cardFilter.toLowerCase())) continue;
        const row = el('div', undefined, card); row.className = 'row'; el('span', text, row);
        if (['custom:library-card', 'custom:library-manager'].includes(source.config.type)) continue;
        button(row, 'Als Vorlage übernehmen', () => {
          const id = this.addTemplate(source.config); if (!id) return;
          const template = this.draft.templates[id];
          template.name = `${source.config.title || source.config.type} – ${source.view}`;
          template.source = {dashboard: source.dashboard, url_path: source.url_path, path: source.path};
          this.notice = 'Als Entwurf übernommen. Zentral speichern, dann unter „Im Dashboard einbauen“ verwenden.';
          this.render();
        });
      }
      el('p', 'Die Übernahme kopiert die Konfiguration. Die Originalkarte bleibt bestehen. Verknüpfungen findest du unter „Im Dashboard einbauen“.', card);
    },
    templateTools(card, item) {
      const box = el('details', undefined, card); el('summary', 'Verwendungen und Abhängigkeiten', box);
      whenOpen(box, () => {
      button(box, this.scanning ? 'Prüft …' : 'Dashboards und Ressourcen prüfen', () => this.scan()).disabled = this.scanning;
      if (this.inventory) {
        el('p', 'Bestandsaufnahme: ' + new Date(this.inventory.scannedAt).toLocaleString(), box);
        const found = usages(this.inventory, this.selected, this.state.library);
        el('p', found.length ? `${found.length} Verwendung(en):` : 'Keine Verwendung in den gelesenen Dashboards gefunden.', box);
        for (const use of found) el('p', `${use.dashboard} / ${use.view} / ${use.path.join(' → ')}`, box);
        for (const failure of this.inventory.failures) el('p', 'Unvollständig: ' + failure, box).className = 'error';
      } else el('p', 'Verwendungen noch nicht geprüft.', box);
      const report = dependencyReport(this._hass, resolveTemplate(this.draft, this.selected), item.dependencies, this.inventory?.resources);
      el('p', 'Custom Cards: ' + (report.types.join(', ') || 'keine'), box);
      el('p', 'Erkannte Entitäten: ' + (report.entities.join(', ') || 'keine'), box);
      for (const type of report.missingCards) el('p', 'Nicht geladen: ' + type, box).className = 'error';
      for (const entity of report.missingEntities) el('p', 'Entität fehlt: ' + entity, box).className = 'error';
      if (this.inventory?.resourcesAvailable !== false && this.inventory) for (const resource of report.missingResources) el('p', 'Benötigte Ressource nicht in der Ressourcenliste: ' + resource, box).className = 'error';
      if (this.inventory?.resourcesAvailable === false) el('p', 'Ressourcen konnten nicht geprüft werden.', box);
      el('p', 'Ressourcen-URLs werden exportiert. Karten und Integrationen separat installieren.', box);
      const resource = field(box, 'Benötigte Ressourcen-URL'); resource.placeholder = '/hacsfiles/…/karte.js';
      button(box, 'Ressource zuordnen', () => {
        const url = resource.value.trim();
        if (!/^(https?:\/\/|\/)/.test(url)) { this.notice = 'Bitte eine Ressourcen-URL eingeben.'; this.render(); return; }
        item.dependencies = [...new Set([...(item.dependencies || []), url])]; this.edit(); this.render();
      });
      if (this.inventory?.resources.length) {
        const choice = select(box, [['', 'Installierte Ressource wählen'], ...this.inventory.resources.map(r => [r.url, r.url])], '', () => {});
        button(box, 'Ausgewählte Ressource zuordnen', () => { if (!choice.value) return; item.dependencies = [...new Set([...(item.dependencies || []), choice.value])]; this.edit(); this.render(); });
      }
      for (const url of item.dependencies || []) {
        const row = el('div', undefined, box); el('span', url, row);
        button(row, 'Zuordnung entfernen', () => { item.dependencies = item.dependencies.filter(r => r !== url); this.edit(); this.render(); });
      }
      });
    },
    async deleteItem(mode, id) {
      if (mode === 'groups' || mode === 'people') {
        if (Object.values(this.draft.templates).some(t => t.bindings?.some(b => mode === 'groups' ? b.group === id : b.person === id))) {
          this.notice = 'Dieser Eintrag wird noch von Vorlagen verwendet.'; this.render(); return;
        }
      }
      if (mode === 'templates') {
        this.notice = 'Prüfe Verwendungen vor dem Löschen …'; this.render();
        const inventory = await scanDashboards(this._hass); this.inventory = inventory;
        if (usages(inventory, id, this.state.library).length) { this.notice = 'Vorlage wird in Dashboards verwendet und kann nicht gelöscht werden.'; this.render(); return; }
        if (inventory.failures.length && !await confirmAction(this, 'Einige Dashboards oder Ressourcen konnten nicht geprüft werden. Trotzdem löschen?')) { this.notice = 'Löschen abgebrochen.'; this.render(); return; }
      }
      if (!await confirmAction(this, 'Eintrag im Entwurf löschen? Die Änderung gilt erst nach dem Speichern.')) return;
      delete this.draft[mode][id]; this.selected = null; this.notice = ''; this.edit(); this.render();
    },
    previewPanel(card, candidate = this.draft) {
      el('h3', 'Gespeicherter Stand und Entwurf', card);
      let affected;
      try { affected = changedTemplates(this.state.library, candidate); }
      catch (error) { el('p', error.message, card).className = 'error'; return; }
      if (!affected.length) el('p', 'Keine Änderungen an der Darstellung erkannt.', card);
      for (const id of affected) {
        const box = el('details', undefined, card); box.open = affected.length <= 2;
        el('summary', Object.hasOwn(candidate.templates, id) ? candidate.templates[id].name : this.state.library.templates[id].name, box);
        for (const [label, state] of [['Gespeichert', this.state.library], ['Entwurf', candidate]]) {
          const host = el('fieldset', undefined, box); el('legend', label, host);
          if (!Object.hasOwn(state.templates, id)) { el('p', 'Vorlage nicht vorhanden', host); continue; }
          whenOpen(box, () => this.previewCard(host, state, id), true);
        }
        for (const usage of usages(this.inventory, id, this.state.library)) {
          const host = el('fieldset', undefined, box); el('legend', 'Verwendung mit lokalen Anpassungen: ' + usage.dashboard + ' / ' + usage.view, host);
          if (Object.hasOwn(candidate.templates, id)) whenOpen(box, () => this.previewCard(host, candidate, id, usage.reference?.overrides ?? usage.config.overrides), true);
        }
      }
      if (!this.inventory) el('p', 'Für Vorschauen lokaler Anpassungen zuerst Dashboards einlesen.', card);
      el('p', 'Vorschaukarten sind aktiv: Aktionen und Schaltflächen werden ausgeführt.', card).className = 'hint';
    },
    async previewCard(host, state, id, overrides) {
      if (!host.isConnected) return;
      host.setAttribute('data-library-preview', '');
      host.previewRequest = {state, id, overrides};
      const token = host.previewToken = (host.previewToken || 0) + 1;
      try {
        const config = resolveTemplate(state, id, overrides);
        const signature = JSON.stringify(config);
        if (host.previewChild && host.previewSignature === signature) { host.previewChild.hass = this._hass; return; }
        const helpers = await window.loadCardHelpers(); if (!host.isConnected || token !== host.previewToken) return;
        const {element:child} = createRenderedCard(helpers, config, this._hass);
        child.addEventListener('ll-rebuild', event => {
          event.stopPropagation(); if (!host.isConnected || host.previewChild !== child) return;
          host.previewSignature = null; host.previewChild = null;
          const latest = host.previewRequest;
          this.previewCard(host, latest.state, latest.id, latest.overrides);
        });
        child.addEventListener('ll-upgrade', event => {
          if (event.target !== child || host.previewChild !== child || !host.isConnected) return;
          event.stopPropagation(); if (Object.hasOwn(child,'hass')) delete child.hass;
          child.hass = this._hass;
        });
        host.previewChild = child; child.hass = this._hass;
        if (!host.isConnected || token !== host.previewToken) return;
        host.previewSignature = signature;
        const legends = [...host.children].filter(node => node.tagName?.toLowerCase() === 'legend');
        host.replaceChildren(...legends, child);
      } catch (error) { if (token === host.previewToken) { host.previewChild = null; host.previewSignature = null; const legends = [...host.children].filter(node => node.tagName?.toLowerCase() === 'legend'); host.replaceChildren(...legends); el('p', error.message || String(error), host).className = 'error'; } }
    },
    historyPanel(card) {
      el('h3', 'Letzte zehn gespeicherte Vorgängerstände', card);
      for (const snapshot of [...(this.history || [])].reverse()) {
        const box = el('details', undefined, card);
        el('summary', `Revision ${snapshot.revision} – archiviert ${new Date(snapshot.saved_at).toLocaleString()}`, box);
        button(box, 'Als Entwurf ansehen', async () => {
          if (this.dirty && !await confirmAction(this, 'Ungespeicherten Entwurf durch diese Version ersetzen?')) return;
          this.draft = {...clone(snapshot.library), revision: this.state.library.revision}; this.draft.people ||= {};
          this.draftState = this.state;
          this.edit(); this.mode = 'preview'; this.render();
        });
        button(box, 'Diese Version wiederherstellen', () => this.run(async () => {
          // Reject deleted template IDs still referenced by known dashboards.
          const state = this.state, hass = this._hass, baseline = clone(state.library);
          const inventory = await scanDashboards(hass);
          this.assertLibraryConnection(state); this.inventory = inventory;
          const removed = Object.keys(baseline.templates).filter(id => !Object.hasOwn(snapshot.library.templates, id));
          if (removed.some(id => usages(inventory, id, baseline).length)) throw Error('Wiederherstellung würde verwendete Vorlagen entfernen. Zuerst Verwendungen anpassen.');
          if (!await confirmAction(this, 'Gesamte Bibliothek wiederherstellen? Ungespeicherte Änderungen gehen verloren.' + (inventory.failures.length ? ' Die Dashboard-Prüfung ist unvollständig.' : ''))) return;
          const restored = await hass.callWS({type: 'card_library/restore', revision: baseline.revision, target_revision: snapshot.revision});
          this.assertLibraryConnection(state);
          this.draft = clone(this.state.library?.revision > restored.revision ? this.state.library : restored);
          this.draftState = this.state;
          this.dirty = false; this.notice = 'Version wiederhergestellt. Vorheriger Stand im Verlauf gesichert.';
          try {
            const history = await hass.callWS({type: 'card_library/history'});
            this.assertLibraryConnection(state); this.history = history;
          }
          catch (error) { this.history = []; this.notice += ' Der Verlauf konnte nicht neu geladen werden: ' + (error.message || String(error)); }
        }));
      }
      if (!this.history?.length) el('p', 'Noch keine Vorgängerstände vorhanden.', card);
    },
    importPanel(card) {
      if (!this.pendingImport) return;
      el('h3', 'Import prüfen', card);
      el('p', `${Object.keys(this.pendingImport.templates).length} Vorlagen, ${Object.keys(this.pendingImport.groups).length} Einstellungen, ${Object.keys(this.pendingImport.people).length} Personen`, card);
      button(card, 'Import als Entwurf übernehmen', async () => {
        if (this.dirty && !await confirmAction(this, 'Ungespeicherten Entwurf durch den Import ersetzen?')) return;
        this.draft = {...clone(this.pendingImport), revision: this.state.library.revision}; this.draftState = this.state;
        this.edit(); this.mode = 'preview'; this.render();
      });
      this.previewPanel(card, this.pendingImport);
    },
  });
}
