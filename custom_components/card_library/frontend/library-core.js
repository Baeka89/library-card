const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
export const clone = value => structuredClone(value);
const hasText = value => typeof value === 'string' && /[^\s\u0085\u001c-\u001f]/u.test(value);
function validateText(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw Error('Ungültige Unicode-Zeichen');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw Error('Ungültige Unicode-Zeichen');
  }
}
export function getAt(value, path) { return path.reduce((v, k) => v != null && Object.hasOwn(v, k) ? v[k] : undefined, value); }
export function validateJson(value, depth = 0) {
  const heights = new WeakMap(), ancestors = new WeakSet();
  function visit(node, currentDepth) {
    if (currentDepth > 64) throw Error('Konfiguration ist zu tief verschachtelt');
    if (typeof node === 'string') { validateText(node); return 0; }
    if (node === null || typeof node === 'boolean') return 0;
    if (typeof node === 'number' && Number.isFinite(node)) return 0;
    if (!node || typeof node !== 'object' || (!Array.isArray(node) && Object.getPrototypeOf(node) !== Object.prototype && Object.getPrototypeOf(node) !== null)) throw Error('Konfiguration muss gültige JSON-Werte enthalten');
    if (ancestors.has(node)) throw Error('Konfiguration darf keine zyklischen Verweise enthalten');
    if (heights.has(node)) {
      const height = heights.get(node);
      if (currentDepth + height > 64) throw Error('Konfiguration ist zu tief verschachtelt');
      return height;
    }
    if (Array.isArray(node) && node.length > 10000) throw Error('Liste ist zu groß');
    ancestors.add(node);
    let height = 0;
    try {
      for (const [key, child] of Object.entries(node)) {
        validateText(key);
        if (forbidden.has(key)) throw Error('Unsicherer Konfigurationsschlüssel');
        height = Math.max(height, visit(child, currentDepth + 1) + 1);
      }
    } finally { ancestors.delete(node); }
    heights.set(node, height); return height;
  }
  visit(value, depth);
}

// Count the serialized UTF-8 representation without constructing a potentially
// enormous aggregate JSON string. Shared subtrees count at every occurrence,
// but their cost is calculated only once; reject as soon as the limit is crossed.
function validateSerializedSize(value, message = 'Bibliothek überschreitet 2 MB') {
  const limit = 2000000, sizes = new WeakMap(), strings = new Map(), encoder = new TextEncoder();
  const checked = size => {if (size > limit) throw Error(message);return size;};
  function stringSize(text) {
    if (!strings.has(text)) {
      checked(text.length);
      strings.set(text, checked(encoder.encode(JSON.stringify(text)).length));
    }
    return strings.get(text);
  }
  function size(node) {
    if (typeof node === 'string') return stringSize(node);
    if (!node || typeof node !== 'object') return JSON.stringify(node)?.length ?? 4;
    if (sizes.has(node)) return sizes.get(node);
    let bytes = 2;
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index++) bytes = checked(bytes + (index ? 1 : 0) + size(node[index]));
    } else {
      let index = 0;
      for (const [key, child] of Object.entries(node)) bytes = checked(bytes + (index++ ? 1 : 0) + stringSize(key) + 1 + size(child));
    }
    sizes.set(node, bytes); return bytes;
  }
  checked(size(value));
}
export function validatePath(path) {
  if (!Array.isArray(path) || !path.length || path.length > 32 || path.some(k => forbidden.has(k) || !(typeof k === 'string' && k.length || Number.isInteger(k) && k >= 0 && k < 10000))) throw Error('Ungültiger Einstellungspfad');
}
export function setAt(value, path, next, copyValue = true) {
  validatePath(path);
  let cursor = value;
  path.forEach((key, i) => {
    if (!cursor || typeof cursor !== 'object' || (Array.isArray(cursor) ? !Number.isInteger(key) || key > cursor.length : typeof key !== 'string')) throw Error('Einstellungspfad passt nicht zur Konfiguration');
    if (i === path.length - 1) { cursor[key] = copyValue ? clone(next) : next; return; }
    if (!Object.hasOwn(cursor, key)) cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    else if (!copyValue && cursor[key] && typeof cursor[key] === 'object') cursor[key] = Array.isArray(cursor[key]) ? [...cursor[key]] : {...cursor[key]};
    cursor = cursor[key];
  });
}
function removeAt(value, path, detachPath = false) {
  validatePath(path);
  let cursor = value;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (cursor === null || typeof cursor !== 'object') return;
    if (Array.isArray(cursor) ? !Number.isInteger(key) : typeof key !== 'string') throw Error('Einstellungspfad passt nicht zur Konfiguration');
    if (!Object.hasOwn(cursor, key)) return;
    if (i === path.length - 1) { if (Array.isArray(cursor)) cursor.splice(key, 1); else delete cursor[key]; }
    else {
      if (detachPath && cursor[key] && typeof cursor[key] === 'object') cursor[key] = Array.isArray(cursor[key]) ? [...cursor[key]] : {...cursor[key]};
      cursor = cursor[key];
    }
  }
}
export function validateCard(config) {
  if (!config || Array.isArray(config) || typeof config !== 'object' || !hasText(config.type)) throw Error('Kartentyp fehlt');
  validateJson(config);
  validateSerializedSize(config, 'Aufgelöste Karte überschreitet 2 MB');
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'custom:library-container-card') {
      if (!node.card || Array.isArray(node.card) || !hasText(node.card.type)) throw Error('Fuß-/Kopfzeile benötigt eine Karte mit type');
      if (node.max_width != null && (typeof node.max_width !== 'number' || !Number.isFinite(node.max_width) || node.max_width <= 0)) throw Error('max_width muss eine positive Zahl sein');
    }
    if (['custom:library-card', 'custom:library-manager'].includes(node.type)) throw Error('Bibliothekskarten können nicht in Vorlagen eingebettet werden');
    Object.values(node).forEach(walk);
  }
  walk(config);
}
export function validateInputDefinitions(template) {
  if (typeof (template.category === undefined ? '' : template.category) !== 'string' || [...(template.category === undefined ? '' : template.category)].length > 100 || typeof (template.protected === undefined ? false : template.protected) !== 'boolean') throw Error('Ungültige Kategorie oder Vorlagenschutz');
  const fields = template.inputs === undefined ? [] : template.inputs, paths = [];
  if (!Array.isArray(fields) || fields.length > 100) throw Error('Ungültige Eingabefelder');
  for (const input of fields) {
    if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key=>!['path','label','type','required','options','domains'].includes(key))) throw Error('Ungültiges Eingabefeld');
    validatePath(input.path); if(input.path[0]==='type')throw Error('Kartentyp kann kein Eingabefeld sein');
    if (!hasText(input.label) || [...input.label].length > 200 || !['entity','text','number','boolean','select'].includes(input.type) || typeof (input.required === undefined ? false : input.required) !== 'boolean') throw Error('Ungültiger Eingabefeldtyp');
    if (paths.some(path=>overlap(path,input.path)) || template.bindings?.some(binding=>overlap(binding.path,input.path))) throw Error('Eingabefeld überlappt ein anderes Feld oder eine zentrale Bindung');
    if (input.options !== undefined && (input.type !== 'select' || !Array.isArray(input.options) || !input.options.length || input.options.some(value=>!hasText(value)) || new Set(input.options).size!==input.options.length) || input.type==='select' && !input.options?.length) throw Error('Ungültige Auswahlliste');
    if (input.domains !== undefined && (input.type !== 'entity' || !Array.isArray(input.domains) || input.domains.some(domain=>typeof domain!=='string'|| !/^[a-z_]+$/.test(domain)))) throw Error('Ungültige Entitätsdomänen');
    paths.push(input.path);
  }
}
export function inputErrors(template, config) {
  const errors = [];
  for (const input of template.inputs || []) {
    const value = getAt(config,input.path), empty = value == null || typeof value === 'string' && !value.trim();
    if (empty) { if (input.required) errors.push('Pflichtfeld fehlt: '+input.label); continue; }
    const valid = input.type==='text' && typeof value==='string' || input.type==='number' && typeof value==='number' && Number.isFinite(value) || input.type==='boolean' && typeof value==='boolean' || input.type==='select' && typeof value==='string' && input.options.includes(value) || input.type==='entity' && typeof value==='string' && /^[a-z_]+\.[a-z0-9_]+$/.test(value) && (!input.domains?.length || input.domains.includes(value.split('.')[0]));
    if (!valid) errors.push('Ungültiger Wert: '+input.label);
  }
  return errors;
}
export function resolveTemplate(library, id, overrides = []) {
  const template = Object.hasOwn(library.templates, id) ? library.templates[id] : null;
  if (!template) throw Error('Vorlage fehlt: ' + id);
  validateJson(template.config); validateSerializedSize(template.config, 'Aufgelöste Karte überschreitet 2 MB');
  const result = clone(template.config), bindings = template.bindings || [], paths = [];
  for (const binding of bindings) {
    validatePath(binding.path);
    if (binding.path[0] === 'type' || paths.some(path => overlap(path, binding.path))) throw Error('Ungültige oder überlappende Verknüpfungen');
    paths.push(binding.path);
  }
  for (const binding of bindings) {
    // Borrow shared values only until the expanded card passes its size check.
    // Detached path containers prevent aliases from modifying library data.
    setAt(result, binding.path, bindingValue(library, binding), false);
  }
  if (!Array.isArray(overrides)) throw Error('Lokale Anpassungen müssen eine Liste sein');
  for (const override of overrides) {
    if (!override || typeof override !== 'object' || !Array.isArray(override.path) || !override.path?.length || override.path[0] === 'type') throw Error('Ungültige lokale Anpassung');
    if ((template.bindings || []).some(b => overlap(b.path, override.path))) throw Error('Gemeinsame Einstellungen können lokal nicht überschrieben werden');
    if (override.remove === true) {
      const parentPath = override.path.slice(0, -1);
      if (Array.isArray(getAt(result, parentPath)) && (template.bindings || []).some(b => overlap(b.path, parentPath))) throw Error('Die Struktur dieser Liste wird zentral verwaltet.');
      removeAt(result, override.path, true);
    } else setAt(result, override.path, override.value, false);
  }
  validateCard(result);
  // Materialize independent JSON values only after the expanded card is bounded.
  // Shared bindings/overrides must never become shared mutable card instances.
  function materialize(node) {
    if (Array.isArray(node)) return node.map(materialize);
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, materialize(value)]));
    return node;
  }
  return materialize(result);
}
// Split an ancestor override so changing/relinking one child preserves its siblings.
export function updateLocalField(library, id, overrides, path, value, inherit = false, allowNew = false, remove = false) {
  validatePath(path);
  if (path[0] === 'type') throw Error('Der Kartentyp wird von der Vorlage bestimmt');
  const current = resolveTemplate(library, id, overrides);
  if (!allowNew && getAt(current, path) === undefined) throw Error('Das ausgewählte Feld existiert nicht mehr');
  if (library.templates[id].bindings?.some(b => overlap(b.path, path))) throw Error('Dieses Feld wird zentral verwaltet.');
  const result = [];
  let handled = false, inherited;
  let activeOverrides = overrides || [];
  const anchor = activeOverrides.filter(override => override.path.length < path.length && override.path.every((key,index) => key === path[index])).sort((a,b) => a.path.length - b.path.length)[0];
  if (anchor) {
    const inside = override => anchor.path.every((key,index) => key === override.path[index]);
    // Ordered nested operations must be composed before splitting an already
    // local container. Otherwise a later indexed removal can be applied again
    // or resurrect a removed row while editing/relinking one of its children.
    // An external indexed removal may shift the anchor itself, so its original
    // ordering must remain intact in that case.
    const shifted = activeOverrides.some(override => !inside(override) && override.remove === true && anchor.path.length > override.path.length - 1 && override.path.slice(0,-1).every((key,index) => key === anchor.path[index]) && Array.isArray(getAt(current, override.path.slice(0,-1))));
    if (!shifted && activeOverrides.filter(inside).length > 1) {
      const effective = getAt(current, anchor.path);
      const composed = effective === undefined ? {path:clone(anchor.path),remove:true} : {path:clone(anchor.path),value:clone(effective)};
      let inserted = false;
      activeOverrides = activeOverrides.flatMap(override => {
        if (!inside(override)) return [override];
        if (inserted) return [];
        inserted = true; return [composed];
      });
    }
  }
  const originalAt = existingPath => getAt(inherited ||= resolveTemplate(library, id), existingPath);
  function retain(existingPath, existingValue, removed = false) {
    if (!overlap(existingPath, path)) { result.push(removed ? {path: clone(existingPath), remove: true} : {path: clone(existingPath), value: clone(existingValue)}); return; }
    if (existingPath.length >= path.length) return;
    const original = originalAt(existingPath);
    const scalarReplacement = (existingValue === null || typeof existingValue !== 'object') && original && typeof original === 'object' && !Array.isArray(original);
    if (removed || scalarReplacement) {
      if (original && typeof original === 'object') {
        const keys = Object.keys(original);
        if (Array.isArray(original)) keys.reverse();
        for (const key of keys) retain([...existingPath, Array.isArray(original) ? Number(key) : key], undefined, true);
      }
      return;
    }
    if (existingValue !== null && typeof existingValue === 'object') {
      const relative = path.slice(existingPath.length);
      const localOnlyItem = Array.isArray(original) && typeof relative[0] === 'number' && relative[0] >= original.length;
      if ((Array.isArray(existingValue) && (!inherit || localOnlyItem)) || !original || typeof original !== 'object' || Array.isArray(original) !== Array.isArray(existingValue)) {
        // Child overrides cannot be applied to a scalar or differently typed
        // inherited parent. Keep the necessary local container intact.
        // Local array edits also stay together to avoid transient index gaps.
        const container = clone(existingValue);
        const next = inherit ? getAt(original, relative) : value;
        if (remove || (inherit && next === undefined)) removeAt(container, relative);
        else setAt(container, relative, next);
        result.push({path: clone(existingPath), value: container}); handled = true; return;
      }
      for (const [key, child] of Object.entries(existingValue)) retain([...existingPath, Array.isArray(existingValue) ? Number(key) : key], child);
      if (original && typeof original === 'object' && Array.isArray(original) === Array.isArray(existingValue)) {
        const missing = Object.keys(original).filter(key => !Object.hasOwn(existingValue, key));
        if (Array.isArray(original)) missing.reverse();
        for (const key of missing) retain([...existingPath, Array.isArray(original) ? Number(key) : key], undefined, true);
      }
    }
  }
  for (const override of activeOverrides) retain(override.path, override.value, override.remove === true);
  if (!inherit && !handled) result.push(remove ? {path: clone(path), remove: true} : {path: clone(path), value: clone(value)});
  const indexedRemoval = (overrides || []).some(override => override.remove === true && overlap(override.path.slice(0,-1),path) && Array.isArray(getAt(current,override.path.slice(0,-1))));
  if (indexedRemoval) {
    const expected = clone(current), inheritedValue = inherit ? originalAt(path) : value;
    if (remove || inherit && inheritedValue === undefined) removeAt(expected,path);
    else setAt(expected,path,inheritedValue);
    validateCard(expected);
    const sameValues = (a,b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b,key) && sameValues(a[key],b[key]));
    };
    let candidate;
    try {candidate = resolveTemplate(library,id,result);} catch { /* Raw historical index operations may no longer split safely. */ }
    if (candidate && sameValues(candidate,expected)) return result;
    if (inherit) throw Error('Diese lokale Listenhistorie lässt sich für das einzelne Feld nicht verlustfrei zurückverknüpfen. Lokale Listenanpassung neu aus vollständigem YAML übernehmen oder den ganzen Listenbereich wieder aus der Vorlage übernehmen.');
    // Retain the original ordering and apply a field edit after its historical
    // index operations. This keeps every other card and its inheritance intact.
    const fallback = [...clone(overrides || []), remove ? {path:clone(path),remove:true} : {path:clone(path),value:clone(value)}];
    const resolved = resolveTemplate(library,id,fallback);
    if (!sameValues(resolved,expected)) throw Error('Die lokale Listenänderung konnte nicht übernommen werden. Vollständige lokale YAML-Konfiguration verwenden.');
    return fallback;
  }
  resolveTemplate(library, id, result);
  return result;
}
export function restoreBindings(library, id, config, current = resolveTemplate(library, id)) {
  const bindings = library.templates[id].bindings || [];
  // Check list structure before restoring protected values: setAt may otherwise
  // append a removed last item and disguise the original truncation.
  for (const binding of bindings) {
    for (let length = 1; length < binding.path.length; length++) {
      const parentPath = binding.path.slice(0, length);
      const before = getAt(current, parentPath), after = getAt(config, parentPath);
      if (Array.isArray(before) && (!Array.isArray(after) || before.length !== after.length)) throw Error('Die Struktur dieser Liste wird zentral verwaltet.');
    }
    setAt(config, binding.path, bindingValue(library, binding));
  }
  return config;
}
export function editorOverrides(library, id, overrides, edited) {
  const current = resolveTemplate(library, id, overrides);
  if (!edited || Array.isArray(edited) || typeof edited !== 'object') throw Error('Ungültige Editor-Konfiguration');
  const next = {...clone(edited), type: current.type};
  const bindings = library.templates[id].bindings || [];
  restoreBindings(library, id, next, current);
  validateCard(next);
  let result = clone(overrides || []);
  function diff(before, after, path) {
    if (JSON.stringify(before) === JSON.stringify(after) || path[0] === 'type') return;
    if (bindings.some(b => b.path.length <= path.length && b.path.every((k, i) => k === path[i]))) return;
    if (Array.isArray(before) && Array.isArray(after) && bindings.some(b => overlap(b.path, path))) {
      if (before.length !== after.length) throw Error('Die Struktur dieser Liste wird zentral verwaltet.');
      for (let i = 0; i < before.length; i++) diff(before[i], after[i], [...path, i]);
      return;
    }
    if (before && after && typeof before === 'object'  && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) diff(before[key], after[key], [...path, key]);
    } else {
      result = updateLocalField(library, id, result, path, after, false, true, after === undefined);
    }
  }
  diff(current, next, []);
  resolveTemplate(library, id, result); return result;
}
// Design fields are explicit because custom cards have no common configuration schema.
export function designOverrides(library, id, current = []) {
  const template = library.templates[id];
  if (!template?.design_paths?.length) throw Error('Zuerst Designfelder in der Vorlage markieren.');
  const resolved = resolveTemplate(library, id, current);
  const result = [];
  const inherited = [...(template.bindings || []).map(binding => binding.path), ...template.design_paths];
  const inheritedAt = path => inherited.some(parent => parent.length <= path.length && parent.every((key, i) => key === path[i]));
  function visit(value, path) {
    if (path[0] === 'type' || inheritedAt(path)) return;
    if (!inherited.some(p => overlap(p, path))) {
      result.push({path: clone(path), value: clone(value)}); return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, Array.isArray(value) ? Number(key) : key]);
    }
  }
  // Traverse from each root field; the empty path would overlap every binding.
  for (const [key, value] of Object.entries(resolved)) visit(value, [key]);
  // A missing field is also a local choice; traversing only present fields loses it.
  function preserveMissing(before, after, path) {
    if (path[0] === 'type' || inheritedAt(path) || result.some(override => override.path.length <= path.length && override.path.every((key, i) => key === path[i]))) return;
    if (after === undefined && !inherited.some(parent => overlap(parent, path))) {
      result.push({path: clone(path), remove: true}); return;
    }
    if (before && typeof before === 'object') {
      const entries = Object.entries(before);
      if (Array.isArray(before)) entries.reverse();
      for (const [key, value] of entries) {
        const part = Array.isArray(before) ? Number(key) : key;
        preserveMissing(value, after != null && Object.hasOwn(after, key) ? after[key] : undefined, [...path, part]);
      }
    }
  }
  const baseline = resolveTemplate(library, id);
  for (const [key, value] of Object.entries(baseline)) preserveMissing(value, resolved[key], [key]);
  resolveTemplate(library, id, result);
  return result;
}
export function validateDesignPaths(template) {
  if (!Array.isArray(template.design_paths === undefined ? [] : template.design_paths)) throw Error('Designfelder müssen eine Liste sein');
  const seen = [];
  for (const path of template.design_paths || []) {
    validatePath(path);
    let cursor = template.config;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || (Array.isArray(cursor) ? !Number.isInteger(key) : typeof key !== 'string') || !Object.hasOwn(cursor, key)) throw Error('Designpfad passt nicht zur Konfiguration');
      cursor = cursor[key];
    }
    if (path[0] === 'type' || seen.some(p => overlap(p, path))) throw Error('Ungültige oder überlappende Designfelder');
    seen.push(path);
  }
}
export function overlap(a, b) { return a.slice(0, b.length).every((v, i) => v === b[i]) || b.slice(0, a.length).every((v, i) => v === a[i]); }

export function bindingValue(library, binding) {
  if (binding.person) {
    const person = library.people && Object.hasOwn(library.people, binding.person) ? library.people[binding.person] : null;
    if (!person || !['name', 'color'].includes(binding.field)) throw Error('Person oder Personenfeld fehlt');
    return person[binding.field];
  }
  const group = Object.hasOwn(library.groups, binding.group) ? library.groups[binding.group] : null;
  if (!group) throw Error('Gemeinsame Einstellung fehlt: ' + binding.group);
  return group.value;
}
export function walkCards(config) {
  const found = [];
  function walk(node, path, forceCard = false, stateMap = false) {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && typeof node.type === 'string' &&
      (node.type === 'custom:library-card' || forceCard || ['cards', 'badges'].includes(path.at(-2)) || path.at(-1) === 'card')) found.push({config: clone(node), path});
    for (const [key, value] of Object.entries(node)) walk(value, [...path, Array.isArray(node) ? Number(key) : key], stateMap, key === 'states' && node.type === 'custom:state-switch');
  }
  walk(config, []); return found;
}
export function dependencies(config, explicit = []) {
  const types = new Set(), entities = new Set();
  function walk(node, key = '') {
    if (typeof node === 'string' && (key === 'entity' || key.startsWith('entity_') || key === 'entity_id' || key === 'calendar' || key === 'calendars' || key === 'entities') && /^[a-z_]+\.[a-z0-9_]+$/i.test(node)) entities.add(node);
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string' && node.type.startsWith('custom:')) types.add(node.type.slice(7));
    for (const [k, v] of Object.entries(node)) walk(v, Array.isArray(node) ? key : k);
  }
  walk(config);
  return {types: [...types], entities: [...entities], resources: [...explicit]};
}
export function exportLibrary(state) {
  return {format: 'ha-card-library', version: 2, library: {templates: clone(state.templates), groups: clone(state.groups), people: clone(state.people || {})}};
}
export function popupTemplateInfo(config, get = path => getAt(config, path)) {
  const isPopup = path => get([...path, 'type']) === 'custom:bubble-card' && get([...path, 'card_type']) === 'pop-up';
  if (isPopup([])) return {path: [], hash: get(['hash']), supported: Array.isArray(get(['cards']))};
  const header = ['cards', 0];
  if (get(['type']) === 'vertical-stack' && Array.isArray(get(['cards'])) && isPopup(header)) {
    return {path: header, hash: get([...header, 'hash']), supported: get([...header, 'cards']) === undefined};
  }
  return null;
}
export function popupTemplateRoute(library, template) {
  // Read only structural fields. Rendering-route updates must not resolve and
  // copy the contents of every saved popup or unrelated shared setting.
  const get = path => {
    const binding = template.bindings?.find(item => item.path.length <= path.length && item.path.every((key, index) => key === path[index]));
    return binding ? getAt(bindingValue(library, binding), path.slice(binding.path.length)) : getAt(template.config, path);
  };
  const info = popupTemplateInfo(template.config, get), explicit = Object.hasOwn(template, 'popup');
  // Existing standalone legacy popup headers remain ordinary reusable cards;
  // only complete native formats may acquire an automatic hash route.
  if (!explicit && info && !info.supported) return null;
  const hash = explicit ? template.popup?.hash : info?.hash;
  if (!explicit && (hash === undefined || hash === null || hash === '')) return null;
  if (info && !info.supported) throw Error('Für diese Popup-Vorlage eine eigenständige Bubble-Popup-Karte mit cards oder einen vertical-stack mit Popup-Kopf ohne eigene cards speichern');
  return {hash, options: explicit ? template.popup?.options ?? {} : {}, native: Boolean(info), preload: template.preload === true};
}
// Route indexing reads metadata and structural fields only. Local exceptions
// are applied when that particular alias is selected, never to every saved card.
export function popupTemplateRoutes(library, template) {
  const base = popupTemplateRoute(library, template);
  return [...(base ? [base] : []), ...(template.popup_links || []).map(link => ({
    hash:link.hash, options:{...(template.popup?.options || {}), ...(link.options || {})},
    overrides:link.overrides ?? [], native:Boolean(base?.native), preload:link.preload ?? template.preload === true
  }))];
}
export function validatePopupContent(config) {
  const info = popupTemplateInfo(config);
  if (info && !info.supported) throw Error('Für diese Popup-Vorlage eine eigenständige Bubble-Popup-Karte mit cards oder einen vertical-stack mit Popup-Kopf ohne eigene cards speichern');
  function visit(node, path = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'custom:bubble-card' && node.card_type === 'pop-up' &&
        (!info || path.length !== info.path.length || path.some((key,index) => key !== info.path[index]))) throw Error('Popup-Inhalte dürfen keine verschachtelten Bubble-Popups enthalten');
    for (const [key,value] of Object.entries(node)) visit(value,[...path,Array.isArray(node) ? Number(key) : key]);
  }
  visit(config);
  return info;
}
export function validatePopupRoutes(library, resolveLinks = true) {
  const hashes = new Set();
  function validateOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || ['type', 'card_type', 'hash', 'cards'].some(key => Object.hasOwn(options, key))) throw Error('Ungültige Popup-Einstellungen');
    validateJson(options);
  }
  for (const [id,template] of Object.entries(library.templates)) {
    if (Object.hasOwn(template, 'preload') && typeof template.preload !== 'boolean') throw Error('Popup-Vorladen muss ein Wahrheitswert sein');
    if (Object.hasOwn(template, 'popup')) {
      const metadata = template.popup;
      if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || Object.keys(metadata).some(key => !['hash', 'options'].includes(key))) throw Error('Ungültige Popup-Zuordnung');
      validateOptions(metadata.options === undefined ? {} : metadata.options);
    }
    if (Object.hasOwn(template,'popup_links')) {
      if (!Array.isArray(template.popup_links)) throw Error('Popup-Verknüpfungen müssen eine Liste sein');
      validateJson(template.popup_links);
      for (const link of template.popup_links) {
        if (!link || typeof link !== 'object' || Array.isArray(link) || !Object.hasOwn(link,'hash') || Object.keys(link).some(key => !['hash','overrides','options','preload'].includes(key))) throw Error('Ungültige Popup-Verknüpfung');
        if (Object.hasOwn(link,'preload') && typeof link.preload !== 'boolean') throw Error('Popup-Vorladen muss ein Wahrheitswert sein');
        if (Object.hasOwn(link,'overrides') && !Array.isArray(link.overrides)) throw Error('Lokale Anpassungen müssen eine Liste sein');
        validateOptions(link.options === undefined ? {} : link.options);
        if (resolveLinks) validatePopupContent(resolveTemplate(library,id,link.overrides ?? []));
      }
    }
    for (const route of popupTemplateRoutes(library,template)) {
      if (typeof route.hash !== 'string' || route.hash.match(/^#[A-Za-z0-9_-]{1,100}$/)?.[0] !== route.hash || route.hash.startsWith('#card-library-popup-')) throw Error('Popup-Hash muss mit # beginnen und darf nur Buchstaben, Zahlen, _ und - enthalten');
      if (hashes.has(route.hash)) throw Error('Popup-Hash ist bereits einer anderen Vorlage oder Verknüpfung zugeordnet');
      hashes.add(route.hash);
    }
  }
}
export function importLibrary(input) {
  if (!input || input.format !== 'ha-card-library' || ![1, 2].includes(input.version)) throw Error('Unbekanntes Exportformat');
  const source = input.library;
  if (!source || Array.isArray(source) || typeof source !== 'object') throw Error('Bibliothek fehlt');
  validateJson(source);
  validateSerializedSize(Object.hasOwn(source, 'people') ? source : {...source, people:{}});
  const library = clone(source);
  if (Object.keys(library).some(key => !['templates','groups','people'].includes(key))) throw Error('Unbekannte Bibliotheksfelder');
  if (!Object.hasOwn(library, 'people')) library.people = {};
  validateJson(library);
  for (const key of ['templates', 'groups', 'people']) {
    if (!library[key] || Array.isArray(library[key]) || typeof library[key] !== 'object') throw Error('Ungültige Bibliothek');
    for (const [id, item] of Object.entries(library[key])) {
      if (!id || [...id].length > 128 || forbidden.has(id) || !item || Array.isArray(item) || !hasText(item.name)) throw Error('Ungültiger Eintrag');
    }
  }
  for (const group of Object.values(library.groups)) if (!Object.hasOwn(group,'value')) throw Error('Gemeinsame Einstellung ohne Wert');
  for (const person of Object.values(library.people)) {
    if (typeof person.color !== 'string' || person.color.match(/^#[0-9a-f]{6}$/i)?.[0] !== person.color) throw Error('Ungültige Personenfarbe');
  }
  for (const template of Object.values(library.templates)) {
    validateCard(template.config);
    if (!Array.isArray(template.bindings === undefined ? [] : template.bindings)) throw Error('Verknüpfungen müssen eine Liste sein');
    if (!Array.isArray(template.dependencies === undefined ? [] : template.dependencies) || (template.dependencies || []).some(url => typeof url !== 'string' || !/^(https?:\/\/|\/)/.test(url))) throw Error('Ungültige Ressourcenabhängigkeiten');
    const paths = [];
    for (const binding of template.bindings || []) {
      if (!binding || Array.isArray(binding) || typeof binding !== 'object') throw Error('Ungültige Verknüpfung');
      validatePath(binding.path);
      if (binding.path[0] === 'type' || Object.hasOwn(binding,'person') && Object.hasOwn(binding,'group')) throw Error('Ungültige Verknüpfung');
      if (Object.hasOwn(binding,'person') && (typeof binding.person !== 'string' || !Object.hasOwn(library.people,binding.person) || !['name','color'].includes(binding.field))) throw Error('Person oder Personenfeld fehlt');
      if (!Object.hasOwn(binding,'person') && (typeof binding.group !== 'string' || !Object.hasOwn(library.groups,binding.group))) throw Error('Gemeinsame Einstellung fehlt');
      if (paths.some(path => overlap(path, binding.path))) throw Error('Überlappende Verknüpfungen');
      paths.push(binding.path);
    }
  }
  for (const template of Object.values(library.templates)) validateInputDefinitions(template);
  for (const id of Object.keys(library.templates)) validateDesignPaths({...library.templates[id], config: resolveTemplate(library, id)});
  validatePopupRoutes(library);
  return library;
}
export function changedTemplates(before, after) {
  return [...new Set([...Object.keys(before.templates), ...Object.keys(after.templates)])].filter(id => {
    if (!Object.hasOwn(before.templates, id) || !Object.hasOwn(after.templates, id)) return true;
    return JSON.stringify(resolveTemplate(before, id)) !== JSON.stringify(resolveTemplate(after, id));
  });
}

export function newId(provider = globalThis.crypto) {
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  const bytes = new Uint8Array(16);
  provider.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
