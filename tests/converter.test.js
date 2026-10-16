import {test} from 'node:test';
import assert from 'node:assert/strict';
import {convertButtonCard} from '../custom_components/card_library/frontend/library-card-converter.js';
import {resolveTemplate} from '../custom_components/card_library/frontend/library-core.js';

const library = () => ({templates: {roller: {name: 'Rollladen', config: {
  type: 'custom:button-card', show_state: false, show_label: true,
  variables: {entity_cover: '', entity_modus: '', entity_beschattung: '', entity_override_auto: '', entity_override_besch: '', friendly_name: 'Fenster', nav_anchor: 'rolllade_info'},
  entity: '[[[ return variables.entity_cover; ]]]',
  name: '[[[ return variables.friendly_name; ]]]',
  tap_action: {action: 'navigate', navigation_path: "[[[ return '#' + variables.nav_anchor; ]]]"},
  styles: {card: [{padding: '12px'}, {'border-radius': '12px'}]},
}, bindings: []}}, groups: {}, people: {}});
const call = (extra = {}) => ({type: 'custom:button-card', template: 'rolladen_karte', ...extra});
const reference = (overrides = [], extra = {}) => ({type: 'custom:library-card', template: 'roller', overrides, ...extra});
const convert = (source, state = library(), current) => convertButtonCard(state, 'roller', source, current);
const resolved = (state, result) => resolveTemplate(state, 'roller', result.config.overrides);

test('the real roller call becomes exactly seven local variable overrides', () => {
  const state = library(), variables = {
    entity_cover: 'cover.rolllade_kuchenfenster_3',
    entity_modus: 'sensor.rollladen_modus_kuchenfenster',
    entity_beschattung: 'sensor.rollladen_beschattung_modus_kuchenfenster',
    entity_override_auto: 'input_boolean.rollladen_modus_override_kuchenfenster',
    entity_override_besch: 'input_boolean.rollladen_beschattung_modus_override_kuchenfenster',
    friendly_name: 'Küchenfenster', nav_anchor: 'rolllade_kuchenfenster_info',
  };
  const result = convert(call({variables}), state);
  assert.equal(result.sourceTemplate, 'rolladen_karte');
  assert.equal(result.config.type, 'custom:library-card');
  assert.equal(result.config.template, 'roller');
  assert.deepEqual(result.config.overrides, Object.entries(variables).map(([key, value]) => ({path: ['variables', key], value})));
  assert.deepEqual(resolved(state, result).variables, variables);
  assert.equal(resolved(state, result).entity, state.templates.roller.config.entity);
  assert.deepEqual(result.notices, []);
});

test('explicit source values equal to the central default stay local after central changes', () => {
  const state = library(), result = convert(call({variables: {friendly_name: 'Fenster'}}), state);
  assert.deepEqual(result.config.overrides, [{path: ['variables', 'friendly_name'], value: 'Fenster'}]);
  state.templates.roller.config.variables.friendly_name = 'Neue Bezeichnung';
  assert.equal(resolved(state, result).variables.friendly_name, 'Fenster');
});

test('false, zero, null and empty strings are explicit local values', () => {
  const state = library(), result = convert(call({show_state: false, variables: {count: 0, empty: '', enabled: false, optional: null}}), state);
  assert.equal(result.config.overrides.length, 5);
  assert.deepEqual(resolved(state, result).variables, {...state.templates.roller.config.variables, count: 0, empty: '', enabled: false, optional: null});
});

test('missing source fields inherit subsequent central changes without removal operations', () => {
  const state = library(), result = convert(call({variables: {friendly_name: 'Küche'}}), state);
  state.templates.roller.config.styles.card.push({color: 'red'});
  state.templates.roller.config.tap_action.action = 'more-info';
  assert.deepEqual(resolved(state, result).styles, state.templates.roller.config.styles);
  assert.equal(resolved(state, result).tap_action.action, 'more-info');
  assert.ok(result.config.overrides.every(operation => !operation.remove));
});

test('source, library and existing reference are not mutated or aliased by the result', () => {
  const state = library(), source = call({variables: {nested: {items: ['x']}}}), current = reference([], {custom_metadata: {name: 'keep'}});
  const before = structuredClone([state, source, current]), result = convert(source, state, current);
  assert.deepEqual([state, source, current], before);
  result.config.custom_metadata.name = 'changed';
  result.config.overrides[0].value.push('changed');
  assert.deepEqual([state, source, current], before);
});

test('an explicitly selected template needs no matching external template name', () => {
  const result = convert(call({template: 'a_different_dashboard_name', variables: {friendly_name: 'Küche'}}));
  assert.equal(result.config.template, 'roller');
  assert.equal(result.sourceTemplate, 'a_different_dashboard_name');
});

test('a one-element static template list is accepted', () => {
  assert.equal(convert(call({template: ['rolladen_karte']})).sourceTemplate, 'rolladen_karte');
});

test('a single inline Button Card without a template can be overlaid on the selected library template', () => {
  const result = convert({type: 'custom:button-card', name: 'Kitchen'});
  assert.equal(result.sourceTemplate, null);
  assert.deepEqual(result.config.overrides, [{path: ['name'], value: 'Kitchen'}]);
});

test('a complete non-template source uses absolute lists instead of duplicating the template basis', () => {
  const state = library(), source = structuredClone(state.templates.roller.config), result = convert(source, state);
  assert.deepEqual(resolved(state, result).styles.card, source.styles.card);
  assert.match(result.notices.join(' '), /vollständig lokal übernommen/);
  assert.deepEqual(convert(source, state, result.config), result);
});

test('non-template state and extra_styles are absolute values without inherited contributions', () => {
  const state = library(); state.templates.roller.config.state = [{id: 'on', value: 'on', color: 'blue'}];
  state.templates.roller.config.extra_styles = '[[[ throw new Error("central is not combined"); ]]]';
  const source = {type: 'custom:button-card', state: [{id: 'on', color: 'red'}], extra_styles: ' \n#name { color: red; }\n '}, result = convert(source, state);
  assert.deepEqual(resolved(state, result).state, source.state);
  assert.equal(resolved(state, result).extra_styles, source.extra_styles);
});

test('variables must be an indented mapping and malformed pasted YAML receives a specific explanation', () => {
  for (const variables of [null, [], ['cover.kitchen'], 'cover.kitchen', 0, false]) {
    assert.throws(() => convert(call({variables, entity_cover: 'cover.kitchen'})), /variables muss ein YAML-Objekt.*einrücken/);
  }
});

test('multiple or empty template lists are rejected without changing the reference', () => {
  const current = reference(), before = structuredClone(current);
  for (const template of [[], ['a', 'b']]) assert.throws(() => convert(call({template}), library(), current), /genau eine statische/);
  assert.deepEqual(current, before);
});

test('dynamic, blank and non-text template names are rejected without executing JavaScript', () => {
  globalThis.converterExecuted = false;
  for (const template of ['[[[ globalThis.converterExecuted = true; return "x"; ]]]', '{{ name }}', '{% if x %}', '', '   ', null, 7, {name: 'a'}]) {
    assert.throws(() => convert(call({template})), /fester Vorlagenname|Dynamische/);
  }
  assert.equal(globalThis.converterExecuted, false);
  delete globalThis.converterExecuted;
});

test('only one native Button Card source is accepted', () => {
  for (const source of [null, [], [call()], 'yaml', {}, {type: 'vertical-stack', cards: [call()]}, {type: 'custom:library-card', template: 'roller'}]) {
    assert.throws(() => convert(source), /einzelnen Karte/);
  }
});

test('the selected target must exist and be a native Button Card', () => {
  const state = library(); delete state.templates.roller;
  assert.throws(() => convert(call(), state), /Vorlage fehlt/);
  state.templates.roller = {config: {type: 'markdown', content: 'wrong'}};
  assert.throws(() => convert(call(), state), /Button Card/);
});

test('an existing reference must belong to the selected template', () => {
  for (const current of [{type: 'custom:button-card', template: 'roller'}, reference([], {template: 'other'}), {}, null]) {
    assert.throws(() => convert(call(), library(), current), /gehört nicht/);
  }
});

test('invalid existing override lists are rejected rather than silently cleared', () => {
  for (const overrides of [null, {}, 'invalid']) assert.throws(() => convert(call(), library(), reference(overrides)), /Lokale Anpassungen müssen eine Liste/);
});

test('unmentioned existing local fields and reference metadata survive conversion', () => {
  const state = library(), current = reference([
    {path: ['variables', 'nav_anchor'], value: 'old-local'},
    {path: ['tap_action', 'navigation_path'], value: '#local'},
    {path: ['show_label'], remove: true},
  ], {popup_content: 'auto', arbitrary: {keep: true}});
  const result = convert(call({variables: {friendly_name: 'Küche'}}), state, current), config = resolved(state, result);
  assert.equal(config.variables.nav_anchor, 'old-local');
  assert.equal(config.tap_action.navigation_path, '#local');
  assert.equal(config.show_label, undefined);
  assert.equal(result.config.popup_content, 'auto');
  assert.deepEqual(result.config.arbitrary, {keep: true});
});

test('only supplied children replace an existing ancestor object override', () => {
  const state = library(), current = reference([{path: ['variables'], value: {...state.templates.roller.config.variables, friendly_name: 'Old', nav_anchor: 'keep-me'}}]);
  const result = convert(call({variables: {friendly_name: 'New'}}), state, current);
  assert.equal(resolved(state, result).variables.friendly_name, 'New');
  assert.equal(resolved(state, result).variables.nav_anchor, 'keep-me');
});

test('all HA placement fields are copied to the outer reference', () => {
  const placement = {grid_options: {columns: 6, rows: 2}, layout_options: {grid_column: 1}, view_layout: {grid_area: 'roller'}, visibility: [{condition: 'user', users: ['user-1']}]};
  const result = convert(call(placement));
  for (const [key, value] of Object.entries(placement)) assert.deepEqual(result.config[key], value);
  assert.equal(result.config.overrides, undefined);
});

test('source placement fields replace only the supplied outer fields', () => {
  const current = reference([], {grid_options: {columns: 12}, view_layout: {grid_area: 'keep'}, visibility: [{condition: 'screen', media_query: '(min-width: 1px)'}]});
  const result = convert(call({grid_options: {columns: 6}}), library(), current);
  assert.deepEqual(result.config.grid_options, {columns: 6});
  assert.deepEqual(result.config.view_layout, current.view_layout);
  assert.deepEqual(result.config.visibility, current.visibility);
});

test('partial source placement mappings preserve unmentioned local children', () => {
  const current = reference([], {grid_options: {columns: 12, rows: 4}});
  assert.deepEqual(convert(call({grid_options: {columns: 6}}), library(), current).config.grid_options, {columns: 6, rows: 4});
});

test('card_mod, theme and local actions stay on the resolved inner Button Card', () => {
  const state = library(), result = convert(call({card_mod: {style: 'ha-card { color: red; }'}, theme: 'Dark', tap_action: {action: 'more-info'}}), state);
  const config = resolved(state, result);
  assert.equal(result.config.card_mod, undefined);
  assert.equal(result.config.theme, undefined);
  assert.equal(config.card_mod.style, 'ha-card { color: red; }');
  assert.equal(config.theme, 'Dark');
  assert.equal(config.tap_action.action, 'more-info');
  assert.equal(config.tap_action.navigation_path, state.templates.roller.config.tap_action.navigation_path);
});

test('local style arrays concatenate with the central basis and warn about their local snapshot', () => {
  const state = library(), source = call({styles: {card: [{color: 'red'}]}}), result = convert(source, state);
  assert.deepEqual(resolved(state, result).styles.card, [...state.templates.roller.config.styles.card, {color: 'red'}]);
  assert.deepEqual(result.config.overrides, [{path: ['styles', 'card'], value: [...state.templates.roller.config.styles.card, {color: 'red'}]}]);
  assert.match(result.notices.join(' '), /Listenfeld.*styles.card.*aktuellen zentralen Stand/);
});

test('repeated style conversion does not concatenate the imported list a second time', () => {
  const state = library(), source = call({styles: {card: [{color: 'red'}]}}), first = convert(source, state), second = convert(source, state, first.config);
  assert.deepEqual(second, first);
});

test('repeated conversion of primitive fields is idempotent and preserves unrelated overrides', () => {
  const state = library(), source = call({variables: {friendly_name: 'Küche'}}), first = convert(source, state, reference([{path: ['icon'], value: 'mdi:window-shutter'}]));
  assert.deepEqual(convert(source, state, first.config), first);
});

test('new conversions refresh only the supplied list against the current central basis', () => {
  const state = library(), source = call({styles: {card: [{color: 'red'}]}}), first = convert(source, state);
  state.templates.roller.config.styles.card.push({margin: '4px'});
  state.templates.roller.config.styles.icon = [{width: '20px'}];
  const second = convert(source, state, first.config);
  assert.deepEqual(resolved(state, second).styles.card, [...state.templates.roller.config.styles.card, {color: 'red'}]);
  assert.deepEqual(resolved(state, second).styles.icon, [{width: '20px'}]);
});

test('ordinary lists use Button Card one-level flattening on concatenation', () => {
  const state = library(); state.templates.roller.config.triggers_update = ['sensor.central'];
  const result = convert(call({triggers_update: [['sensor.a', 'sensor.b'], 'sensor.c']}), state);
  assert.deepEqual(resolved(state, result).triggers_update, ['sensor.central', 'sensor.a', 'sensor.b', 'sensor.c']);
});

test('state IDs merge, ID-less states append and untouched states survive', () => {
  const state = library(); state.templates.roller.config.state = [{id: 'on', value: 'on', color: 'blue', styles: {card: [{opacity: '1'}]}}, {value: 'off', color: 'gray'}];
  const result = convert(call({state: [{id: 'on', color: 'red', styles: {card: [{border: '0'}]}}, {value: 'unknown', color: 'yellow'}]}), state);
  assert.deepEqual(resolved(state, result).state, [{id: 'on', value: 'on', color: 'red', styles: {card: [{opacity: '1'}, {border: '0'}]}}, {value: 'off', color: 'gray'}, {value: 'unknown', color: 'yellow'}]);
});

test('state IDs match native truthiness and loose comparison including non-merging zero IDs', () => {
  const state = library(); state.templates.roller.config.state = [{id: 1, color: 'blue'}, {id: 0, color: 'gray'}];
  const result = convert(call({state: [{id: '1', color: 'red'}, {id: 0, color: 'yellow'}]}), state);
  assert.deepEqual(resolved(state, result).state, [{id: '1', color: 'red'}, {id: 0, color: 'gray'}, {id: 0, color: 'yellow'}]);
});

test('state merge is idempotent across repeated imports', () => {
  const state = library(); state.templates.roller.config.state = [{id: 'on', value: 'on'}];
  const source = call({state: [{id: 'on', color: 'red'}, {value: 'off'}]}), first = convert(source, state);
  assert.deepEqual(convert(source, state, first.config), first);
});

test('malformed state and mixed list/object inheritance are rejected', () => {
  for (const state of [null, {}, ['on'], [null]]) assert.throws(() => convert(call({state})), /state muss/);
  assert.throws(() => convert(call({styles: {card: {color: 'red'}}})), /mischt Liste und Objekt/);
  const state = library(); state.templates.roller.config.variables = {x: {a: 1}};
  assert.throws(() => convert(call({variables: {x: ['a']}}), state), /mischt Liste und Objekt/);
});

test('static extra_styles preserve both contributions with an explicit local snapshot notice', () => {
  const state = library(); state.templates.roller.config.extra_styles = '  #name { color: blue; }\n';
  const source = call({extra_styles: '\n#name { color: red; }  '}), first = convert(source, state);
  assert.equal(resolved(state, first).extra_styles, '#name { color: blue; }\n#name { color: red; }');
  assert.match(first.notices.join(' '), /lokaler CSS-Stand/);
  assert.deepEqual(convert(source, state, first.config), first);
});

test('a sole JavaScript extra_styles contribution is preserved literally without execution', () => {
  const state = library(), style = '[[[ throw new Error("must not run"); ]]]', result = convert(call({extra_styles: style}), state);
  assert.equal(resolved(state, result).extra_styles, style);
});

test('a sole static extra_styles contribution is preserved byte for byte', () => {
  const state = library(), style = ' \n#name { color: red; }\n  ';
  assert.equal(resolved(state, convert(call({extra_styles: style}), state)).extra_styles, style);
});

test('an explicit empty extra_styles source keeps the central contribution with a local snapshot notice', () => {
  const state = library(); state.templates.roller.config.extra_styles = '#name { color: blue; }';
  const result = convert(call({extra_styles: ''}), state);
  assert.equal(resolved(state, result).extra_styles, state.templates.roller.config.extra_styles);
  assert.match(result.notices.join(' '), /lokaler CSS-Stand/);
});

test('separate central and local extra_styles with any JavaScript are rejected', () => {
  const state = library(); state.templates.roller.config.extra_styles = '[[[ return "#name {color: blue}"; ]]]';
  assert.throws(() => convert(call({extra_styles: '#name {color: red}'}), state), /getrennten Button-Card-Auswertungen/);
  state.templates.roller.config.extra_styles = '#name {color: blue}';
  assert.throws(() => convert(call({extra_styles: '[[[ return "#name {color: red}"; ]]]'}), state), /getrennten Button-Card-Auswertungen/);
  assert.throws(() => convert(call({extra_styles: 7}), state), /CSS-Text/);
});

test('matching shared bindings remain central while differing values reject the entire conversion', () => {
  const state = library(); state.groups.name = {name: 'Name', value: 'Central'};
  state.templates.roller.bindings = [{path: ['variables', 'friendly_name'], group: 'name'}];
  const result = convert(call({variables: {friendly_name: 'Central', nav_anchor: 'local'}}), state);
  assert.deepEqual(result.config.overrides, [{path: ['variables', 'nav_anchor'], value: 'local'}]);
  const current = reference(), before = structuredClone([state, current]);
  assert.throws(() => convert(call({icon: 'mdi:test', variables: {friendly_name: 'different'}}), state, current), /zentralen Bindung.*variables.friendly_name/);
  assert.deepEqual([state, current], before);
});

test('children matching a shared object remain central and protected list ancestry rejects partial snapshotting', () => {
  const state = library(); state.groups.variables = {name: 'Vars', value: {friendly_name: 'Central', nav_anchor: 'central'}};
  state.templates.roller.bindings = [{path: ['variables'], group: 'variables'}];
  assert.equal(convert(call({variables: {friendly_name: 'Central'}}), state).config.overrides, undefined);
  assert.throws(() => convert(call({variables: {friendly_name: 'Local'}}), state), /zentralen Bindung/);
  state.templates.roller.bindings = [{path: ['styles', 'card', 0, 'padding'], group: 'padding'}];
  state.groups.padding = {name: 'Padding', value: '12px'};
  assert.throws(() => convert(call({styles: {card: [{color: 'red'}]}}), state), /enthält eine zentrale Bindung/);
});

test('shared placement values always reject conversion including identical values without mutation', () => {
  const state = library(); state.groups.columns = {name: 'Columns', value: 6};
  state.templates.roller.bindings = [{path: ['grid_options', 'columns'], group: 'columns'}];
  const current = reference([], {grid_options: {columns: 12, rows: 4}});
  for (const columns of [6, 12]) {
    const source = call({grid_options: {columns}}), before = structuredClone([state, source, current]);
    assert.throws(() => convert(source, state, current), /Platzierungsfeld.*zentrale Bindung.*grid_options.columns/);
    assert.deepEqual([state, source, current], before);
  }
  for (const key of ['visibility', 'view_layout', 'layout_options']) {
    state.groups.placement = {name: 'Placement', value: key === 'visibility' ? [] : {area: 'roller'}};
    state.templates.roller.bindings = [{path: [key], group: 'placement'}];
    const source = call({[key]: structuredClone(state.groups.placement.value)}), before = structuredClone([state, source, current]);
    assert.throws(() => convert(source, state, current), /Platzierungsfeld.*zentrale Bindung/);
    assert.deepEqual([state, source, current], before);
  }
});

test('oversized sparse arrays in reference metadata cannot evade the size bound', () => {
  const sparse = Array(10000), current = reference([], {metadata: Array(100).fill(sparse)});
  assert.throws(() => convert(call(), library(), current), /2 MB/);
});

test('nested Button Card templates remain intact with a dashboard dependency notice', () => {
  const state = library(), result = convert(call({custom_fields: {nested: {card: {type: 'custom:button-card', template: 'nested_template', variables: {name: 'Nested'}}}}}), state);
  assert.equal(resolved(state, result).custom_fields.nested.card.template, 'nested_template');
  assert.match(result.notices.join(' '), /button_card_templates weiterhin im Dashboard/);
});

test('JavaScript in variables and actions is never executed or rewritten', () => {
  const code = '[[[ throw new Error("must not execute"); ]]]', state = library(), result = convert(call({variables: {x: code}, tap_action: {navigation_path: code}}), state);
  assert.equal(resolved(state, result).variables.x, code);
  assert.equal(resolved(state, result).tap_action.navigation_path, code);
});

test('keys containing dots are literal path segments and empty new objects are preserved', () => {
  const result = convert(call({variables: {'a.b': 'literal', empty: {}}}));
  assert.deepEqual(result.config.overrides, [{path: ['variables', 'a.b'], value: 'literal'}, {path: ['variables', 'empty'], value: {}}]);
});

test('required inputs may stay incomplete while the editor receives a clear notice', () => {
  const state = library(); state.templates.roller.inputs = [{path: ['variables', 'entity_cover'], label: 'Cover', type: 'entity', required: true, domains: ['cover']}];
  const result = convert(call({variables: {friendly_name: 'Kitchen'}}), state);
  assert.match(result.notices.join(' '), /Pflichtfeld fehlt: Cover/);
});

test('unsafe keys, cycles, excessive size and unsupported values are rejected before mutation', () => {
  const cycle = call(); cycle.variables = cycle;
  const invalid = [JSON.parse('{"type":"custom:button-card","variables":{"__proto__":{"polluted":true}}}'), cycle, call({variables: {large: 'x'.repeat(2000001)}}), call({variables: {value: undefined}})];
  for (const source of invalid) assert.throws(() => convert(source), /Unsicherer|zyklischen|2 MB|JSON-Werte/);
  assert.equal({}.polluted, undefined);
});
