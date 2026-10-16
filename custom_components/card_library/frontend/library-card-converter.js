import {clone, getAt, inputErrors, overlap, resolveTemplate, updateLocalField, validateCard, validateJson} from './library-core.js?v=1.1.0';

const placementFields = new Set(['grid_options', 'layout_options', 'view_layout', 'visibility']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasJavaScript = value => typeof value === 'string' && /\[\[\[|\]\]\]/u.test(value);

function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

// Bound serialized size before cloning or stringifying shared YAML aliases.
function bounded(value) {
  validateJson(value);
  const limit = 2000000, sizes = new WeakMap(), strings = new Map(), encoder = new TextEncoder();
  const check = size => { if (size > limit) throw Error('Kartenkonfiguration überschreitet 2 MB'); return size; };
  function stringSize(value) {
    if (!strings.has(value)) {
      check(value.length);
      strings.set(value, check(encoder.encode(JSON.stringify(value)).length));
    }
    return strings.get(value);
  }
  function size(node) {
    if (typeof node === 'string') return stringSize(node);
    if (!node || typeof node !== 'object') return JSON.stringify(node).length;
    if (sizes.has(node)) return sizes.get(node);
    let bytes = 2, index = 0;
    if (Array.isArray(node)) {
      for (let item = 0; item < node.length; item++) bytes = check(bytes + (item ? 1 : 0) + (Object.hasOwn(node, item) ? size(node[item]) : 4));
    } else for (const [key, child] of Object.entries(node)) bytes = check(bytes + (index++ ? 1 : 0) + stringSize(key) + 1 + size(child));
    sizes.set(node, bytes); return bytes;
  }
  check(size(value)); return value;
}

function sourceTemplateName(source) {
  if (!Object.hasOwn(source, 'template')) return null;
  let name = source.template;
  if (Array.isArray(name)) {
    if (name.length !== 1) throw Error('Bitte genau eine statische Button-Card-Vorlage verwenden. Mehrere Vorlagen können hier nicht eindeutig zugeordnet werden.');
    [name] = name;
  }
  if (typeof name !== 'string' || !name.trim() || /\[\[\[|\]\]\]|\{\{|\{%/u.test(name)) {
    throw Error('Der bisherige Template-Verweis muss ein einzelner fester Vorlagenname sein. Dynamische Verweise werden nicht ausgeführt.');
  }
  return name;
}

// Match Button Card's object merge and one-level array concatenation without
// evaluating any template expressions. Mixed list/object inheritance is rejected
// consistently with the existing server-side Button Card template importer.
function mergeValue(previous, following, path, concatenate = true) {
  if (Array.isArray(previous) && Array.isArray(following)) return concatenate ? bounded(clone(previous).concat(...clone(following))) : clone(following);
  if (isObject(previous) && isObject(following)) {
    const merged = clone(previous);
    for (const [key, value] of Object.entries(following)) merged[key] = mergeValue(previous[key], value, [...path, key], concatenate);
    return bounded(merged);
  }
  if (concatenate && previous && typeof previous === 'object' && following && typeof following === 'object' && Array.isArray(previous) !== Array.isArray(following)) {
    throw Error('Button-Card-Vererbung mischt Liste und Objekt: ' + path.join('.'));
  }
  return clone(following);
}

function mergeStates(previous, following) {
  if (!Array.isArray(previous) || !Array.isArray(following) || [...previous, ...following].some(state => !isObject(state))) {
    throw Error('Button-Card-state muss eine Liste von Objekten sein');
  }
  // Button Card merges only truthy IDs and compares their values loosely.
  const sameId = (left, right) => Boolean(left.id && right.id && left.id == right.id);
  const result = previous.map(old => following.reduce((current, next) => sameId(old, next) ? mergeValue(current, next, ['state']) : current, clone(old)));
  result.push(...following.filter(next => !previous.some(old => sameId(old, next))).map(clone));
  return bounded(result);
}

function extraStyles(previous, following) {
  if (previous != null && typeof previous !== 'string' || following != null && typeof following !== 'string') throw Error('extra_styles muss CSS-Text sein');
  const parts = [previous, following].filter(value => typeof value === 'string' && value.trim());
  if (parts.length > 1 && parts.some(hasJavaScript)) {
    throw Error('extra_styles enthält zentrale und lokale Beiträge mit JavaScript. Diese getrennten Button-Card-Auswertungen können nicht verlustfrei zusammengeführt werden. CSS zentral oder lokal zusammenfassen und erneut übernehmen.');
  }
  if (parts.length === 1) return parts[0];
  return parts.map(value => value.trim()).join('\n');
}

function remainingTemplateReferences(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.type === 'custom:button-card' && Object.hasOwn(config, 'template')) return true;
  return Object.values(config).some(remainingTemplateReferences);
}

/** Convert one existing Button Card call into a reference to an existing
 * library template. This changes neither the library nor the supplied reference.
 */
export function convertButtonCard(library, templateId, source, currentReference = {type: 'custom:library-card', template: templateId}) {
  bounded(source);
  if (!isObject(source) || source.type !== 'custom:button-card') throw Error('Bitte das YAML einer einzelnen Karte mit type: custom:button-card einfügen.');
  if (Object.hasOwn(source, 'variables') && !isObject(source.variables)) throw Error('variables muss ein YAML-Objekt sein. Die Variablen unter variables: einrücken; null, Listen oder Text können nicht übernommen werden.');
  validateCard(source);
  const sourceTemplate = sourceTemplateName(source), base = resolveTemplate(library, templateId);
  if (base.type !== 'custom:button-card') throw Error('Die ausgewählte Bibliotheksvorlage muss eine Button Card sein.');
  bounded(currentReference);
  if (!isObject(currentReference) || currentReference.type !== 'custom:library-card' || currentReference.template !== templateId) {
    throw Error('Die lokale Vorlagenkarte gehört nicht zur ausgewählten Bibliotheksvorlage.');
  }
  const currentOverrides = currentReference.overrides === undefined ? [] : currentReference.overrides;
  const current = resolveTemplate(library, templateId, currentOverrides);
  const config = clone(currentReference), bindings = library.templates[templateId].bindings || [], operations = [], notices = [];
  config.type = 'custom:library-card'; config.template = templateId;

  function add(path, value, list = false, styles = false) {
    for (const binding of bindings) {
      if (!overlap(binding.path, path)) continue;
      const relative = binding.path.slice(path.length);
      const supplied = path.length >= binding.path.length ? value : getAt(value, relative);
      const central = path.length >= binding.path.length ? getAt(base, path) : getAt(base, binding.path);
      if (!equal(supplied, central)) throw Error('Der eingefügte Wert widerspricht einer zentralen Bindung: ' + binding.path.join('.'));
      if (binding.path.length <= path.length || equal(value, getAt(base, path))) return;
      throw Error('Das lokal angepasste Feld enthält eine zentrale Bindung: ' + binding.path.join('.') + '. Diesen Listen- oder Objektbereich bitte getrennt von der Bindung bearbeiten.');
    }
    operations.push({path, value});
    if (list) notices.push(sourceTemplate === null
      ? 'Das Listenfeld „' + path.join('.') + '“ wurde vollständig lokal übernommen. Zentrale Änderungen an diesem Listenfeld werden dadurch nicht übernommen; andere Felder bleiben verknüpft.'
      : 'Das lokal angepasste Listenfeld „' + path.join('.') + '“ enthält den aktuellen zentralen Stand. Änderungen an diesem Listenfeld bleiben lokal; andere Felder bleiben verknüpft.');
    if (styles) notices.push('extra_styles wurde als vollständiger lokaler CSS-Stand übernommen. Zentrale Änderungen an diesem Feld werden dadurch nicht übernommen; andere Felder bleiben verknüpft.');
  }

  function visit(value, path) {
    const previous = getAt(base, path), local = getAt(current, path);
    if (path.length === 1 && path[0] === 'state') { add(path, mergeStates(sourceTemplate === null || previous === undefined ? [] : previous, value), true); return; }
    if (path.length === 1 && path[0] === 'extra_styles') {
      if (sourceTemplate === null) { extraStyles(undefined, value); add(path, value, false, true); return; }
      const merged = extraStyles(previous, value);
      add(path, merged, false, true); return;
    }
    if (isObject(value)) {
      if (Array.isArray(previous)) {
        if (sourceTemplate !== null) throw Error('Button-Card-Vererbung mischt Liste und Objekt: ' + path.join('.'));
        add(path, isObject(local) ? mergeValue(local, value, path, false) : clone(value)); return;
      }
      // Missing containers can be created by setAt; scalar central containers
      // need one explicit replacement before their children can be addressed.
      if (previous !== undefined && !isObject(previous)) {
        add(path, isObject(local) ? mergeValue(local, value, path, sourceTemplate !== null) : clone(value)); return;
      }
      if (Array.isArray(local)) throw Error('Das Feld „' + path.join('.') + '“ ist lokal eine Liste. Diese lokale Anpassung zuerst zurücksetzen, um Objektfelder einzufügen.');
      const entries = Object.entries(value);
      if (!entries.length && previous === undefined && local === undefined) add(path, {});
      for (const [key, child] of entries) visit(child, [...path, key]);
      return;
    }
    const merged = mergeValue(previous, value, path, sourceTemplate !== null);
    add(path, merged, Array.isArray(merged));
  }

  function placement(value, previous, path) {
    const binding = bindings.find(binding => overlap(binding.path, path));
    // Placement belongs to the outer HA card; there is no dynamic forwarding of
    // central placement bindings from the inner Button Card to that envelope.
    if (binding) throw Error('Das Platzierungsfeld „' + path.join('.') + '“ enthält eine zentrale Bindung (' + binding.path.join('.') + ') und kann hier nicht lokal übernommen werden. Dieses Feld aus dem eingefügten YAML entfernen.');
    if (isObject(value)) {
      const result = isObject(previous) ? clone(previous) : {};
      for (const [key, child] of Object.entries(value)) result[key] = placement(child, result[key], [...path, key]);
      return result;
    }
    return clone(value);
  }

  for (const [key, value] of Object.entries(source)) {
    if (key === 'type' || key === 'template') continue;
    if (placementFields.has(key)) {
      config[key] = placement(value, config[key], [key]);
      continue;
    }
    visit(value, [key]);
  }
  let overrides = clone(currentOverrides);
  for (const operation of operations) overrides = updateLocalField(library, templateId, overrides, operation.path, operation.value, false, true);
  if (overrides.length || Object.hasOwn(currentReference, 'overrides')) config.overrides = overrides;
  else delete config.overrides;
  bounded(config);
  const resolved = resolveTemplate(library, templateId, overrides);
  if (remainingTemplateReferences(resolved)) notices.push('Enthaltene Button-Card-Template-Verweise bleiben unverändert. Diese Karten benötigen die entsprechenden button_card_templates weiterhin im Dashboard.');
  const errors = inputErrors(library.templates[templateId], resolved);
  if (errors.length) notices.push('Eingabefelder vor dem Speichern prüfen: ' + errors.join(' · '));
  return {config, sourceTemplate, notices: [...new Set(notices)]};
}
