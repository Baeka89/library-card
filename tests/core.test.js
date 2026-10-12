import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changedTemplates, resolveTemplate, setAt} from '../custom_components/card_library/frontend/library-core.js';

test('central popup aliases preserve local exceptions and inherit frame options through export', async () => {
  const {popupTemplateRoutes,exportLibrary,importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = library();
  state.templates.calendar.popup = {hash:'#calendar',options:{name:'Family',width_desktop:'900px'}};
  state.templates.calendar.popup_links = [
    {hash:'#week',overrides:[{path:['layout'],value:'week'}],options:{name:'Week'}},
    {hash:'#agenda',overrides:[{path:['layout'],value:'agenda'}]}
  ];
  const imported = importLibrary(exportLibrary(state));
  assert.deepEqual(imported.templates.calendar.popup_links,state.templates.calendar.popup_links);
  const routes = popupTemplateRoutes(imported,imported.templates.calendar);
  assert.deepEqual(routes.map(route=>route.hash),['#calendar','#week','#agenda']);
  assert.deepEqual(routes[1].options,{name:'Week',width_desktop:'900px'});
  assert.deepEqual(routes[2].options,{name:'Family',width_desktop:'900px'});
  assert.equal(resolveTemplate(imported,'calendar',routes[1].overrides).layout,'week');
  assert.equal(resolveTemplate(imported,'calendar').popup_links,undefined);
  imported.groups.colors.value[0].color = '#123456';
  assert.equal(resolveTemplate(imported,'calendar',routes[2].overrides).people[0].color,'#123456');
});

test('popup aliases share the base/native namespace and reject malformed metadata', async () => {
  const {validatePopupRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  for (const links of [null,{},[null],[{}],[{hash:'#'}],[{hash:'#bad\n'}],[{hash:'#card-library-popup-private'}],[{hash:'#link',template:'other'}],[{hash:'#link',overrides:{}}],[{hash:'#link',options:null}],[{hash:'#link',options:{hash:'#other'}}],[{hash:'#link',options:{cards:[]}}]]) {
    const state = library(); state.templates.calendar.popup_links = links;
    assert.throws(()=>validatePopupRoutes(state));
  }
  const state = library(); state.templates.calendar.popup = {hash:'#base'};
  state.templates.calendar.popup_links = [{hash:'#base'}]; assert.throws(()=>validatePopupRoutes(state),/bereits/);
  state.templates.calendar.popup_links = [{hash:'#link'},{hash:'#link'}]; assert.throws(()=>validatePopupRoutes(state),/bereits/);
  state.templates.calendar.popup_links = [{hash:'#native'}];
  state.templates.saver = {name:'Native',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[]}};
  assert.throws(()=>validatePopupRoutes(state),/bereits/);
});

test('popup alias validation applies existing override and central binding protections', async () => {
  const {validatePopupRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = library();
  for (const overrides of [[{path:['people',0,'color'],value:'red'}],[{path:['type'],value:'markdown'}],[{path:['layout']}],[{path:['__proto__','polluted'],value:true}]]) {
    state.templates.calendar.popup_links = [{hash:'#link',overrides}];
    assert.throws(()=>validatePopupRoutes(state));
  }
  state.templates.calendar.popup_links = [{hash:'#link',overrides:[{path:['layout'],remove:true}]}];
  assert.doesNotThrow(()=>validatePopupRoutes(state));
});

test('popup aliases reject unsupported or nested native popup configurations', async () => {
  const {validatePopupRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{t:{name:'Popup',config:{type:'custom:bubble-card',card_type:'pop-up',cards:[]},popup_links:[{hash:'#alias'}]}},groups:{},people:{}};
  assert.doesNotThrow(()=>validatePopupRoutes(state));
  state.templates.t.popup_links[0].overrides = [{path:['cards'],remove:true}];
  assert.throws(()=>validatePopupRoutes(state),/eigenständige/);
  state.templates.t.popup_links[0].overrides = [{path:['cards'],value:[{type:'custom:bubble-card',card_type:'pop-up',cards:[]}]}];
  assert.throws(()=>validatePopupRoutes(state),/verschachtelt/);
  state.templates.t.config = {type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up'},{type:'markdown',content:'Content'}]};
  delete state.templates.t.popup_links[0].overrides;
  assert.doesNotThrow(()=>validatePopupRoutes(state));
});

test('route indexing validates alias metadata without resolving unopened contents', async () => {
  const {validatePopupRoutes,popupTemplateRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{t:{name:'Popup',config:{type:'markdown'},bindings:[{path:['content'],group:'large'}],popup_links:[{hash:'#alias'}]}},groups:{large:{name:'Large'}},people:{}};
  Object.defineProperty(state.groups.large,'value',{get(){throw Error('Unopened content read');}});
  assert.doesNotThrow(()=>validatePopupRoutes(state,false));
  assert.equal(popupTemplateRoutes(state,state.templates.t)[0].hash,'#alias');
  assert.throws(()=>validatePopupRoutes(state),/Unopened/);
});

test('popup routes reject a Bubble popup frame introduced by a shared binding', async () => {
  const {validatePopupRoutes, importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{popup:{name:'Popup', config:{type:'custom:bubble-card',card_type:'button'}, bindings:[{path:['card_type'],group:'kind'}], popup:{hash:'#popup'}}}, groups:{kind:{name:'Kind',value:'pop-up'}}, people:{}};
  assert.throws(() => validatePopupRoutes(state), /eigenständige Bubble-Popup-Karte mit cards/);
  assert.throws(() => importLibrary({format:'ha-card-library',version:2,library:state}), /eigenständige Bubble-Popup-Karte mit cards/);
  state.groups.kind.value = 'button';
  assert.doesNotThrow(() => validatePopupRoutes(state));
  state.templates.popup.bindings.push({path:['color'],group:'unrelated'});
  state.groups.unrelated = {name:'Unrelated'};
  Object.defineProperty(state.groups.unrelated, 'value', {get() {throw Error('Unrelated binding read');}});
  assert.doesNotThrow(() => validatePopupRoutes(state));
});

const library = () => ({groups: {colors: {name: 'Personen', value: [{person: 'Anna', color: '#aa0000'}]}}, templates: {
  calendar: {name: 'Kalender', config: {type: 'custom:calendar', layout: 'month', people: []}, bindings: [{path: ['people'], group: 'colors'}]},
  saver: {name: 'Bildschirmschoner', config: {type: 'custom:calendar', layout: 'agenda', options: {people: []}}, bindings: [{path: ['options', 'people'], group: 'colors'}]},
}});
test('shared colors update both layouts without changing presentation', () => {
  const state = library();
  state.groups.colors.value[0].color = '#00aa00';
  assert.equal(resolveTemplate(state, 'calendar').people[0].color, '#00aa00');
  const saver = resolveTemplate(state, 'saver');
  assert.equal(saver.options.people[0].color, '#00aa00');
  assert.equal(saver.layout, 'agenda');
  saver.options.people[0].color = '#ffffff';
  assert.equal(state.groups.colors.value[0].color, '#00aa00');
});
test('local layout overrides work but cannot shadow central settings', () => {
  assert.equal(resolveTemplate(library(), 'calendar', [{path:['layout'], value:'week'}]).layout, 'week');
  assert.throws(() => resolveTemplate(library(), 'calendar', [{path:['people', 0, 'color'], value:'red'}]));
  assert.throws(() => resolveTemplate(library(), 'saver', [{path:['options'], value:{}}]));
});
test('missing dependencies and unsafe paths fail visibly', () => {
  const state = library(); delete state.groups.colors;
  assert.throws(() => resolveTemplate(state, 'calendar'), /Einstellung fehlt/);
  assert.throws(() => resolveTemplate(state, 'deleted'), /Vorlage fehlt/);
  assert.throws(() => setAt({}, ['__proto__', 'polluted'], true));
  assert.equal({}.polluted, undefined);
});

test('central people support different field names and renaming', async () => {
  const state = library(); state.people = {anna: {name:'Anna', color:'#113355'}};
  state.templates.calendar.bindings = [{path:['people',0,'color'],person:'anna',field:'color'}];
  state.templates.saver.bindings = [{path:['options','person_name'],person:'anna',field:'name'}];
  assert.equal(resolveTemplate(state,'calendar').people[0].color, '#113355');
  state.people.anna.name = 'Anna Müller';
  assert.equal(resolveTemplate(state,'saver').options.person_name, 'Anna Müller');
});

test('dashboard discovery finds section cards and nested cards, not config types', async () => {
  const {walkCards} = await import('../custom_components/card_library/frontend/library-core.js');
  const cards = walkCards({views:[{sections:[{type:'grid',cards:[{type:'vertical-stack',cards:[{type:'custom:library-card',template:'calendar'}]}, {type:'custom:chart', options:{type:'line'}}]}]}]});
  assert.deepEqual(cards.map(c => c.config.type), ['vertical-stack','custom:library-card','custom:chart']);
  assert.deepEqual(cards[1].path, ['views',0,'sections',0,'cards',0,'cards',0]);
});

test('export roundtrip preserves person bindings and resource dependencies', async () => {
  const {exportLibrary, importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = library(); state.people = {anna:{name:'Anna',color:'#112233'}};
  state.templates.calendar.dependencies = ['/hacsfiles/calendar/calendar.js'];
  const exported = JSON.parse(JSON.stringify(exportLibrary(state)));
  const imported = importLibrary(exported);
  assert.deepEqual(imported, state);
  imported.groups.colors.value[0].color = '#ffffff';
  assert.notEqual(state.groups.colors.value[0].color, '#ffffff');
  assert.throws(() => importLibrary({format:'unknown',version:2,library:state}));
  exported.library.templates.calendar.bindings[0].path = ['__proto__','x'];
  assert.throws(() => importLibrary(exported));
});

test('change preview finds every layout affected by a shared color', async () => {
  const {clone, changedTemplates} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = library(), candidate = clone(state);
  candidate.groups.colors.value[0].color = '#ffffff';
  assert.deepEqual(changedTemplates(state,candidate), ['calendar','saver']);
  assert.deepEqual(changedTemplates(state,state), []);
});

test('new template IDs work on plain HTTP where randomUUID is unavailable', async()=>{
  const {newId}=await import('../custom_components/card_library/frontend/library-core.js');
  const id=newId({getRandomValues:bytes=>bytes.fill(1)});
  assert.equal(id,'01010101-0101-4101-8101-010101010101');
  assert.match(newId(),/^[a-f0-9-]{36}$/);
});

test('invalid imports reject missing values, blank names, invalid dependencies and ambiguous bindings', async()=>{
  const {exportLibrary,importLibrary}=await import('../custom_components/card_library/frontend/library-core.js');
  for(const corrupt of [
    state=>delete state.groups.colors.value,
    state=>state.templates.calendar.name=' ',
    state=>state.templates.calendar.dependencies=['javascript:alert(1)'],
    state=>state.templates.calendar.bindings={},
    state=>state.templates.calendar.bindings[0].person='anna',
    state=>state.templates.calendar.config.type='',
    state=>state.people=null,
  ]) {
    const exported=exportLibrary(library());corrupt(exported.library);
    assert.throws(()=>importLibrary(exported));
  }
});

test('shared values and local overrides cannot inject recursive library cards',()=>{
  const state=library(); state.groups.colors.value=[{type:'custom:library-card',template:'calendar'}];
  assert.throws(()=>resolveTemplate(state,'calendar'),/eingebettet/);
  assert.throws(()=>resolveTemplate(library(),'calendar',[{path:['extra'],value:{type:'custom:library-manager'}}]),/eingebettet/);
});

test('binding paths cannot write primitive values, array properties or sparse indices',()=>{
  assert.throws(()=>setAt({x:5},['x','y'],1));
  assert.throws(()=>setAt({x:[]},['x','length'],99));
  assert.throws(()=>setAt({x:[]},['x',100000],99));
  assert.throws(()=>setAt({x:[]},['x',2],99));
  assert.throws(()=>setAt({},[false],99));
  assert.throws(()=>setAt({},[0],99));
  const valid={x:[]};setAt(valid,['x',0,'color'],'#123456');assert.equal(valid.x[0].color,'#123456');
});

test('missing inherited names do not resolve to prototype entries',()=>{
  assert.throws(()=>resolveTemplate(library(),'toString'),/Vorlage fehlt/);
  const state=library();state.templates.calendar.bindings[0].group='toString';
  assert.throws(()=>resolveTemplate(state,'calendar'),/Einstellung fehlt/);
});

test('non-finite numbers, unsafe nested keys and excessive nesting are rejected', async()=>{
  const {importLibrary,exportLibrary}=await import('../custom_components/card_library/frontend/library-core.js');
  const exported=exportLibrary(library());exported.library.groups.colors.value=Infinity;
  assert.throws(()=>importLibrary(exported));
  exported.library.groups.colors.value=JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(()=>importLibrary(exported));assert.equal({}.polluted,undefined);
  exported.library.groups.colors.value={};let cursor=exported.library.groups.colors.value;
  for(let i=0;i<70;i++)cursor=cursor.child={};
  assert.throws(()=>importLibrary(exported),/verschachtelt/);
});

const {designOverrides, validateDesignPaths, exportLibrary, importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
function designLibrary() {
  return {groups:{},people:{},templates:{test:{name:'Test',config:{type:'custom:test',entity:'sensor.a',entities:['sensor.b','sensor.c'],title:'Original',style:{color:'#001122',size:10}},bindings:[],design_paths:[['style']]}}};
}
test('design-only keeps information local while later design changes propagate', () => {
  const state=designLibrary(), overrides=designOverrides(state,'test');
  state.templates.test.config.entity='sensor.new'; state.templates.test.config.title='New'; state.templates.test.config.style.color='#ffffff';
  const result=resolveTemplate(state,'test',overrides);
  assert.equal(result.entity,'sensor.a'); assert.equal(result.title,'Original'); assert.equal(result.style.color,'#ffffff');
  assert.deepEqual(result.entities,['sensor.b','sensor.c']);
  assert.equal(resolveTemplate(state,'test').entity,'sensor.new');
});
test('design-only preserves local information and resets an existing local design override', () => {
  const state=designLibrary();const result=resolveTemplate(state,'test',designOverrides(state,'test',[{path:['entity'],value:'sensor.local'},{path:['style','size'],value:50}]));
  assert.equal(result.entity,'sensor.local');assert.equal(result.style.size,10);
});
test('mixed entity inheritance retains one entity locally and updates the other', () => {
  const state=designLibrary(); const overrides=[{path:['entities',0],value:'sensor.local'}];
  state.templates.test.config.entities=['sensor.new_a','sensor.new_b'];
  assert.deepEqual(resolveTemplate(state,'test',overrides).entities,['sensor.local','sensor.new_b']);
});
test('nested central binding does not accidentally lock sibling information', () => {
  const state=designLibrary(); state.groups.color={name:'Color',value:'#abcdef'};
  state.templates.test.bindings=[{path:['style','color'],group:'color'}]; state.templates.test.design_paths=[['title']];
  const overrides=designOverrides(state,'test'); assert.ok(overrides.some(o=>JSON.stringify(o.path)==='["style","size"]'));
  state.templates.test.config.style.size=20; state.groups.color.value='#123456';
  const result=resolveTemplate(state,'test',overrides);assert.equal(result.style.size,10);assert.equal(result.style.color,'#123456');
});
test('design presets support empty containers and null without sharing mutable data', () => {
  const state=designLibrary();Object.assign(state.templates.test.config,{empty:[],settings:{},optional:null});
  const overrides=designOverrides(state,'test');
  state.templates.test.config.empty.push('new');state.templates.test.config.settings.x=1;state.templates.test.config.optional='new';
  const result=resolveTemplate(state,'test',overrides); assert.deepEqual(result.empty,[]);assert.deepEqual(result.settings,{});assert.equal(result.optional,null);
});
test('design metadata survives exports and rejects invalid or overlapping fields', () => {
  const state=designLibrary();assert.deepEqual(importLibrary(exportLibrary(state)),state);
  for(const paths of [null, [['type']], [['missing']], [['style'],['style','color']], [['__proto__']]]) {
    state.templates.test.design_paths=paths;assert.throws(()=>importLibrary(exportLibrary(state)));
  }
  delete state.templates.test.design_paths;assert.throws(()=>designOverrides(state,'test'),/Designfelder/); validateDesignPaths(state.templates.test);
});
test('design fields supplied by central bindings validate against the resolved configuration', () => {
  const state=designLibrary(); state.groups.color={name:'Color',value:'#abcdef'};
  state.templates.test.bindings=[{path:['new_style'],group:'color'}];state.templates.test.design_paths=[['new_style']];
  assert.deepEqual(importLibrary(exportLibrary(state)).templates.test.design_paths,[['new_style']]);
  assert.equal(resolveTemplate(state,'test',designOverrides(state,'test')).new_style,'#abcdef');
});

const {updateLocalField} = await import('../custom_components/card_library/frontend/library-core.js');
test('relinking one child of a locally held list retains all other local entries', () => {
  const state=designLibrary();const overrides=[{path:['entities'],value:['sensor.local_a','sensor.local_b']}];
  state.templates.test.config.entities=['sensor.new_a','sensor.new_b'];
  const changed=updateLocalField(state,'test',overrides,['entities',0],undefined,true);
  assert.deepEqual(resolveTemplate(state,'test',changed).entities,['sensor.new_a','sensor.local_b']);
});
test('editing a nested local field preserves sibling overrides in parent objects', () => {
  const state=designLibrary();const overrides=[{path:['style'],value:{color:'#abcdef',size:50}}];
  const changed=updateLocalField(state,'test',overrides,['style','size'],100);
  assert.deepEqual(resolveTemplate(state,'test',changed).style,{color:'#abcdef',size:100});
  assert.throws(()=>updateLocalField(state,'test',changed,['missing'],true),/existiert/);
});
test('import rejects null optional lists consistently with the backend', () => {
  for(const field of ['bindings','dependencies']) {
    const state=designLibrary();state.templates.test[field]=null;assert.throws(()=>importLibrary(exportLibrary(state)));
  }
});
test('design paths distinguish numeric array indices from object keys', () => {
  const state=designLibrary();state.templates.test.config.indexed={'0':'value'};
  for(const path of [['entities','0'],['indexed',0]]) {state.templates.test.design_paths=[path];assert.throws(()=>importLibrary(exportLibrary(state)),/Designpfad/);}
  state.templates.test.design_paths=[['entities',0],['indexed','0']];assert.doesNotThrow(()=>importLibrary(exportLibrary(state)));
});
test('malformed local override collections have a recoverable validation error', () => {
  const state=designLibrary();for(const value of [null,{},[null],[{path:'entity',value:'sensor.a'}]]) assert.throws(()=>resolveTemplate(state,'test',value),/Lokale Anpassungen|lokale Anpassung/);
});
test('change comparison recognizes additions and removals with inherited-property names', () => {
  const before={templates:{},groups:{},people:{}};const after={templates:{toString:{name:'Valid ID',config:{type:'markdown',content:'Text'}}},groups:{},people:{}};
  assert.deepEqual(changedTemplates(before,after),['toString']);assert.deepEqual(changedTemplates(after,before),['toString']);
});
test('mixed local inheritance preserves siblings across 200 varied nested-list edits and resets', () => {
  for(let i=0;i<200;i++) {
    const state=designLibrary(), count=2+i%7;
    state.templates.test.config.rows=Array.from({length:count},(_,j)=>({entity:`sensor.base_${i}_${j}`,label:`Base ${j}`}));
    const local=Array.from({length:count},(_,j)=>({entity:`sensor.local_${i}_${j}`,label:`Local ${j}`}));const target=i%count,reset=i%3===0;
    const changed=updateLocalField(state,'test',[{path:['rows'],value:local}],['rows',target,'entity'],'sensor.changed',reset);
    const result=resolveTemplate(state,'test',changed);
    for(let j=0;j<count;j++) {
      assert.equal(result.rows[j].entity,j===target?(reset?state.templates.test.config.rows[j].entity:'sensor.changed'):local[j].entity);
      assert.equal(result.rows[j].label,local[j].label);
    }
    result.rows[0].label='Changed returned config';assert.equal(local[0].label,'Local 0');
  }
});
test('design-only handles deeply nested non-design content without generating oversized paths', () => {
  const state=designLibrary();let deep='leaf';for(let i=0;i<40;i++)deep={nested:deep};state.templates.test.config.deep=deep;
  const overrides=designOverrides(state,'test');assert.ok(overrides.some(o=>o.path.length===1&&o.path[0]==='deep'));
  assert.deepEqual(resolveTemplate(state,'test',overrides).deep,deep);
});
test('deep shared values are validated after insertion into the target card', () => {
  const state=designLibrary();let deep='leaf';for(let i=0;i<40;i++)deep={nested:deep};state.groups.deep={name:'Deep',value:deep};
  state.templates.test.bindings=[{path:Array(32).fill('nested'),group:'deep'}];assert.throws(()=>importLibrary(exportLibrary(state)),/tief/);
});
const {editorOverrides} = await import('../custom_components/card_library/frontend/library-core.js');
test('native local editor changes only changed fields and preserves explicit local snapshots', () => {
  const state=designLibrary();const frozen=[{path:['title'],value:'Original'}];const next=resolveTemplate(state,'test',frozen);next.entity='sensor.local';
  const changes=editorOverrides(state,'test',frozen,next);state.templates.test.config.title='Central new';state.templates.test.config.style.size=30;
  const result=resolveTemplate(state,'test',changes);assert.equal(result.title,'Original');assert.equal(result.entity,'sensor.local');assert.equal(result.style.size,30);
});
test('native local editor can add and remove optional settings without losing other overrides', () => {
  const state=designLibrary();const current=[{path:['entity'],value:'sensor.local'}];const next=resolveTemplate(state,'test',current);delete next.title;next.icon='mdi:home';
  const changes=editorOverrides(state,'test',current,next);assert.ok(changes.some(o=>o.remove&&o.path[0]==='title'));
  const result=resolveTemplate(state,'test',changes);assert.equal(Object.hasOwn(result,'title'),false);assert.equal(result.entity,'sensor.local');assert.equal(result.icon,'mdi:home');
});
test('native array editor can change unbound entries while central values remain protected', () => {
  const state=designLibrary();state.groups.central={name:'Central',value:'sensor.central'};state.templates.test.bindings=[{path:['entities',0],group:'central'}];
  const next=resolveTemplate(state,'test');next.entities=['sensor.attempt','sensor.local'];
  const changes=editorOverrides(state,'test',[],next);assert.deepEqual(resolveTemplate(state,'test',changes).entities,['sensor.central','sensor.local']);
});
test('removing an array element cannot shift centrally bound entries', () => {
  const state=designLibrary();state.groups.central={name:'Central',value:'sensor.central'};state.templates.test.bindings=[{path:['entities',1],group:'central'}];
  assert.throws(()=>resolveTemplate(state,'test',[{path:['entities',0],remove:true}]),/Struktur/);
});
test('complete nested stacks survive export and resolve with all child settings', () => {
  const state=designLibrary();state.templates.test.config={type:'horizontal-stack',cards:[{type:'entities',entities:['calendar.person_a']},{type:'vertical-stack',cards:[{type:'custom:calendar',title:'Family',colors:{person:'#abcdef'}}]}]};
  state.templates.test.design_paths=[];const roundtrip=importLibrary(exportLibrary(state));assert.deepEqual(resolveTemplate(roundtrip,'test'),state.templates.test.config);
});

test('footer templates roundtrip and central navigation edits reach all references', () => {
  const state={templates:{footer:{name:'Fußzeile',config:{type:'custom:library-container-card',max_width:1030,card:{type:'horizontal-stack',cards:[{type:'custom:mushroom-chips-card',chips:[{type:'action',tap_action:{action:'navigate',navigation_path:'/home'}}]}]}},bindings:[]}},groups:{},people:{}};
  const copy=importLibrary(exportLibrary(state));assert.deepEqual(copy.templates.footer.config,state.templates.footer.config);
  const path=['card','cards',0,'chips',0,'tap_action','navigation_path'];
  setAt(copy.templates.footer.config,path,'/new-home');
  assert.equal(resolveTemplate(copy,'footer').card.cards[0].chips[0].tap_action.navigation_path,'/new-home');
  assert.equal(resolveTemplate(copy,'footer',[{path,value:'/local-home'}]).card.cards[0].chips[0].tap_action.navigation_path,'/local-home');
});

test('relinking one child of a locally replaced object preserves omitted sibling deletions', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'markdown',options:{a:'central-a',b:'central-b',c:'central-c'}},bindings:[]}},groups:{}};
  const next=updateLocalField(state,'t',[{path:['options'],value:{a:'local-a'}}],['options','a'],undefined,true);
  assert.deepEqual(resolveTemplate(state,'t',next).options,{a:'central-a'});
});
test('relinking or adding a child below a removed object keeps siblings removed', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'markdown',options:{a:'central-a',b:'central-b'}},bindings:[]}},groups:{}};
  const removed=[{path:['options'],remove:true}];const inherited=updateLocalField(state,'t',removed,['options','a'],undefined,true,true);assert.deepEqual(resolveTemplate(state,'t',inherited).options,{a:'central-a'});
  const added=updateLocalField(state,'t',removed,['options','a'],'local-a',false,true);assert.deepEqual(resolveTemplate(state,'t',added).options,{a:'local-a'});
});

test('relinking a child of a shortened local list preserves its length', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'entities',entities:['sensor.a','sensor.b','sensor.c']},bindings:[]}},groups:{}};
  const next=updateLocalField(state,'t',[{path:['entities'],value:['sensor.local']}],['entities',0],undefined,true);assert.deepEqual(resolveTemplate(state,'t',next).entities,['sensor.a']);
});

test('design-only preset preserves existing local field removals outside marked design', async () => {
  const {designOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'entity',entity:'sensor.central',color:'red',title:'Central'},bindings:[],design_paths:[['color']]}},groups:{}};
  const next=designOverrides(state,'t',[{path:['entity'],remove:true}]);const resolved=resolveTemplate(state,'t',next);assert.equal(Object.hasOwn(resolved,'entity'),false);assert.equal(resolved.color,'red');
});
test('design-only preset restores nested design while preserving removed sibling fields', async () => {
  const {designOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'markdown',options:{color:'red',entity:'sensor.central',title:'Central'}},bindings:[],design_paths:[['options','color']]}},groups:{}};
  const next=designOverrides(state,'t',[{path:['options'],remove:true}]);assert.deepEqual(resolveTemplate(state,'t',next).options,{color:'red'});
});

test('editor cannot hide a protected list truncation by restoring its last binding', async () => {
  const {editorOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'horizontal-stack',cards:[{type:'markdown',content:'A'},{type:'markdown',content:'B',color:'red'}]},bindings:[{path:['cards',1,'color'],group:'color'}]}},groups:{color:{value:'red'}}};
  assert.throws(()=>editorOverrides(state,'t',[],{type:'horizontal-stack',cards:[{type:'markdown',content:'A'}]}),/Struktur/);
});
test('editor cannot hide deletion of a single-item list with a protected child binding', async () => {
  const {editorOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'entities',entities:[{entity:'sensor.a',color:'red'}]},bindings:[{path:['entities',0,'color'],group:'color'}]}},groups:{color:{value:'red'}}};
  assert.throws(()=>editorOverrides(state,'t',[],{type:'entities'}),/Struktur/);
});

test('editor roundtrips 1584 combinations of inherited local and edited container types', async () => {
  const {editorOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const values=[null,false,0,'text',{},[],{x:1},{x:2,y:3},[1,2],{nested:{x:true}},[{entity:'sensor.a'}]];let checked=0;
  for(const base of [undefined,...values])for(const local of values)for(const editedValue of [undefined,...values]) {
    const config={type:'markdown',content:'Text'};if(base!==undefined)config.options=base;
    const state={templates:{t:{config,bindings:[]}},groups:{}};const edited={type:'markdown',content:'Text'};if(editedValue!==undefined)edited.options=editedValue;
    const overrides=editorOverrides(state,'t',[{path:['options'],value:local}],edited);assert.deepEqual(resolveTemplate(state,'t',overrides),edited,JSON.stringify({base,local,editedValue}));checked++;
  }
  assert.equal(checked,1584);
});
test('relinking a local object child above a scalar template preserves local siblings', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');const state={templates:{t:{config:{type:'markdown',options:null},bindings:[]}},groups:{}};
  const overrides=updateLocalField(state,'t',[{path:['options'],value:{a:'local-a',b:'local-b'}}],['options','a'],undefined,true);assert.deepEqual(resolveTemplate(state,'t',overrides).options,{b:'local-b'});
});

test('design presets preserve 121 local type combinations and entity removals during central updates', async () => {
  const {designOverrides}=await import('../custom_components/card_library/frontend/library-core.js');const values=[null,false,0,'text',{},[],{x:1},{x:2,y:3},[1,2],{nested:{x:true}},[{entity:'sensor.a'}]];
  for(const base of values)for(const local of values){const state={templates:{t:{config:{type:'markdown',options:base,entity:'sensor.central',design:{color:'red',font:12}},bindings:[],design_paths:[['design','color']]}},groups:{}};
    const next=designOverrides(state,'t',[{path:['options'],value:local},{path:['entity'],remove:true},{path:['design','color'],value:'blue'}]);state.templates.t.config.design={color:'green',font:99};const result=resolveTemplate(state,'t',next);assert.deepEqual(result.options,local);assert.equal(Object.hasOwn(result,'entity'),false);assert.deepEqual(result.design,{color:'green',font:12});
  }
});

test('editing and removing local list entries roundtrips all positions across 30 list-length pairs', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');let checked=0;
  for(let baseLength=0;baseLength<=4;baseLength++)for(let localLength=1;localLength<=6;localLength++)for(let index=0;index<localLength;index++)for(const remove of [false,true]){
    const base=Array.from({length:baseLength},(_,i)=>'sensor.base_'+i),local=Array.from({length:localLength},(_,i)=>'sensor.local_'+i);const state={templates:{t:{config:{type:'entities',entities:base},bindings:[]}},groups:{}};
    const expected=[...local];if(remove)expected.splice(index,1);else expected[index]='sensor.changed';const overrides=updateLocalField(state,'t',[{path:['entities'],value:local}],['entities',index],'sensor.changed',false,false,remove);assert.deepEqual(resolveTemplate(state,'t',overrides).entities,expected);checked++;
  }
  assert.equal(checked,210);
});
test('editing fields in expanded local stack lists keeps other cards intact', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');const cards=[{type:'markdown',content:'A'},{type:'markdown',content:'B'},{type:'markdown',content:'C'}];const state={templates:{t:{config:{type:'horizontal-stack',cards:[cards[0]]},bindings:[]}},groups:{}};
  const overrides=updateLocalField(state,'t',[{path:['cards'],value:cards}],['cards',1,'content'],'Changed');const expected=structuredClone(cards);expected[1].content='Changed';assert.deepEqual(resolveTemplate(state,'t',overrides).cards,expected);assert.deepEqual(cards[1].content,'B');
});

test('relinking local list entries handles all positions across 25 list-length pairs', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');let checked=0;
  for(let baseLength=0;baseLength<=4;baseLength++)for(let localLength=1;localLength<=5;localLength++)for(let index=0;index<localLength;index++){
    const base=Array.from({length:baseLength},(_,i)=>'sensor.base_'+i),local=Array.from({length:localLength},(_,i)=>'sensor.local_'+i),state={templates:{t:{config:{type:'entities',entities:base},bindings:[]}},groups:{}};
    const expected=[...local];if(index<baseLength)expected[index]=base[index];else expected.splice(index,1);
    const next=updateLocalField(state,'t',[{path:['entities'],value:local}],['entities',index],undefined,true);assert.deepEqual(resolveTemplate(state,'t',next).entities,expected);checked++;
  }
  assert.equal(checked,75);
});

test('adding or relinking a child below a scalar local object replacement preserves missing siblings', async () => {
  const {updateLocalField}=await import('../custom_components/card_library/frontend/library-core.js');
  for(const value of [null,false,0,'disabled'])for(const inherit of [false,true]){
    const state={templates:{t:{config:{type:'markdown',options:{a:'Central A',b:'Central B'}},bindings:[]}},groups:{}};
    const overrides=updateLocalField(state,'t',[{path:['options'],value}],['options','a'],'Local A',inherit,true);assert.deepEqual(resolveTemplate(state,'t',overrides).options,{a:inherit?'Central A':'Local A'});
    if(inherit){state.templates.t.config.options.a='Updated A';assert.equal(resolveTemplate(state,'t',overrides).options.a,'Updated A');}
  }
});

test('3000 seeded nested configurations preserve complete local editor results', async () => {
  const {editorOverrides}=await import('../custom_components/card_library/frontend/library-core.js');let seed=1337;
  const random=limit=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
  function generate(depth=0){const kind=random(depth<3?8:5);if(kind===0)return null;if(kind===1)return Boolean(random(2));if(kind===2)return random(100);if(kind===3)return 'text_'+random(20);if(kind===4)return '';if(kind===5)return Array.from({length:random(4)},()=>generate(depth+1));const result={};for(let i=0,length=random(4);i<length;i++)result['key_'+i]=generate(depth+1);return result;}
  for(let i=0;i<3000;i++){const base=generate(),local=generate(),editedValue=generate(),state={templates:{t:{config:{type:'markdown',options:base},bindings:[]}},groups:{}};const edited={type:'markdown',options:editedValue};const overrides=editorOverrides(state,'t',[{path:['options'],value:local}],edited);assert.deepEqual(resolveTemplate(state,'t',overrides),edited,'Seeded case '+i);}
});

test('popup hash metadata survives export/import and never becomes card configuration', async () => {
  const {exportLibrary, importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const lib = library(); lib.templates.calendar.popup = {hash:'#kalender', options:{name:'Familie',styles:'.bubble-pop-up { background: transparent; }'}};
  const imported = importLibrary(exportLibrary(lib));
  assert.deepEqual(imported.templates.calendar.popup, lib.templates.calendar.popup);
  assert.equal(resolveTemplate(imported, 'calendar').popup, undefined);
});
test('popup routes reject duplicates unsafe hashes and reserved options', async () => {
  const {validatePopupRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  const invalid = [{hash:'#'}, {hash:'kalender'}, {hash:'#space here'}, {hash:'#card-library-popup-internal'}, {hash:'#ok',options:null}, {hash:'#ok',options:{cards:[]}}, {hash:'#ok',unexpected:true}];
  for (const route of invalid) {const lib = library(); lib.templates.calendar.popup = route; assert.throws(() => validatePopupRoutes(lib));}
  const lib = library(); lib.templates.calendar.popup = {hash:'#kalender'}; lib.templates.saver.popup = {hash:'#kalender'};
  assert.throws(() => validatePopupRoutes(lib), /bereits/);
});
test('popup route accepts an original standalone Bubble popup without changing its configuration', async () => {
  const {validatePopupRoutes, popupTemplateInfo, popupTemplateRoute, importLibrary, exportLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const lib = library(); lib.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',cards:[]}; lib.templates.calendar.popup = {hash:'#kalender'};
  const baseline = structuredClone(lib);
  assert.doesNotThrow(() => validatePopupRoutes(lib));
  assert.deepEqual(popupTemplateInfo(lib.templates.calendar.config), {path:[],hash:undefined,supported:true});
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.calendar), {hash:'#kalender',options:{},native:true});
  assert.deepEqual(importLibrary(exportLibrary(lib)), {...baseline,people:{}});
});
test('native standalone and classic stack popup hashes provide automatic routes', async () => {
  const {popupTemplateInfo, popupTemplateRoute, validatePopupRoutes, importLibrary, exportLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const standalone = {type:'custom:bubble-card',card_type:'pop-up',hash:'#standalone',cards:[{type:'markdown',content:'Native content'}],styles:'.bubble-pop-up { opacity: 1; }'};
  const stack = {type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#legacy',name:'Legacy'}, {type:'horizontal-stack',cards:[{type:'button',entity:'light.office'}]}]};
  const lib = {templates:{s:{name:'Standalone',config:standalone},l:{name:'Stack',config:stack}},groups:{},people:{}};
  assert.deepEqual(popupTemplateInfo(standalone), {path:[],hash:'#standalone',supported:true});
  assert.deepEqual(popupTemplateInfo(stack), {path:['cards',0],hash:'#legacy',supported:true});
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.s), {hash:'#standalone',options:{},native:true});
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.l), {hash:'#legacy',options:{},native:true});
  assert.doesNotThrow(() => validatePopupRoutes(lib));
  assert.deepEqual(importLibrary(exportLibrary(lib)),lib);
  assert.equal(popupTemplateInfo({type:'vertical-stack',cards:[{type:'markdown'},...stack.cards]}),null);
  assert.equal(popupTemplateInfo({type:'custom:bubble-card',card_type:'button',hash:'#button'}),null);
});
test('native popup drafts need no hash while assigned routes require supported original framing', async () => {
  const {popupTemplateRoute, validatePopupRoutes, importLibrary, exportLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  for (const hash of [undefined,null,'']) {
    const config = {type:'custom:bubble-card',card_type:'pop-up'};
    if (hash !== undefined) config.hash = hash;
    const lib = {templates:{t:{name:'Draft',config}},groups:{},people:{}};
    assert.equal(popupTemplateRoute(lib,lib.templates.t),null);
    assert.doesNotThrow(() => importLibrary(exportLibrary(lib)));
  }
  for (const config of [
    {type:'custom:bubble-card',card_type:'pop-up',hash:'#unsupported'},
    {type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#unsupported',cards:[]},{type:'markdown',content:'x'}]}
  ]) {
    const lib = {templates:{t:{name:'Unsupported',config}},groups:{},people:{}};
    assert.equal(popupTemplateRoute(lib,lib.templates.t),null);
    assert.doesNotThrow(() => validatePopupRoutes(lib));
    assert.doesNotThrow(() => importLibrary(exportLibrary(lib)));
    lib.templates.t.popup = {hash:'#explicit'};
    assert.throws(() => importLibrary(exportLibrary(lib)),/eigenständige Bubble-Popup-Karte/);
  }
});
test('legacy native popup headers remain backward compatible ordinary templates without taking a hash route', async () => {
  const {popupTemplateRoute,validatePopupRoutes,importLibrary,exportLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const header = {type:'custom:bubble-card',card_type:'pop-up',hash:'#existing',name:'Existing legacy header'};
  const lib = {templates:{legacy:{name:'Legacy header',config:header},content:{name:'Central content',config:{type:'markdown',content:'x'},popup:{hash:'#existing'}}},groups:{},people:{}};
  assert.equal(popupTemplateRoute(lib,lib.templates.legacy),null);
  assert.doesNotThrow(() => validatePopupRoutes(lib));
  assert.deepEqual(importLibrary(exportLibrary(lib)),lib);
  lib.templates.legacy.config.hash = '#previously accepted legacy hash';
  assert.doesNotThrow(() => importLibrary(exportLibrary(lib)));
  lib.templates.legacy.popup = {hash:'#explicit'};
  assert.throws(() => importLibrary(exportLibrary(lib)),/eigenständige Bubble-Popup-Karte/);
});
test('automatic and explicit native popup hashes share one strict duplicate namespace', async () => {
  const {validatePopupRoutes,popupTemplateRoute} = await import('../custom_components/card_library/frontend/library-core.js');
  const config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#same',cards:[]};
  const lib = {templates:{a:{name:'Native',config},b:{name:'Content',config:{type:'markdown'},popup:{hash:'#same'}}},groups:{},people:{}};
  assert.throws(() => validatePopupRoutes(lib),/bereits/);
  lib.templates.a.popup = {hash:'#override',options:{name:'Override',styles:'ha-card { border: 0; }'}};
  assert.doesNotThrow(() => validatePopupRoutes(lib));
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.a), {hash:'#override',options:lib.templates.a.popup.options,native:true});
  delete lib.templates.a.popup;
  delete lib.templates.b;
  for (const hash of ['#','invalid','#space here','#same\n','#card-library-popup-internal',42,false,['#same']]) {
    lib.templates.a.config.hash = hash;
    assert.throws(() => validatePopupRoutes(lib));
  }
});
test('native popup route lookup resolves only its structural binding paths', async () => {
  const {popupTemplateRoute,validatePopupRoutes} = await import('../custom_components/card_library/frontend/library-core.js');
  const lib = {templates:{t:{name:'Bound stack',config:{type:'vertical-stack',cards:[]},bindings:[{path:['cards'],group:'cards'},{path:['card_mod'],group:'unrelated'}]}},groups:{cards:{name:'Cards',value:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#bound'},{type:'markdown',content:'x'}]},unrelated:{name:'Unused'}},people:{}};
  Object.defineProperty(lib.groups.unrelated,'value',{get(){throw Error('Unrelated group must not be resolved');}});
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.t),{hash:'#bound',options:{},native:true});
  assert.doesNotThrow(() => validatePopupRoutes(lib));
  lib.templates.t.config = {type:'custom:bubble-card',card_type:'button',cards:[]};
  lib.templates.t.bindings = [{path:['card_type'],group:'kind'},{path:['hash'],group:'hash'},{path:['card_mod'],group:'unrelated'}];
  lib.groups.kind = {name:'Kind',value:'pop-up'};
  lib.groups.hash = {name:'Hash',value:'#bound-standalone'};
  assert.deepEqual(popupTemplateRoute(lib,lib.templates.t),{hash:'#bound-standalone',options:{},native:true});
  assert.doesNotThrow(() => validatePopupRoutes(lib));
});

test('shared bindings cannot expand a compact library beyond the resolved card budget', async () => {
  const {importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const rows = Array.from({length:5000}, () => ({content:'Repeated shared calendar data'}));
  const state = {templates:{t:{name:'Bound',config:{type:'custom:test'},bindings:Array.from({length:30},(_,index) => ({path:['group_'+index],group:'g'}))}},groups:{g:{name:'Group',value:rows}},people:{}};
  assert.ok(new TextEncoder().encode(JSON.stringify(state)).length < 300000);
  const baseline = structuredClone(state);
  assert.throws(() => resolveTemplate(state,'t'), /2 MB/);
  assert.throws(() => importLibrary({format:'ha-card-library',version:2,library:state}), /2 MB/);
  assert.deepEqual(state, baseline);
  state.templates.t.bindings = state.templates.t.bindings.slice(0,2);
  const card = resolveTemplate(state,'t');
  card.group_0[0].content = 'Local mutation';
  assert.equal(card.group_1[0].content, rows[0].content);
  assert.equal(state.groups.g.value[0].content, 'Repeated shared calendar data');
});

test('oversized alias expansions are rejected before import cloning or aggregate serialization', async () => {
  const {importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  let expanded = {content:'Repeated'};
  for (let index=0; index<24; index++) expanded = [expanded,expanded];
  const state = {templates:{t:{name:'Aliased',config:{type:'custom:test',content:expanded}}},groups:{},people:{}};
  const original = globalThis.structuredClone;
  globalThis.structuredClone = () => {throw Error('Oversized input must not be cloned');};
  try { assert.throws(() => importLibrary({format:'ha-card-library',version:2,library:state}), /2 MB/); }
  finally {globalThis.structuredClone = original;}
});

test('temporary borrowed local overrides preserve independent values and cannot mutate input', () => {
  const state = {templates:{t:{name:'Local',config:{type:'custom:test'},bindings:[]}},groups:{},people:{}};
  const value = {rows:[{label:'First'},{label:'Second'}]};
  const overrides = [{path:['left'],value},{path:['right'],value},{path:['left','rows',0,'label'],value:'Changed'},{path:['left','rows',1],remove:true}];
  const before = structuredClone(overrides);
  const card = resolveTemplate(state,'t',overrides);
  assert.deepEqual(card.left.rows,[{label:'Changed'}]);
  assert.deepEqual(card.right.rows,value.rows);assert.deepEqual(overrides,before);
  card.right.rows[0].label = 'Independent';assert.equal(value.rows[0].label,'First');assert.equal(card.left.rows[0].label,'Changed');
  const large = 'X'.repeat(100000);
  assert.throws(() => resolveTemplate(state,'t',Array.from({length:30},(_,index) => ({path:['field_'+index],value:large}))), /2 MB/);
});

test('memoized JSON validation retains depth checks for deeper shared occurrences and rejects cycles', async () => {
  const {validateJson} = await import('../custom_components/card_library/frontend/library-core.js');
  let leaf = {value:'Leaf'};for(let index=0;index<40;index++) leaf = {next:leaf};
  let deeper = leaf;for(let index=0;index<30;index++) deeper = {next:deeper};
  assert.throws(() => validateJson({shallow:leaf,deeper}), /tief verschachtelt/);
  const cycle = {};cycle.self = cycle;
  assert.throws(() => validateJson(cycle), /zyklischen/);
});

test('direct card validation rejects oversized aliases before recursive card checks', async () => {
  const {validateCard} = await import('../custom_components/card_library/frontend/library-core.js');
  let aliases = {text:'X'.repeat(128)};
  for(let index=0;index<15;index++) aliases = [aliases,aliases];
  assert.throws(() => validateCard({type:'markdown',data:aliases}), /2 MB/);
  assert.doesNotThrow(() => validateCard({type:'markdown',data:aliases[0][0]}));
});

test('person colors require a complete six-digit hex string without coercion or trailing newline', async () => {
  const {importLibrary} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{},groups:{},people:{p:{name:'Person',color:'#abcdef'}}};
  for (const color of ['#abcdef\n','#abcdef\r','#abcdef\r\n',['#abcdef'],{value:'#abcdef'},null,123]) {
    state.people.p.color = color;
    assert.throws(() => importLibrary({format:'ha-card-library',version:2,library:state}), /Personenfarbe/);
  }
  for (const color of ['#abcdef','#ABCDEF','#000000']) {
    state.people.p.color = color;
    assert.equal(importLibrary({format:'ha-card-library',version:2,library:state}).people.p.color, color);
  }
});

test('editing and relinking an ordered local list cannot resurrect its removed card', async () => {
  const {updateLocalField} = await import('../custom_components/card_library/frontend/library-core.js');
  const cards = ['A','B','C'].map(content => ({type:'markdown',content}));
  const state = {templates:{t:{name:'Stack',config:{type:'horizontal-stack',cards},bindings:[]}},groups:{},people:{}};
  const overrides = [{path:['cards'],value:['LocalA','LocalB','LocalC'].map(content => ({type:'markdown',content}))},{path:['cards',0],remove:true}];
  const before = structuredClone(overrides);
  const edited = updateLocalField(state,'t',overrides,['cards',0,'content'],'Edited');
  assert.deepEqual(resolveTemplate(state,'t',edited).cards,[{type:'markdown',content:'Edited'},{type:'markdown',content:'LocalC'}]);
  const linked = updateLocalField(state,'t',overrides,['cards',0,'content'],undefined,true);
  assert.deepEqual(resolveTemplate(state,'t',linked).cards,[{type:'markdown',content:'A'},{type:'markdown',content:'LocalC'}]);
  assert.deepEqual(overrides,before);
});

test('ordered nested object overrides retain effective siblings while one field is relinked', async () => {
  const {updateLocalField} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{t:{name:'Object',config:{type:'markdown',options:{title:'Central',nested:{first:1,second:2},removed:'central'}},bindings:[]}},groups:{},people:{}};
  const overrides = [{path:['options'],value:{title:'Local',nested:{first:10,second:20}}},{path:['options','nested','second'],value:30},{path:['options','title'],value:'Latest'}];
  const linked = updateLocalField(state,'t',overrides,['options','nested','first'],undefined,true);
  assert.deepEqual(resolveTemplate(state,'t',linked).options,{title:'Latest',nested:{first:1,second:30}});
  state.templates.t.config.options.nested.first = 99;
  assert.equal(resolveTemplate(state,'t',linked).options.nested.first,99);
  assert.equal(resolveTemplate(state,'t',linked).options.nested.second,30);
});

test('editing after raw indexed removals retains every other card and its central updates', async () => {
  const {updateLocalField} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{t:{name:'Stack',config:{type:'horizontal-stack',cards:['A','B','C'].map(content => ({type:'markdown',content}))},bindings:[]}},groups:{},people:{}};
  const overrides = [{path:['cards',0],remove:true}];
  const before = structuredClone(overrides);
  const edited = updateLocalField(state,'t',overrides,['cards',0,'content'],'Edited');
  assert.deepEqual(resolveTemplate(state,'t',edited).cards,[{type:'markdown',content:'Edited'},{type:'markdown',content:'C'}]);
  state.templates.t.config.cards[2].content = 'Central change';
  assert.equal(resolveTemplate(state,'t',edited).cards[1].content,'Central change');
  assert.deepEqual(overrides,before);
});

test('ambiguous raw-list field relinking fails without changing data and allows whole-list recovery', async () => {
  const {updateLocalField} = await import('../custom_components/card_library/frontend/library-core.js');
  const state = {templates:{t:{name:'Stack',config:{type:'horizontal-stack',cards:['A','B','C'].map(content => ({type:'markdown',content}))},bindings:[]}},groups:{},people:{}};
  const overrides = [{path:['cards',0],remove:true}], before = structuredClone(overrides);
  assert.throws(() => updateLocalField(state,'t',overrides,['cards',0,'content'],undefined,true), /YAML.*ganzen Listenbereich/);
  assert.deepEqual(overrides,before);
  assert.deepEqual(resolveTemplate(state,'t',overrides).cards,state.templates.t.config.cards.slice(1));
  const linked = updateLocalField(state,'t',overrides,['cards'],undefined,true);
  assert.deepEqual(resolveTemplate(state,'t',linked).cards,state.templates.t.config.cards);
});
