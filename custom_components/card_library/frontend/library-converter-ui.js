import {clone, resolveTemplate, bindingValue} from './library-core.js?v=1.1.0';
import {convertButtonCard} from './library-card-converter.js?v=1.1.0';
import {configurationYaml} from './library-tools.js?v=1.1.0';
import {selectYamlText} from './library-yaml-export.js?v=1.1.0';

function templateSignature(library, id) {
  const template = library.templates[id];
  if (!template) throw Error('Die ausgewählte Vorlage wurde entfernt.');
  return JSON.stringify([template.config, template.bindings || [],
    (template.bindings || []).map(binding => bindingValue(library, binding))]);
}

export function installButtonCardConverter(Editor, {el, field, button, whenOpen}) {
  Object.assign(Editor.prototype, {
    buttonCardConverterPanel(parent, resolved) {
      if (resolved.type !== 'custom:button-card') return;
      const id = this.config.template;
      const section = el('details', undefined, parent);
      el('summary', 'Vorhandene Button Card übernehmen', section);
      whenOpen(section, () => {
        el('p', 'Bisheriges Karten-YAML einfügen. Die ausgewählte Bibliotheksvorlage wird verwendet; Entitäten, Variablen und lokale Einstellungen werden für diese Karte übernommen.', section);
        el('p', 'Anschließend die Karte mit dem normalen Home-Assistant-Speichern sichern. Die Bibliotheksvorlage wird dabei nicht geändert.', section).className = 'hint';
        const source = field(section, 'Bisherige Kartenkonfiguration (YAML)', 'textarea', false);
        source.rows = 12;
        source.setAttribute('spellcheck', 'false');
        source.placeholder = 'type: custom:button-card\ntemplate: rolladen_karte\nvariables:\n  friendly_name: Küchenfenster';
        const draft = this.converterDraft?.template === id ? this.converterDraft : {template:id, text:''};
        this.converterDraft = draft;
        source.value = draft.text;
        const status = el('p', draft.notice || '', section);
        status.className = 'hint'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const apply = button(section, 'Für diese Karte übernehmen', async () => {
          if (apply.disabled || this._detached || !section.isConnected) return;
          const state = this.state, generation = this.renderGeneration;
          const baseline = JSON.stringify(this.config), text = source.value;
          let signature;
          try {
            this.assertLibraryConnection(state);
            if (!text.trim()) throw Error('Bitte das bisherige Karten-YAML einfügen.');
            signature = templateSignature(state.library, id);
          } catch (error) { status.textContent = error.message || String(error); status.className = 'error'; return; }
          apply.disabled = true; status.textContent = 'Kartenkonfiguration wird geprüft …'; status.className = 'hint';
          const active = () => !this._detached && section.isConnected && this.renderGeneration === generation && this.config.template === id;
          try {
            const parsed = await this._hass.callWS({type:'card_library/parse_card', yaml:text});
            if (!active()) return;
            this.assertLibraryConnection(state);
            if (source.value !== text) throw Error('Das eingefügte YAML wurde inzwischen geändert. Bitte erneut übernehmen.');
            if (JSON.stringify(this.config) !== baseline || templateSignature(state.library, id) !== signature) throw Error('Die Kartenkonfiguration oder Vorlage wurde inzwischen geändert. Bitte erneut übernehmen.');
            const result = convertButtonCard(state.library, id, parsed, this.config);
            // Conversion is transactional: parsing and all validation complete
            // before the one native HA configuration event is dispatched.
            this.config = clone(result.config);
            draft.text = text;
            draft.accepted = true;
            draft.notice = 'Lokale Werte übernommen. Anschließend die Karte in Home Assistant speichern.' + (result.notices?.length ? ' ' + result.notices.join(' ') : '');
            this.localYamlDraft = null; this.localStyleDraft = null;
            this.syncLocalEditor(); this.changed();
            this.render();
          } catch (error) {
            if (active()) { status.textContent = error.message || String(error); status.className = 'error'; }
          } finally { apply.disabled = false; }
        }); apply.className = 'primary';
        const output = field(section, 'Neue Vorlagenkarte (YAML)', 'textarea', false);
        output.readOnly = true; output.rows = 12; output.setAttribute('spellcheck', 'false');
        const copy = button(section, 'Neuen YAML-Code kopieren', async () => {
          const value = refresh();
          if (!value) return;
          try {
            if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw Error('Zwischenablage nicht verfügbar');
            await globalThis.navigator.clipboard.writeText(value);
            if (section.isConnected && this.config.template === id && output.value === value) status.textContent = 'Neuer YAML-Code kopiert. Die Karte kann auch direkt in Home Assistant gespeichert werden.';
          } catch {
            if (!section.isConnected || this.config.template !== id || !refresh()) return;
            selectYamlText(output);
            status.textContent = 'Automatisches Kopieren ist nicht verfügbar. Neuen YAML-Code im Textfeld markieren und manuell kopieren.';
          }
        });
        const refresh = () => {
          if (!section.isConnected || this._detached || this.config.template !== id || this.converterDraft !== draft || !draft.accepted) {
            output.value = ''; copy.disabled = true; return null;
          }
          try {
            resolveTemplate(this.state.library, id, this.config.overrides);
            output.value = configurationYaml(this.config); copy.disabled = false; return output.value;
          } catch (error) {
            output.value = ''; copy.disabled = true; status.textContent = error.message || String(error); status.className = 'error'; return null;
          }
        };
        this.converterRefresh = refresh;
        source.oninput = () => {
          if (this.config.template !== id) return;
          draft.text = source.value; draft.accepted = false; draft.notice = '';
          status.textContent = ''; status.className = 'hint'; refresh();
        };
        refresh();
      });
    }
  });
}
