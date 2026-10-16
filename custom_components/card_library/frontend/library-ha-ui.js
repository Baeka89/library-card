import {refreshEditorScope} from './library-editor-scope.js?v=1.0.0';

// Built-in choices do not depend on window.customCards or a preloaded HA picker.
export const STANDARD_CARDS = [
  ['horizontal-stack','Horizontaler Stapel'],['vertical-stack','Vertikaler Stapel'],['grid','Raster'],
  ['entities','Entitäten'],['entity','Entität'],['tile','Kachel'],['button','Schaltfläche'],['glance','Übersicht'],
  ['light','Licht'],['thermostat','Thermostat'],['humidifier','Luftbefeuchter'],['media-control','Mediensteuerung'],
  ['alarm-panel','Alarmanlage'],['calendar','Kalender'],['todo-list','Aufgabenliste'],['weather-forecast','Wettervorhersage'],
  ['gauge','Messanzeige'],['sensor','Sensor'],['history-graph','Verlauf'],['statistics-graph','Statistikdiagramm'],['statistic','Statistik'],
  ['markdown','Markdown'],['picture','Bild'],['picture-entity','Bild mit Entität'],['picture-glance','Bildübersicht'],['picture-elements','Bildelemente'],
  ['iframe','Webseite'],['plant-status','Pflanzenstatus'],['clock','Uhr'],['map','Karte'],['area','Bereich'],['heading','Überschrift'],['conditional','Bedingte Karte'],['entity-filter','Entitätsfilter'],
  ['energy-date-selection','Energie-Zeitraum'],['energy-distribution','Energieverteilung'],['energy-usage-graph','Energieverbrauch'],
  ['energy-solar-graph','Solarerzeugung'],['energy-gas-graph','Gasverbrauch'],['energy-water-graph','Wasserverbrauch'],
  ['energy-devices-graph','Geräteverbrauch'],['energy-sources-table','Energiequellen'],
  ['energy-grid-neutrality-gauge','Netzneutralität'],['energy-solar-consumed-gauge','Solar-Eigenverbrauch'],
  ['energy-carbon-consumed-gauge','CO₂-arme Energie'],['energy-self-sufficiency-gauge','Energieautarkie']
];
export async function waitForElement(tag, timeout = 6000) {
  if (customElements.get(tag) || !customElements.whenDefined) return;
  let timer;
  try {
    await Promise.race([customElements.whenDefined(tag), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('HA-Element wurde nicht geladen: ' + tag)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

// card-mod 4 hooks HA's original hui-card host, rather than the bare factory.
// Follow the same public construction sequence used by HA's stack cards.
// Ordinary cards keep the direct factory path and their existing lifecycle.
export function createRenderedCard(helpers, config, hass, env = globalThis) {
  if (config.card_mod && env.customElements?.get('hui-card')) {
    const element = env.document.createElement('hui-card');
    if (typeof element.load === 'function') {
      element.hass = hass; element.config = structuredClone(config); element.load();
      if (typeof element.setConfig !== 'function') element.setConfig = value => { element.config = structuredClone(value); };
      return {element, native: element.firstElementChild || element.children?.[0]};
    }
  }
  const element = helpers.createCardElement(structuredClone(config));
  return {element, native:element};
}
export async function cardConstructor(hass, config) {
  const tag = config.type.startsWith('custom:') ? config.type.slice(7) : `hui-${config.type}-card`;
  if (customElements.get(tag)) return customElements.get(tag);
  const helpers = await window.loadCardHelpers();
  const card = helpers.createCardElement(config); card.hass = hass;
  // A known constructor is enough; lazy HA placeholders must first be registered.
  if ((!card.localName || card.localName === tag) && (card.constructor.getConfigElement || card.constructor.getStubConfig)) return card.constructor;
  await waitForElement(tag);
  return customElements.get(tag) || card.constructor;
}
export async function originalEditor(hass, config, lovelace) {
  if (config.type === 'custom:library-container-card') {
    // Retain HA placement data while embedding the actual child editor.
    const native = await originalEditor(hass, config.card, lovelace);
    const host = document.createElement('div');
    let envelope = structuredClone(config);
    Object.defineProperty(host, 'hass', {set(value) { native.hass = value; }});
    Object.defineProperty(host, 'lovelace', {set(value) { native.lovelace = value; }});
    host.setConfig = value => {
      envelope = structuredClone(value);
      if (typeof native.setConfig === 'function') native.setConfig(structuredClone(value.card));
      else native.value = structuredClone(value.card);
    };
    native.addEventListener('config-changed', event => {
      event.stopPropagation();
      if (!event.detail?.config) return;
      host.dispatchEvent(new CustomEvent('config-changed', {
        detail: {...event.detail, config: {...structuredClone(envelope), card: structuredClone(event.detail.config)}},
        bubbles: true, composed: true
      }));
    });
    host.append(native);
    return host;
  }
  const context = lovelace?.config || lovelace || {views: []};
  // Use the same editor host as HA when its edit dialog has loaded it.
  if (customElements.get('hui-card-element-editor')) {
    const editor = document.createElement('hui-card-element-editor');
    editor.hass = hass; editor.lovelace = context; editor.value = structuredClone(config);
    return editor;
  }
  const constructor = await cardConstructor(hass, config);
  let editor;
  if (constructor?.getConfigElement) editor = await constructor.getConfigElement();
  if (!editor && constructor?.getConfigForm) {
    const form = await constructor.getConfigForm();
    if (form && customElements.get('hui-form-editor')) {
      editor = document.createElement('hui-form-editor');
      for (const key of ['schema', 'assertConfig', 'computeLabel', 'computeHelper']) {
        if (form[key] !== undefined) editor[key] = form[key];
      }
    }
  }
  if (!editor) throw Error('Originaleditor nicht verfügbar. HA-Karteneditor öffnen und erneut versuchen.');
  // Some factories return an element before their dynamic import has registered it.
  if (editor.localName?.includes('-')) await waitForElement(editor.localName);
  customElements.upgrade?.(editor);
  if (typeof editor.setConfig !== 'function') throw Error('Der Karteneditor wurde nicht vollständig geladen.');
  editor.hass = hass; editor.lovelace = context; editor.setConfig(structuredClone(config));
  return editor;
}

// One original editor per editing surface. Retain in-flight factory requests too.
export async function cachedOriginalEditor(owner, id, hass, config, lovelace) {
  let type = config, kinds = [];
  while (type) { kinds.push(type.type); type = type.type === 'custom:library-container-card' ? type.card : null; }
  const key = JSON.stringify([id, kinds, Boolean(customElements.get('hui-card-element-editor'))]);
  let cache = owner.originalEditorCache;
  if (!cache || cache.key !== key) {
    cache = {key, signature:JSON.stringify(config), promise:originalEditor(hass, config, lovelace)};
    owner.originalEditorCache = cache;
  }
  try {
    const editor = await cache.promise;
    return {editor, cache};
  } catch(error) {
    if (owner.originalEditorCache === cache) owner.originalEditorCache = null;
    throw error;
  }
}
export function updateOriginalEditor(editor, cache, hass, config, lovelace) {
  editor.hass = hass;
  editor.lovelace = lovelace?.config || lovelace || {views:[]};
  const signature = JSON.stringify(config);
  if (signature !== cache.signature) {
    const previous = cache.signature;
    cache.signature = signature;
    try {
      if (typeof editor.setConfig === 'function') editor.setConfig(structuredClone(config));
      else editor.value = structuredClone(config);
    } catch (error) { cache.signature = previous; throw error; }
  }
  refreshEditorScope(editor);
}
