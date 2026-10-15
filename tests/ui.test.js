import {test} from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; this.isConnected = true; this.value = ''; this.style = {}; }
  attachShadow() { return this.shadowRoot = new Element('shadow'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type]=(this.listeners[type]||[]).filter(listener=>listener!==fn); }
  dispatchEvent(event) { this.listeners[event.type]?.forEach(fn => fn(event)); this['on' + event.type]?.(event); }
  click() { return this.onclick?.({preventDefault(){}, stopPropagation(){}}); }
}
const registry = new Map();
globalThis.HTMLElement = Element;
globalThis.customElements = {define: (type, klass) => registry.set(type, klass), get: type => registry.get(type)};
globalThis.document = {createElement: tag => registry.has(tag) ? new (registry.get(tag))() : new Element(tag)};
if (process.env.LIBRARY_NATIVE_UI === '1') {
  for (const name of ['ha-button','ha-input','ha-checkbox','ha-textarea','ha-select','ha-expansion-panel','ha-list-item']) {
    customElements.define(name, class extends Element {
      constructor() { super(name); if (name === 'ha-select') this.options = undefined; if (['ha-input','ha-textarea'].includes(name)) this.readonly = false; }
    });
  }
}
function tag(node) { return node?.libraryTag || node?.tagName; }
function options(node) { return node.libraryOptions?.map(([value,textContent])=>({value,textContent})) || node.children; }
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
class NativeEditor extends Element { setConfig(config) { this.config = config; } }
class NativeCard extends Element { static async getConfigElement() { return new NativeEditor('native-editor'); } }
const previews = [];
globalThis.window = {customCards:[], location:{href:'https://ha.example/lovelace/0'}, confirm:()=>true,
  loadCardHelpers:async()=>({createCardElement:config=> { const card = new NativeCard('native-card'); card.config=config; previews.push(config); return card; }})};
await import('../custom_components/card_library/frontend/card-library.js');
function nodes(root) { return [root, ...root.children.flatMap(nodes)]; }
function find(root, text) { const found = nodes(root).find(n=>tag(n)==='button'&&n.textContent===text); assert.ok(found, text); return found; }
function inputField(root, label) { const box = nodes(root).find(node=>node.children.some(child=>tag(child)==='label'&&child.textContent===label)); assert.ok(box,label);return box.children.find(child=>['input','textarea','select'].includes(tag(child))); }
const library = () => ({revision:0, templates:{calendar:{name:'Kalender',config:{type:'custom:calendar',layout:'month',color:'#001122'},bindings:[]}},groups:{},people:{anna:{name:'Anna',color:'#aa3344'}}});
function setup(state = library(), inventoryCards = []) {
  let callback;
  const saved = [];
  const hass = {user:{is_admin:true}, states:{}, connection:{subscribeMessage:async cb=>{callback=cb; return ()=>{};}}, callWS:async msg=>{
    if(msg.type==='card_library/save') { saved.push(msg); return {...msg.library,revision:msg.revision+1}; }
    if(msg.type==='lovelace/dashboards/list') return [];
    if(msg.type==='lovelace/config') return {views:[{title:'Familie',cards:inventoryCards}]};
    if(msg.type==='lovelace/resources/list') return [];
    throw Error('Unexpected '+msg.type);
  }};
  const manager = document.createElement('library-manager'); manager.hass=hass; callback(state);
  return {manager,hass,saved,push:state=>callback(state)};
}
function openSection(root, title) {
  const section=nodes(root).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent===title));assert.ok(section,title);
  function path(node) { if(node===section)return [node];for(const child of node.children){const branch=path(child);if(branch)return [node,...branch];} }
  // Real users reach a nested disclosure by opening its ancestors first.
  for(const ancestor of path(root).filter(node=>tag(node)==='details')) {ancestor.open=true;ancestor.dispatchEvent({type:'toggle'});}
  return section;
}
async function settle() { await new Promise(resolve=>setImmediate(resolve)); }

test('native graphical editor changes are saved with people and template configuration', async () => {
  const {manager,saved} = setup(); manager.selected='calendar'; manager.render(); await settle();
  assert.ok(manager.editor);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{type:'custom:calendar',layout:'agenda',color:'#001122'}},stopPropagation(){}}));
  await manager.save();
  assert.equal(saved[0].library.templates.calendar.config.layout,'agenda');
  assert.equal(saved[0].library.people.anna.color,'#aa3344');
  assert.equal(manager.dirty,false);
});

test('person binding is created through graphical controls and native editor cannot overwrite it', async () => {
  const {manager} = setup(); manager.selected='calendar'; manager.path=['color']; manager.render(); await settle();
  const fieldset=nodes(manager.shadowRoot).find(n=>tag(n)==='fieldset'&&n.children.some(c=>c.textContent==='Person zuordnen'));
  const selects=nodes(fieldset).filter(n=>tag(n)==='select'); selects[0].value='anna'; selects[1].value='color';
  find(fieldset,'Personenfeld hier verknüpfen').click(); await settle();
  const binding=manager.draft.templates.calendar.bindings[0];
  assert.deepEqual(binding,{path:['color'],person:'anna',field:'color'});
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{type:'custom:calendar',layout:'agenda',color:'#ffffff'}},stopPropagation(){}}));
  assert.equal(manager.draft.templates.calendar.config.color,'#aa3344');
});

test('existing dashboard card can be copied into a template without modifying dashboard', async () => {
  const {manager,saved}=setup(library(),[{type:'custom:calendar',title:'Familie',layout:'agenda'}]);
  await manager.scan(); manager.mode='dashboards'; manager.render();
  find(manager.shadowRoot,'Als Vorlage übernehmen').click();
  const imported=manager.draft.templates[manager.selected];
  assert.equal(imported.config.layout,'agenda');
  assert.deepEqual(imported.source.path,['views',0,'cards',0]);
  assert.equal(saved.length,0);
});

test('save refuses imported deletion of templates used by dashboards', async () => {
  const {manager,saved}=setup(library(),[{type:'custom:library-card',template:'calendar'}]);
  manager.draft.templates={}; manager.edit(); await manager.save();
  assert.equal(saved.length,0); assert.match(manager.notice,/Verwendete Vorlagen/);
});

test('change comparison renders both saved and draft layouts', async () => {
  const {manager}=setup(); previews.length=0;
  manager.draft.templates.calendar.config.layout='agenda'; manager.edit(); manager.mode='preview'; manager.render(); await settle();
  assert.ok(previews.some(c=>c.layout==='month'));
  assert.ok(previews.some(c=>c.layout==='agenda'));
});

test('central color map can add a missing calendar field through the graphical controls', async () => {
  const state=library(); state.groups.colors={name:'Kalenderfarben',value:{'calendar.person_d':'#e2006e'}};
  const {manager}=setup(state); manager.mode='groups'; manager.selected='colors'; manager.render();
  const box=nodes(manager.shadowRoot).find(n=>tag(n)==='fieldset'&&n.children.some(c=>c.textContent==='Gemeinsames Feld hinzufügen'));
  const input=nodes(box).find(n=>tag(n)==='input'); input.value='calendar.person_c';
  find(box,'Gemeinsames Feld anlegen').click();
  assert.equal(manager.draft.groups.colors.value['calendar.person_c'],'');
  assert.equal(manager.dirty,true);
});

test('empty template selector gives admins direct access to creation and import', () => {
  const {hass}=setup({revision:0,templates:{},groups:{},people:{}});
  const editor=document.createElement('library-card-editor'); editor.setConfig({type:'custom:library-card',template:''}); editor.hass=hass;
  find(editor.shadowRoot,'Konfiguration').click();
  assert.ok(editor.manager);
  find(editor.manager.shadowRoot,'Neue Karte');
  assert.ok(nodes(editor.manager.shadowRoot).some(n=>tag(n)==='input'&&n.type==='file'));
  assert.ok(nodes(editor.manager.shadowRoot).some(n=>tag(n)==='label'&&n.textContent.startsWith('Vorlagen importieren:')));
  editor.manager.draft.people.p={name:'Test',color:'#123456'};editor.manager.edit();
  const original=editor.manager;
  editor.render();
  assert.equal(editor.manager,original);
  assert.equal(editor.manager.draft.people.p.name,'Test');
});

test('new custom template uses the card stub instead of an invalid type-only config', async () => {
  class ConfiguredCard extends NativeCard { static getStubConfig() { return {entities:['calendar.test'],default_view:'agenda'}; } }
  customElements.define('configured-test-card',ConfiguredCard);
  const {manager}=setup(); await manager.createTemplate('custom:configured-test-card');
  assert.deepEqual(manager.draft.templates[manager.selected].config,{type:'custom:configured-test-card',entities:['calendar.test'],default_view:'agenda'});
  openSection(manager.shadowRoot,'Kartenvorschau');await settle(); assert.ok(manager.previewHost.children.length);
});

test('saved template can be used directly and preview updates after native edits', async () => {
  const {hass}=setup();
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:''});editor.hass=hass;
  find(editor.shadowRoot,'Konfiguration').click();
  const manager=editor.manager;manager.selected='calendar';manager.render();openSection(manager.shadowRoot,'Kartenvorschau');await settle();
  assert.equal(manager.previewHost.children[0].config.layout,'month');
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{type:'custom:calendar',layout:'agenda',color:'#001122'}},stopPropagation(){}}));
  await new Promise(resolve=>setTimeout(resolve,220));assert.equal(manager.previewHost.children[0].config.layout,'agenda');
  assert.equal(find(manager.shadowRoot,'Diese Vorlage verwenden').disabled,true);
  await manager.save();find(manager.shadowRoot,'Diese Vorlage verwenden').click();
  assert.equal(editor.config.template,'calendar');assert.equal(editor.manage,false);
});

test('library manager supplies a graphical config editor', () => {
  const Manager=customElements.get('library-manager');
  assert.ok(Manager.getConfigElement() instanceof customElements.get('library-manager-editor'));
});

test('connection replacement clears stale signature and restores the same dashboard card',async()=>{
  const {hass}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({type:'custom:library-card',template:'calendar'});wrapper.hass=hass;await settle();
  assert.ok(wrapper.child);
  let receive;const next={...hass,connection:{subscribeMessage:async cb=>{receive=cb;return()=>{};}}};
  wrapper.hass=next;assert.equal(wrapper.child,null);
  receive(library());await settle();assert.ok(wrapper.child);assert.equal(wrapper.shadowRoot.children[0],wrapper.child);
});

test('inactive integration disables cards and preserves an unsaved manager draft',()=>{
  let receive;const hass={user:{is_admin:true},states:{},connection:{subscribeMessage:async cb=>{receive=cb;return()=>{};}}};
  const manager=document.createElement('library-manager');manager.hass=hass;receive(library());manager.edit();
  manager.draft.templates.calendar.name='Unsaved';receive({available:false});
  assert.equal(manager.draft.templates.calendar.name,'Unsaved');find(manager.shadowRoot,'Erneut verbinden');
  receive(library());assert.equal(manager.draft.templates.calendar.name,'Unsaved');
});

test('failed subscription can be retried without refreshing the page',async()=>{
  let attempt=0;const hass={user:{is_admin:true},states:{},connection:{subscribeMessage:async cb=>{if(++attempt===1)throw Error('Integration fehlt');cb(library());return()=>{};}}};
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:''});editor.hass=hass;
  await settle();find(editor.shadowRoot,'Erneut verbinden').click();await settle();
  assert.equal(attempt,2);find(editor.shadowRoot,'Konfiguration');
});

test('lazy card rebuild is handled locally and updates the rendered child',async()=>{
  const {hass}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({type:'custom:library-card',template:'calendar'});wrapper.hass=hass;await settle();
  const old=wrapper.child;
  old.dispatchEvent(new CustomEvent('ll-rebuild',{target:old,stopPropagation(){}}));await settle();
  assert.notEqual(wrapper.child,old);assert.equal(wrapper.shadowRoot.children[0],wrapper.child);
});

test('invalid native editor payload cannot corrupt the previously valid draft',async()=>{
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();
  const previous=structuredClone(manager.draft.templates.calendar.config);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{type:'custom:calendar',x:()=>{}}},stopPropagation(){}}));
  assert.deepEqual(manager.draft.templates.calendar.config,previous);
  assert.equal(manager.dirty,undefined);
});

test('overlapping asynchronous card renders cannot show an older config',async()=>{
  const {hass}=setup();const original=window.loadCardHelpers;const pending=[];
  window.loadCardHelpers=()=>new Promise(resolve=>pending.push(resolve));
  try {
    const wrapper=document.createElement('library-card');wrapper.setConfig({type:'custom:library-card',template:'calendar'});wrapper.hass=hass;
    wrapper.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'agenda'}]});
    const helpers=await original();pending[1](helpers);await settle();pending[0](helpers);await settle();
    assert.equal(wrapper.child.config.layout,'agenda');
  } finally {window.loadCardHelpers=original;}
});

test('restoration retains the original revision while a concurrent update arrives during scan',async()=>{
  const {manager,hass,push}=setup();const baseline=structuredClone(manager.state.library);
  manager.mode='history';manager.history=[{revision:0,saved_at:new Date().toISOString(),library:{templates:baseline.templates,groups:baseline.groups,people:baseline.people}}];
  let sent;
  hass.callWS=async msg=>{
    if(msg.type==='lovelace/dashboards/list'){push({...library(),revision:1});return[];}
    if(msg.type==='lovelace/config')return{views:[]};
    if(msg.type==='lovelace/resources/list')return[];
    if(msg.type==='card_library/restore'){sent=msg;throw Error('conflict');}
    throw Error('Unexpected');
  };
  manager.render();await find(manager.shadowRoot,'Diese Version wiederherstellen').click();
  assert.equal(sent.revision,0);assert.equal(manager.draft.revision,1);assert.match(manager.notice,/conflict/);assert.equal(manager.busy,false);
});

test('overlapping async management actions are blocked until the first completes',async()=>{
  const {manager}=setup();let finish;const first=manager.run(()=>new Promise(resolve=>finish=resolve));
  let secondExecuted=false;await manager.run(async()=>{secondExecuted=true;});
  assert.equal(secondExecuted,false);finish();await first;assert.equal(manager.busy,false);
});

test('graphical design marking is saved and can be removed', async () => {
  const {manager,saved}=setup();manager.selected='calendar';manager.path=['color'];manager.render();
  find(manager.shadowRoot,'Auswahl als Design markieren').click(); await manager.save();
  assert.deepEqual(saved[0].library.templates.calendar.design_paths,[['color']]);
  manager.path=['color'];manager.render();find(manager.shadowRoot,'Designmarkierung entfernen').click();assert.deepEqual(manager.draft.templates.calendar.design_paths,[]);
});
test('graphical design preset, field inheritance and full reset control the rendered config', async () => {
  const state=library();state.templates.calendar.design_paths=[['color']];state.templates.calendar.config.entity='sensor.a';
  const {hass,push}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;
  find(editor.shadowRoot,'Nur markiertes Design übernehmen').click();assert.ok(editor.config.overrides.some(o=>o.path[0]==='entity'));
  editor.localPath=['entity'];editor.render();find(editor.shadowRoot,'Feld wieder aus Vorlage übernehmen').click();assert.ok(!editor.config.overrides.some(o=>o.path[0]==='entity'));
  find(editor.shadowRoot,'Feld individuell festhalten').click();assert.equal(editor.config.overrides.find(o=>o.path[0]==='entity').value,'sensor.a');
  const updated=structuredClone(state);updated.templates.calendar.config.entity='sensor.b';push(updated);
  assert.equal(editor.config.overrides.find(o=>o.path[0]==='entity').value,'sensor.a');
  find(editor.shadowRoot,'Alles aus Vorlage übernehmen').click();assert.deepEqual(editor.config.overrides,[]);await settle();
});
test('design preset without marked fields gives an actionable error and preserves local values', () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'week'}]});editor.hass=hass;
  find(editor.shadowRoot,'Nur markiertes Design übernehmen').click();assert.match(editor.notice,/Designfelder/);assert.equal(editor.config.overrides[0].value,'week');
});

test('duplicate keeps design, bindings and dependencies independent of source', () => {
  const state=library();Object.assign(state.templates.calendar,{design_paths:[['color']],dependencies:['/calendar.js']});
  const {manager}=setup(state);manager.selected='calendar';manager.render();find(manager.shadowRoot,'Vorlage duplizieren').click();
  const copy=manager.draft.templates[manager.selected];assert.deepEqual(copy.design_paths,[['color']]);assert.deepEqual(copy.dependencies,['/calendar.js']);copy.config.color='#ffffff';assert.equal(manager.draft.templates.calendar.config.color,'#001122');
  find(manager.shadowRoot,'Entwurf verwerfen / neu laden').click();assert.equal(Object.keys(manager.draft.templates).length,1);assert.equal(manager.dirty,false);
});
test('template deletion is blocked for dashboard use but unused templates can be removed', async () => {
  const used=setup(library(),[{type:'custom:library-card',template:'calendar'}]);await used.manager.deleteItem('templates','calendar');assert.ok(used.manager.draft.templates.calendar);assert.match(used.manager.notice,/verwendet/);
  const unused=setup();await unused.manager.deleteItem('templates','calendar');assert.equal(unused.manager.draft.templates.calendar,undefined);assert.equal(unused.manager.dirty,true);
});
test('creating and deleting people works while referenced people and groups remain protected', async () => {
  const {manager}=setup();manager.mode='people';manager.render();find(manager.shadowRoot,'Person hinzufügen').click();const added=manager.selected;
  assert.ok(manager.draft.people[added]);find(manager.shadowRoot,'Person löschen').click();await settle();assert.equal(manager.draft.people[added],undefined);
  manager.draft.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];await manager.deleteItem('people','anna');assert.ok(manager.draft.people.anna);
  manager.draft.groups.colors={name:'Colors',value:'#112233'};manager.draft.templates.calendar.bindings=[{path:['color'],group:'colors'}];await manager.deleteItem('groups','colors');assert.ok(manager.draft.groups.colors);
});
test('import draft uses current revision and can be discarded without losing saved templates', () => {
  const {manager}=setup();manager.pendingImport={templates:{},groups:{},people:{}};manager.mode='import';manager.render();find(manager.shadowRoot,'Import als Entwurf übernehmen').click();
  assert.deepEqual(manager.draft.templates,{});assert.equal(manager.draft.revision,0);assert.equal(manager.dirty,true);
  find(manager.shadowRoot,'Entwurf verwerfen / neu laden').click();assert.ok(manager.draft.templates.calendar);assert.equal(manager.dirty,false);
});
test('history can be loaded as a draft without changing the saved library', () => {
  const {manager}=setup();manager.history=[{revision:0,saved_at:'2026-10-07T00:00:00Z',library:{templates:{},groups:{},people:{}}}];manager.mode='history';manager.render();find(manager.shadowRoot,'Als Entwurf ansehen').click();assert.deepEqual(manager.draft.templates,{});assert.ok(manager.state.library.templates.calendar);assert.equal(manager.mode,'preview');assert.equal(manager.dirty,true);
});
test('non-admin users can select templates but cannot open management', () => {
  const {hass}=setup();hass.user.is_admin=false;
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;
  assert.ok(!nodes(editor.shadowRoot).some(n=>n.textContent==='Konfiguration'));
  const manager=document.createElement('library-manager');manager.hass=hass;assert.ok(nodes(manager.shadowRoot).some(n=>n.textContent==='Die Verwaltung ist nur für Administratoren verfügbar.'));
});
test('resource assignments support manual URLs, installed choices, deduplication and removal', () => {
  const {manager}=setup();manager.selected='calendar';manager.inventory={scannedAt:new Date().toISOString(),cards:[],failures:[],resources:[{url:'/installed.js'}]};manager.render();openSection(manager.shadowRoot,'Verwendungen und Abhängigkeiten');
  let input=nodes(manager.shadowRoot).find(n=>n.placeholder==='/hacsfiles/…/karte.js');input.value='/manual.js';find(manager.shadowRoot,'Ressource zuordnen').click();
  input=nodes(manager.shadowRoot).find(n=>n.placeholder==='/hacsfiles/…/karte.js');input.value='/manual.js';find(manager.shadowRoot,'Ressource zuordnen').click();assert.deepEqual(manager.draft.templates.calendar.dependencies,['/manual.js']);
  const choice=nodes(manager.shadowRoot).find(n=>tag(n)==='select'&&options(n).some(c=>c.textContent==='Installierte Ressource wählen'));choice.value='/installed.js';find(manager.shadowRoot,'Ausgewählte Ressource zuordnen').click();assert.deepEqual(manager.draft.templates.calendar.dependencies,['/manual.js','/installed.js']);
  find(manager.shadowRoot,'Zuordnung entfernen').click();assert.deepEqual(manager.draft.templates.calendar.dependencies,['/installed.js']);
  input=nodes(manager.shadowRoot).find(n=>n.placeholder==='/hacsfiles/…/karte.js');input.value='javascript:bad';find(manager.shadowRoot,'Ressource zuordnen').click();assert.match(manager.notice,/Ressourcen-URL/);
});
test('shared setting creation, rebinding and unlinking preserve the currently effective value', () => {
  const {manager}=setup();manager.selected='calendar';manager.path=['color'];manager.render();
  nodes(manager.shadowRoot).find(n=>n.placeholder==='Name der gemeinsamen Einstellung').value='Shared color';find(manager.shadowRoot,'Auswahl zentral speichern und verknüpfen').click();
  const original=manager.draft.templates.calendar.bindings[0].group;assert.equal(manager.draft.groups[original].value,'#001122');manager.draft.groups[original].value='#abcdef';manager.render();
  nodes(manager.shadowRoot).find(n=>n.placeholder==='Name der gemeinsamen Einstellung').value='New shared color';find(manager.shadowRoot,'Auswahl zentral speichern und verknüpfen').click();
  const replacement=manager.draft.templates.calendar.bindings[0].group;assert.equal(manager.draft.groups[replacement].value,'#abcdef');
  find(manager.shadowRoot,'Verknüpfung lösen').click();assert.deepEqual(manager.draft.templates.calendar.bindings,[]);assert.equal(manager.draft.templates.calendar.config.color,'#abcdef');
  const choice=nodes(manager.shadowRoot).find(n=>tag(n)==='select'&&options(n).some(c=>c.textContent==='Bestehende Einstellung wählen'));choice.value=original;find(manager.shadowRoot,'Hier verknüpfen').click();assert.equal(manager.draft.templates.calendar.bindings[0].group,original);
});
test('local field actions cannot change centrally bound values', () => {
  const state=library();state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];const {hass}=setup(state);
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;editor.localPath=['color'];editor.render();
  find(editor.shadowRoot,'Feld individuell festhalten').click();assert.match(editor.notice,/zentral/);assert.equal(editor.config.overrides,undefined);
  find(editor.shadowRoot,'Feld wieder aus Vorlage übernehmen').click();assert.match(editor.notice,/zentral/);assert.equal(editor.config.overrides,undefined);
});
test('import cancellation preserves an unsaved draft', () => {
  const {manager}=setup();manager.draft.templates.calendar.name='Unsaved';manager.edit();manager.pendingImport={templates:{},groups:{},people:{}};manager.mode='import';manager.render();
  const previous=window.confirm;window.confirm=()=>false;
  try {find(manager.shadowRoot,'Import als Entwurf übernehmen').click();assert.equal(manager.draft.templates.calendar.name,'Unsaved');assert.equal(manager.mode,'import');} finally {window.confirm=previous;}
});
test('invalid local paths can be reset graphically after template structure changes', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['layout','nested'],value:'bad'}]});editor.hass=hass;
  find(editor.shadowRoot,'Lokale Anpassungen zurücksetzen').click();assert.deepEqual(editor.config.overrides,[]);await settle();assert.ok(nodes(editor.shadowRoot).some(n=>n.textContent==='Vorschau dieser Verwendung'));
});
test('new central binding conflicting with old local overrides still allows full reset', () => {
  const state=library();state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];const {hass}=setup(state);
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['color'],value:'#ffffff'}]});editor.hass=hass;
  find(editor.shadowRoot,'Alles aus Vorlage übernehmen').click();assert.deepEqual(editor.config.overrides,[]);
});
test('native config events without details do not throw or modify the draft', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();const before=structuredClone(manager.draft);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{stopPropagation(){}}));assert.deepEqual(manager.draft,before);
});
test('an old asynchronous render failure cannot replace a newer successful card', async () => {
  const {hass}=setup();const original=window.loadCardHelpers;let reject;
  window.loadCardHelpers=()=>new Promise((resolve,no)=>{reject=no;});
  const wrapper=document.createElement('library-card');wrapper.setConfig({type:'custom:library-card',template:'calendar'});wrapper.hass=hass;
  window.loadCardHelpers=original;
  try {
    wrapper.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'agenda'}]});await settle();const newer=wrapper.child;assert.equal(newer.config.layout,'agenda');
    reject(Error('Old request failed'));await settle();assert.equal(wrapper.child,newer);assert.equal(wrapper.child.config.layout,'agenda');
  } finally {window.loadCardHelpers=original;}
});
test('preview labels survive both successful rendering and configuration errors', async () => {
  const {manager}=setup();const host=new Element('fieldset');const legend=new Element('legend');legend.textContent='Gespeichert';host.append(legend);
  await manager.previewCard(host,manager.draft,'calendar');assert.equal(host.children[0],legend);assert.equal(host.previewChild.config.layout,'month');
  await manager.previewCard(host,manager.draft,'missing');assert.equal(host.children[0],legend);assert.equal(host.previewChild,null);
});
test('hass updates reach the actual preview card while labels remain intact', async () => {
  const {manager,hass}=setup();const host=new Element('fieldset');await manager.previewCard(host,manager.draft,'calendar');
  manager.shadowRoot.querySelectorAll=()=>[host];const changed={...hass,states:{'sensor.new':{state:'on'}}};manager.hass=changed;assert.equal(host.previewChild.hass,changed);
});
test('failed central binding is atomic and leaves configuration and bindings intact', () => {
  const {manager}=setup();manager.path=['layout','nested'];manager.draft.groups.g={name:'Group',value:'value'};const item=manager.draft.templates.calendar,before=structuredClone(item);
  assert.equal(manager.bind(item,'g'),false);assert.deepEqual(item,before);assert.match(manager.notice,/Einstellungspfad/);
  assert.equal(manager.applyBinding(item,{path:['layout','nested'],person:'anna',field:'color'}),false);assert.deepEqual(item,before);
});
test('used imported template named toString cannot bypass deletion protection', async () => {
  const state=library();state.templates.toString=state.templates.calendar;delete state.templates.calendar;
  const {manager,saved}=setup(state,[{type:'custom:library-card',template:'toString'}]);delete manager.draft.templates.toString;manager.edit();await manager.save();assert.equal(saved.length,0);assert.match(manager.notice,/Verwendete Vorlagen/);
});
test('a formatted export larger than 2 MB remains importable when compact library is within limit', async () => {
  const {manager}=setup();const input={format:'ha-card-library',version:2,library:{templates:{},groups:{g:{name:'Large',value:Array.from({length:12000},()=>({x:'value'}))}},people:{}}};
  // Use several valid lists, each below the per-list limit, with formatting whitespace.
  input.library.groups.g.value=[...Array(3)].map(()=>Array.from({length:4000},()=>({x:'value'})));
  const serialized=JSON.stringify(input,null,30);assert.ok(serialized.length>2_000_000);
  const file=nodes(manager.shadowRoot).find(n=>n.type==='file');file.files=[{size:serialized.length,text:async()=>serialized}];await file.onchange();assert.equal(manager.mode,'import');assert.ok(manager.pendingImport.groups.g);
});
test('successful restore remains acknowledged when refreshing history fails', async () => {
  const {manager,hass}=setup();const saved=structuredClone(manager.draft);hass.callWS=async msg=>{
    if(msg.type==='lovelace/dashboards/list'||msg.type==='lovelace/resources/list')return [];
    if(msg.type==='lovelace/config')return {views:[]};
    if(msg.type==='card_library/restore')return {...saved,revision:1};
    if(msg.type==='card_library/history')throw Error('History unavailable');
    throw Error(msg.type);
  };
  manager.history=[{revision:0,saved_at:'2026-10-07T00:00:00Z',library:{templates:saved.templates,groups:{},people:saved.people}}];manager.mode='history';manager.render();await find(manager.shadowRoot,'Diese Version wiederherstellen').click();assert.equal(manager.draft.revision,1);assert.equal(manager.dirty,false);assert.match(manager.notice,/Version wiederhergestellt/);assert.match(manager.notice,/Verlauf konnte/);
});
test('adding a field after the selected parent disappeared gives a recoverable message', () => {
  const {manager}=setup();manager.selected='calendar';manager.path=['missing','child'];manager.render();
  nodes(manager.shadowRoot).find(n=>n.placeholder==='Feldname (bei Listen automatisch)').value='new';assert.doesNotThrow(()=>find(manager.shadowRoot,'Feld anlegen').click());assert.match(manager.notice,/Zielbereich existiert nicht mehr/);
  find(manager.shadowRoot,'Entwurf verwerfen / neu laden').click();assert.equal(manager.path,null);
});
test('obsolete design marks can be removed even when the original field no longer exists', async () => {
  const {manager,saved}=setup();manager.selected='calendar';manager.draft.templates.calendar.design_paths=[['removed']];manager.render();
  find(manager.shadowRoot,'Diese Designmarkierung entfernen').click();assert.deepEqual(manager.draft.templates.calendar.design_paths,[]);await manager.save();assert.equal(saved.length,1);
});
test('events from a detached card picker cannot add unexpected templates', async () => {
  registry.set('hui-card-picker',Element);
  const {manager}=setup();await manager.newCard(manager.shadowRoot);
  const chooser=nodes(manager.shadowRoot).find(n=>tag(n)==='fieldset'&&n.children.some(c=>c.textContent==='Karte hinzufügen'));assert.ok(chooser);
  chooser.isConnected=false;const count=Object.keys(manager.draft.templates).length;
  manager.picker.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{type:'markdown',content:'Stale'}},stopPropagation(){}}));assert.equal(Object.keys(manager.draft.templates).length,count);registry.delete('hui-card-picker');
});
test('original editor survives title typing and echoed HA setConfig without rebuilding', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();const native=editor.editor;assert.ok(native);
  editor.addEventListener('config-changed',event=>editor.setConfig(event.detail.config));
  for(const title of ['M','Me','Mein','Mein Energiefluss']) {
    native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,title}},stopPropagation(){}}));await settle();assert.equal(editor.editor,native);
  }
  const {resolveTemplate}=await import('../custom_components/card_library/frontend/library-core.js');assert.equal(resolveTemplate(editor.state.library,'calendar',editor.config.overrides).title,'Mein Energiefluss');
});
test('incoming library updates preserve an unsaved native editor and show the revision conflict', async () => {
  const {manager,push}=setup();manager.selected='calendar';manager.render();await settle();const native=manager.editor;
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,title:'Typing'}},stopPropagation(){}}));
  const changed=library();changed.revision=1;push(changed);await settle();assert.equal(manager.editor,native);assert.equal(manager.draft.templates.calendar.config.title,'Typing');assert.match(manager.conflictNode.textContent,/anderswo/);
});

test('unrelated library saves preserve the local native form and unsubmitted YAML', async () => {
  const state = library(); state.templates.other = {name:'Andere Karte',config:{type:'markdown',content:'Before'}};
  const {hass,push} = setup(state);
  const editor = document.createElement('library-card-editor'); editor.setConfig({template:'calendar'}); editor.hass = hass;
  openSection(editor.shadowRoot,'Örtliche Anpassungen'); await settle();
  const native = editor.editor, frame = editor.shadowRoot.children.at(-1);
  const section = openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');
  const source = nodes(section).find(node=>tag(node)==='textarea'); source.value = 'type: custom:calendar\ntitle: Still typing'; source.oninput();
  let updates = 0; native.setConfig = config=>{updates++;native.config=config;};
  const next = structuredClone(state); next.revision++; next.templates.other.config.content = 'After'; next.people.anna.name = 'Unused name';
  push(next); await settle();
  assert.equal(editor.shadowRoot.children.at(-1),frame); assert.equal(editor.editor,native); assert.equal(updates,0);
  assert.equal(source.value,'type: custom:calendar\ntitle: Still typing'); assert.equal(editor.localYamlDraft.text,source.value);
});

test('local forms still refresh selected bindings, input definitions and selector names', async () => {
  let state = library(); state.templates.calendar.bindings = [{path:['color'],person:'anna',field:'color'}];
  const {hass,push} = setup(state);
  const editor = document.createElement('library-card-editor'); editor.setConfig({template:'calendar'}); editor.hass = hass;
  openSection(editor.shadowRoot,'Örtliche Anpassungen'); await settle();
  const native = editor.editor;
  state = structuredClone(state); state.revision++; state.people.anna.color = '#112233'; push(state); await settle();
  assert.equal(editor.editor,native); assert.equal(native.config.color,'#112233');
  state = structuredClone(state); state.revision++; state.templates.calendar.inputs = [{path:['title'],label:'Name dieser Karte',type:'text'}]; push(state); await settle();
  assert.ok(inputField(editor.shadowRoot,'Name dieser Karte'));
  state = structuredClone(state); state.revision++; state.templates.calendar.name = 'Neuer Name'; push(state); await settle();
  assert.ok(nodes(editor.shadowRoot).filter(node=>tag(node)==='select').some(node=>options(node).some(option=>option.textContent==='Neuer Name')));
});

for (const type of ['library-card','library-card-editor','library-manager']) test(`detached ${type} stays unwatched across HA connection changes and resumes on reconnect`, async () => {
  const {hass} = setup(); const owner = document.createElement(type); owner.setConfig({template:'calendar'}); owner.hass = hass; await settle();
  owner.disconnectedCallback();
  let receive; const next = {...hass,connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};
  const frame = owner.shadowRoot.children;
  owner.hass = next; receive({...library(),revision:1}); await settle();
  assert.equal(owner.state.listeners.has(owner._listener),false); assert.equal(owner.shadowRoot.children,frame);
  owner.connectedCallback(); await settle();
  assert.equal(owner.state.listeners.has(owner._listener),true);
  if (type === 'library-card') assert.equal(owner.child.config.layout,'month');
  else assert.notEqual(owner.shadowRoot.children,frame);
});
test('direct YAML import adds one card and retains existing templates and the full configuration', async () => {
  const {manager,hass}=setup();const previous=hass.callWS;hass.callWS=async msg=>msg.type==='card_library/parse_card'?{type:'custom:energy-flow-card-plus',title:'Energiefluss',entities:{solar:{entity:'sensor.solar'}}}:previous(msg);
  find(manager.shadowRoot,'Karte aus YAML').click();const text=nodes(manager.shadowRoot).find(n=>tag(n)==='textarea');text.value='type: custom:energy-flow-card-plus\ntitle: Energiefluss';text.oninput();await find(manager.shadowRoot,'YAML als Karte übernehmen').click();
  assert.equal(Object.keys(manager.draft.templates).length,2);assert.equal(manager.draft.templates[manager.selected].config.entities.solar.entity,'sensor.solar');assert.equal(manager.yamlDraft,'');assert.equal(manager.dirty,true);
});
test('invalid YAML keeps the pasted text available for correction', async () => {
  const {manager,hass}=setup();hass.callWS=async()=>{throw Error('Ungültiges YAML');};find(manager.shadowRoot,'Karte aus YAML').click();const text=nodes(manager.shadowRoot).find(n=>tag(n)==='textarea');text.value='type: [broken';text.oninput();await find(manager.shadowRoot,'YAML als Karte übernehmen').click();
  assert.equal(manager.mode,'yaml');assert.equal(nodes(manager.shadowRoot).find(n=>tag(n)==='textarea').value,'type: [broken');assert.equal(Object.keys(manager.draft.templates).length,1);assert.match(manager.notice,/Ungültiges YAML/);
});
test('navigation groups creation and maintenance actions into closed menus', () => {
  const {manager}=setup();const menus=nodes(manager.shadowRoot).filter(n=>tag(n)==='details');
  const creation=menus.find(n=>n.children.some(c=>c.textContent==='Vorlage hinzufügen'));const tools=menus.find(n=>n.children.some(c=>c.textContent==='Werkzeuge'));assert.ok(creation);assert.ok(tools);assert.ok(!creation.open&&!tools.open);
  find(creation,'Neue Karte');find(creation,'Karte aus YAML');find(creation,'Dashboards / Übernahme');find(tools,'Bibliothek exportieren');find(tools,'Versionsverlauf');find(tools,'Entwurf verwerfen / neu laden');
  const area=nodes(manager.shadowRoot).find(n=>tag(n)==='select'&&options(n).some(c=>c.value==='people'));assert.equal(options(area).length,4);assert.equal(area.value,'templates');
  area.value='people';area.onchange();assert.equal(manager.mode,'people');const updated=nodes(manager.shadowRoot).find(n=>tag(n)==='select'&&options(n).some(c=>c.value==='groups'));updated.value='groups';updated.onchange();assert.equal(manager.mode,'groups');
});
test('save status updates without rebuilding the native editor and only enables for dirty drafts', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();const native=manager.editor;assert.equal(manager.saveButton.disabled,true);assert.equal(manager.statusBadge.textContent,'Alles gespeichert');
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,title:'Changed'}},stopPropagation(){}}));assert.equal(manager.saveButton.disabled,false);assert.equal(manager.statusBadge.textContent,'Ungespeicherte Änderungen');assert.equal(manager.editor,native);
});
test('advanced controls stay open after selecting a field and template actions are grouped', () => {
  const {manager}=setup();manager.selected='calendar';manager.path=['color'];manager.render();const advanced=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Vorlagenfelder, Design und Verknüpfungen'));assert.equal(advanced.open,true);
  const actions=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Vorlagenaktionen'));find(actions,'Löschen');find(actions,'Vorlage duplizieren');assert.ok(!actions.open);
});
test('HA built-in choices are available without loading the native picker or customCards', async () => {
  const {manager}=setup();await manager.newCard(manager.shadowRoot);const choice=nodes(manager.shadowRoot).find(n=>tag(n)==='select'&&options(n).some(c=>c.textContent==='HA-Karte wählen'));assert.ok(choice);
  for(const type of ['entities','tile','horizontal-stack','vertical-stack','grid','iframe']) assert.ok(options(choice).some(c=>c.value===type));
  class StackCard extends NativeCard {static getStubConfig(){return {cards:[{type:'entities',entities:['calendar.person_a']}]} }}
  registry.set('hui-horizontal-stack-card',StackCard);choice.value='horizontal-stack';
  try {await find(manager.shadowRoot,'HA-Karte hinzufügen').click();assert.equal(manager.draft.templates[manager.selected].config.type,'horizontal-stack');assert.equal(manager.draft.templates[manager.selected].config.cards[0].entities[0],'calendar.person_a');}
  finally {registry.delete('hui-horizontal-stack-card');}
});
test('official HA editor host receives the actual built-in configuration and its changes are saved', async () => {
  class HAEditor extends Element {constructor(){super('hui-card-element-editor');}}
  registry.set('hui-card-element-editor',HAEditor);
  try {
    const state=library();state.templates.calendar.config={type:'entities',entities:['calendar.person_a'],title:'Original'};const {manager}=setup(state);manager.selected='calendar';manager.render();await settle();
    assert.ok(manager.editor instanceof HAEditor);assert.equal(manager.editor.value.type,'entities');
    manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...manager.editor.value,title:'Native HA'}},stopPropagation(){}}));assert.equal(manager.draft.templates.calendar.config.title,'Native HA');
  } finally {registry.delete('hui-card-element-editor');}
});
test('late registered custom editors are awaited before setConfig is called', async () => {
  const {originalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');const editor=new Element('late-editor');editor.localName='late-editor';
  class DelayedCard {static getConfigElement(){return editor;}}
  registry.set('delayed-card',DelayedCard);const previous=customElements.whenDefined;
  customElements.whenDefined=async tag=>{assert.equal(tag,'late-editor');await settle();editor.setConfig=config=>{editor.config=config;};registry.set(tag,Element);};
  try {const loaded=await originalEditor({connection:{}},{type:'custom:delayed-card',title:'Ready'});assert.equal(loaded.config.title,'Ready');}
  finally {customElements.whenDefined=previous;registry.delete('delayed-card');registry.delete('late-editor');}
});

test('original editor receives dashboard config rather than the Lovelace controller', async () => {
  const {originalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');
  class Host extends Element {constructor(){super('hui-card-element-editor');}}
  registry.set('hui-card-element-editor',Host);
  try {const config={views:[{title:'Home'}]};const editor=await originalEditor({}, {type:'entities'}, {config});assert.equal(editor.lovelace,config);}
  finally {registry.delete('hui-card-element-editor');}
});
test('HA form-based card uses the original HA form editor and schema', async () => {
  const {originalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');
  const schema=[{name:'title',selector:{text:{}}}];
  class Card extends Element {static getConfigForm(){return {schema};}}
  class Form extends Element {constructor(){super('hui-form-editor');}setConfig(config){this.config=config;}}
  registry.set('schema-card',Card);registry.set('hui-form-editor',Form);
  try {const editor=await originalEditor({}, {type:'custom:schema-card',title:'Original'});assert.equal(editor.schema,schema);assert.equal(editor.config.title,'Original');}
  finally {registry.delete('schema-card');registry.delete('hui-form-editor');}
});
test('original editor initialization and error events do not modify the template', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();manager.dirty=false;
  const original=structuredClone(manager.draft.templates.calendar.config);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:original},stopPropagation(){}}));assert.equal(manager.dirty,false);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...original,title:'Invalid'},error:'Invalid native configuration'},stopPropagation(){}}));
  assert.deepEqual(manager.draft.templates.calendar.config,original);assert.equal(manager.dirty,false);
});

test('footer uses the original inner editor and retains width after edits', async () => {
  const {originalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');
  const config={type:'custom:library-container-card',max_width:1030,card:{type:'horizontal-stack',cards:[{type:'custom:mushroom-chips-card',chips:[{type:'back'}]}]}};
  const host=await originalEditor({},config);const native=host.children[0];let changed;
  assert.equal(native.config.type,'horizontal-stack');
  host.addEventListener('config-changed',e=>{changed=e.detail.config;});
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,title:'Footer'}},stopPropagation(){}}));
  assert.equal(changed.max_width,1030);assert.equal(changed.card.title,'Footer');assert.equal(changed.card.cards[0].chips[0].type,'back');
  const updatedHass={states:{}};host.hass=updatedHass;assert.equal(native.hass,updatedHass);
});
test('footer renderer limits width and forwards only the inner card to HA', async () => {
  const card=document.createElement('library-container-card');
  const inner={type:'horizontal-stack',cards:[{type:'markdown',content:'Navigation'}]};
  card.setConfig({type:'custom:library-container-card',max_width:1030,card:inner});card.hass={states:{}};await settle();
  assert.deepEqual(card.child.config,inner);assert.match(card.shadowRoot.children[0].textContent,/max-width:1030px/);
  const updated={states:{'sensor.test':{state:'on'}}};card.hass=updated;assert.equal(card.child.hass,updated);
});

test('footer can be saved even when its original editor cannot load', async () => {
  const {manager,saved}=setup();const original=window.loadCardHelpers;
  window.loadCardHelpers=async()=>{throw Error('Card resource unavailable');};
  try {
    const id=manager.addTemplate({type:'custom:library-container-card',max_width:1030,card:{type:'horizontal-stack',cards:[]}});await settle();
    assert.ok(id);await manager.save();assert.equal(saved.length,1);assert.equal(saved[0].library.templates[id].config.max_width,1030);
    const areas=nodes(manager.shadowRoot).filter(n=>tag(n)==='textarea');assert.ok(areas.some(n=>n.value.startsWith('footer:')));
  } finally {window.loadCardHelpers=original;}
});

test('insertion and central configuration are separate workflows', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;await settle();
  assert.ok(nodes(editor.shadowRoot).some(n=>n.textContent==='Örtliche Anpassungen'));
  assert.ok(!nodes(editor.shadowRoot).some(n=>n.type==='file'||n.textContent==='Löschen'||n.textContent==='Zentrale Änderungen speichern'));
  find(editor.shadowRoot,'Konfiguration').click();await settle();
  assert.ok(editor.manager);assert.ok(nodes(editor.manager.shadowRoot).some(n=>n.type==='file'));
  assert.ok(!nodes(editor.shadowRoot).some(n=>n.textContent==='Örtliche Anpassungen'||n.textContent==='Lokale Anpassungen zurücksetzen'));
  find(editor.shadowRoot,'Vorlagen einsetzen').click();await settle();
  assert.equal(editor.config.template,'calendar');assert.ok(nodes(editor.shadowRoot).some(n=>n.textContent==='Örtliche Anpassungen'));
});
test('switching workflows retains local settings and an unsaved central draft', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');
  editor.setConfig({type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'week'}]});editor.hass=hass;
  const before=structuredClone(editor.config);find(editor.shadowRoot,'Konfiguration').click();const manager=editor.manager;
  manager.draft.templates.calendar.name='Unsaved central name';manager.edit();
  find(editor.shadowRoot,'Vorlagen einsetzen').click();assert.deepEqual(editor.config,before);
  find(editor.shadowRoot,'Konfiguration').click();assert.equal(editor.manager,manager);assert.equal(manager.draft.templates.calendar.name,'Unsaved central name');assert.equal(manager.dirty,true);
});
test('local editor writes only reference overrides and leaves the central library intact', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();
  const original=structuredClone(editor.state.library.templates.calendar);
  editor.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...editor.editor.config,title:'Only here'}},stopPropagation(){}}));
  assert.deepEqual(editor.state.library.templates.calendar,original);assert.ok(editor.config.overrides.some(o=>o.path[0]==='title'&&o.value==='Only here'));
});
test('non-admins only see insertion and cannot retain a configuration panel', () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.manage=true;editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass={...hass,user:{is_admin:false}};
  assert.equal(editor.manage,false);assert.ok(!nodes(editor.shadowRoot).some(n=>n.textContent==='Konfiguration'));assert.ok(!editor.manager);
});
test('workflow tabs can be changed using arrow keys', () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;
  find(editor.shadowRoot,'Vorlagen einsetzen').onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(editor.manage,true);
  find(editor.shadowRoot,'Konfiguration').onkeydown({key:'Home',preventDefault(){}});assert.equal(editor.manage,false);
});

test('calendar-style sections retain their open state when the manager rerenders', () => {
  const {manager}=setup();const opened=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Werkzeuge'));
  opened.open=true;const transfer=nodes(opened).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Import und Export'));transfer.open=true;
  manager.render();const restored=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Werkzeuge'));assert.equal(restored.open,true);
  assert.equal(nodes(restored).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Import und Export')).open,true);
});
test('form controls have associated labels and nested section contents', () => {
  const {manager}=setup();manager.selected='calendar';manager.render();
  const labels=nodes(manager.shadowRoot).filter(n=>tag(n)==='label');
  for(const control of nodes(manager.shadowRoot).filter(n=>['select','textarea'].includes(tag(n)))) {
    assert.ok(labels.some(label=>label.htmlFor===control.id),'Missing label for '+tag(control));
  }
  const section=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Im Dashboard einbauen'));
  assert.equal(tag(section.children[0]),'summary');assert.equal(section.children[1].className,'section-content');
});
test('native editor is isolated from library styles without losing its config events', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();
  function findFrame(root){for(const node of root.children||[]){if(node.shadowRoot?.children.includes(manager.editor))return node;const child=findFrame(node);if(child)return child;}}
  const frame=findFrame(manager.shadowRoot);assert.ok(frame);assert.ok(!frame.libraryOwned);
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...manager.editor.config,title:'Isolated original'}},stopPropagation(){}}));assert.equal(manager.draft.templates.calendar.config.title,'Isolated original');
});
test('field selection reopens advanced controls while preserving other disclosures', () => {
  const {manager}=setup();manager.selected='calendar';manager.render();
  const advanced=nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Vorlagenfelder, Design und Verknüpfungen'));advanced.open=false;
  manager.path=['color'];manager.render();assert.equal(nodes(manager.shadowRoot).find(n=>tag(n)==='details'&&n.children.some(c=>c.textContent==='Vorlagenfelder, Design und Verknüpfungen')).open,true);
});

test('closed preview and local-editor sections do not instantiate expensive cards', async () => {
  const {hass}=setup();previews.length=0;
  const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;await settle();
  assert.equal(previews.length,0);assert.equal(editor.editor,undefined);
  openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();assert.ok(editor.editor);assert.equal(previews.length,1); // factory lookup only
  openSection(editor.shadowRoot,'Vorschau dieser Verwendung');await settle();assert.ok(editor.localPreview.previewChild);
});
test('manager retains the original editor across menu rebuilds and attaches one current listener', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();const native=manager.editor;
  manager.render();await settle();manager.render();await settle();assert.equal(manager.editor,native);assert.equal(native.listeners['config-changed'].length,1);
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,title:'After reuse'}},stopPropagation(){}}));assert.equal(manager.draft.templates.calendar.config.title,'After reuse');
});
test('hidden advanced configuration and dependency reports are built only when opened', async () => {
  const state=library();state.templates.calendar.config.large={secret_field_9281:'value'};
  const {manager}=setup(state);manager.selected='calendar';manager.render();await settle();
  assert.ok(!nodes(manager.shadowRoot).some(n=>n.textContent==='secret_field_9281'));assert.ok(!nodes(manager.shadowRoot).some(n=>n.placeholder==='/hacsfiles/…/karte.js'));
  openSection(manager.shadowRoot,'Vorlagenfelder, Design und Verknüpfungen');assert.ok(nodes(manager.shadowRoot).some(n=>n.textContent==='secret_field_9281'));
  openSection(manager.shadowRoot,'Verwendungen und Abhängigkeiten');assert.ok(nodes(manager.shadowRoot).some(n=>n.placeholder==='/hacsfiles/…/karte.js'));
});
test('preview requests reuse unchanged rendered cards but rebuild on changed configuration', async () => {
  const {manager}=setup();const host=new Element('div');await manager.previewCard(host,manager.draft,'calendar');const original=host.previewChild;
  await manager.previewCard(host,manager.draft,'calendar');assert.equal(host.previewChild,original);
  manager.draft.templates.calendar.config.layout='agenda';await manager.previewCard(host,manager.draft,'calendar');assert.notEqual(host.previewChild,original);assert.equal(host.previewChild.config.layout,'agenda');
});
test('cached editor is updated after a central push and switches correctly to another template', async () => {
  const state=library();state.templates.second={name:'Other',config:{type:'custom:calendar',title:'Second'},bindings:[]};
  const {manager,push}=setup(state);manager.selected='calendar';manager.render();await settle();const original=manager.editor;
  const changed=structuredClone(state);changed.revision=1;changed.templates.calendar.config.layout='week';push(changed);await settle();assert.equal(manager.editor,original);assert.equal(original.config.layout,'week');
  manager.selected='second';manager.render();await settle();assert.notEqual(manager.editor,original);assert.equal(manager.editor.config.title,'Second');
});

test('reopening a hidden preview catches up after editing while it was closed', async () => {
  const {manager}=setup();manager.selected='calendar';manager.render();await settle();const section=openSection(manager.shadowRoot,'Kartenvorschau');await settle();
  section.open=false;section.dispatchEvent({type:'toggle'});manager.draft.templates.calendar.config.layout='agenda';
  section.open=true;section.dispatchEvent({type:'toggle'});await settle();assert.equal(manager.previewHost.previewChild.config.layout,'agenda');
});
test('closed preview cards do not receive background hass updates and recover on reopening', async () => {
  const {manager,hass}=setup();manager.selected='calendar';manager.render();await settle();const section=openSection(manager.shadowRoot,'Kartenvorschau');await settle();const child=manager.previewHost.previewChild;
  section.open=false;section.dispatchEvent({type:'toggle'});manager.shadowRoot.querySelectorAll=()=>[manager.previewHost];const changed={...hass,states:{'sensor.new':{state:'on'}}};manager.hass=changed;assert.notEqual(child.hass,changed);
  section.open=true;section.dispatchEvent({type:'toggle'});await settle();assert.equal(manager.previewHost.previewChild,child);assert.equal(child.hass,changed);
});
test('overlapping menu renders share the in-flight original editor factory', async () => {
  let calls=0,release;class PendingCard extends NativeCard {static getConfigElement(){calls++;return new Promise(resolve=>{release=resolve;});}}
  registry.set('pending-card',PendingCard);
  try {const state=library();state.templates.calendar.config={type:'custom:pending-card'};const {manager}=setup(state);manager.selected='calendar';manager.render();manager.render();await settle();assert.equal(calls,1);release(new NativeEditor('native-editor'));await settle();assert.ok(manager.editor);assert.equal(manager.editor.listeners['config-changed'].length,1);}
  finally {registry.delete('pending-card');}
});

test('dashboard central changes reuse native setConfig and keep local overrides', async () => {
  const {hass,push}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar',overrides:[{path:['layout'],value:'agenda'}]});wrapper.hass=hass;await settle();
  const child=wrapper.child;let updates=0;child.setConfig=config=>{updates++;child.config=config;};
  const changed=library();changed.templates.calendar.config.color='#ffffff';push(changed);await settle();
  assert.equal(wrapper.child,child);assert.equal(updates,1);assert.equal(child.config.color,'#ffffff');assert.equal(child.config.layout,'agenda');
  const unrelated=structuredClone(changed);unrelated.people.anna.color='#123456';push(unrelated);await settle();assert.equal(updates,1);assert.equal(wrapper.child,child);
});
test('dashboard changes recreate unsupported or throwing cards and changed card types', async () => {
  const {hass,push}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass=hass;await settle();
  const old=wrapper.child;old.setConfig=()=>{throw Error('update unsupported');};const changed=library();changed.templates.calendar.config.layout='week';push(changed);await settle();assert.notEqual(wrapper.child,old);assert.equal(wrapper.child.config.layout,'week');
  const updated=wrapper.child;let updates=0;updated.setConfig=()=>updates++;changed.templates.calendar.config.type='entities';push(structuredClone(changed));await settle();assert.notEqual(wrapper.child,updated);assert.equal(updates,0);
});
test('dashboard equal config echoes skip resolution and card creation', async () => {
  const {hass}=setup();const wrapper=document.createElement('library-card');const reference={template:'calendar'};wrapper.setConfig(reference);wrapper.hass=hass;await settle();const child=wrapper.child,token=wrapper.token;
  wrapper.setConfig(structuredClone(reference));await settle();assert.equal(wrapper.token,token);assert.equal(wrapper.child,child);
});
test('shared dashboard resolutions isolate mutating cards and refresh bound person values', async () => {
  const state=library();state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];const {hass,push}=setup(state);
  const a=document.createElement('library-card'),b=document.createElement('library-card');for(const card of [a,b]){card.setConfig({template:'calendar'});card.hass=hass;}await settle();
  a.child.config.color='mutated';assert.equal(b.child.config.color,'#aa3344');
  const c=document.createElement('library-card');c.setConfig({template:'calendar'});c.hass=hass;await settle();assert.equal(c.child.config.color,'#aa3344');
  const changed=structuredClone(state);changed.people.anna.color='#112233';push(changed);await settle();for(const card of [a,b,c])assert.equal(card.child.config.color,'#112233');
});
test('footer width changes reuse inner card and its state', async () => {
  const {hass}=setup();const footer=document.createElement('library-container-card');footer.setConfig({type:'custom:library-container-card',max_width:1030,card:{type:'horizontal-stack',cards:[]}});footer.hass=hass;await settle();const child=footer.child;
  footer.setConfig({type:'custom:library-container-card',max_width:800,card:{type:'horizontal-stack',cards:[]}});await settle();assert.equal(footer.child,child);assert.match(footer.widthStyle.textContent,/800px/);
  child.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});await settle();assert.notEqual(footer.child,child);
});
test('native update emitting rebuild cannot overwrite the replacement render', async () => {
  const {hass,push}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass=hass;await settle();const child=wrapper.child;
  child.setConfig=()=>child.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});const changed=library();changed.templates.calendar.config.layout='week';push(changed);await settle();assert.notEqual(wrapper.child,child);assert.equal(wrapper.child.config.layout,'week');assert.equal(wrapper.signature,JSON.stringify(wrapper.child.config));
});

test('local style UI adds multiline card-mod without changing central template and can relink', async () => {
  const {hass,push}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();const section=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');
  const css=nodes(section).find(n=>tag(n)==='textarea');css.value='ha-card {\n  background: transparent !important;\n  border: none !important;\n}\n';find(section,'Style lokal übernehmen').click();
  assert.deepEqual(editor.config.overrides,[{path:['card_mod','style'],value:css.value}]);assert.equal(editor.state.library.templates.calendar.config.card_mod,undefined);assert.equal(editor.editor.config.card_mod.style,css.value);
  const changed=library();changed.templates.calendar.config.layout='week';push(changed);await settle();assert.equal(editor.config.overrides[0].value,css.value);
  const refreshed=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');find(refreshed,'Style wieder aus Vorlage übernehmen').click();assert.deepEqual(editor.config.overrides,[]);
});
test('local style UI supports style_ha_card and nested stack paths while protecting bindings', () => {
  const state=library();state.templates.calendar.config={type:'horizontal-stack',cards:[{type:'custom:calendar',color:'#aa3344'}]};state.templates.calendar.bindings=[{path:['cards',0,'color'],person:'anna',field:'color'}];const {hass}=setup(state);
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');const inputs=nodes(section).filter(n=>tag(n)==='input');const css=nodes(section).find(n=>tag(n)==='textarea');
  find(section,'style_ha_card').click();css.value='background: transparent !important;\nborder: none !important;';find(section,'Style lokal übernehmen').click();assert.equal(editor.config.overrides[0].path[0],'style_ha_card');
  inputs[0].value='cards.0.card_mod.style';css.value='ha-card { box-shadow: none; }';find(section,'Style lokal übernehmen').click();assert.deepEqual(editor.config.overrides[1].path,['cards',0,'card_mod','style']);
  inputs[0].value='cards.0.color';find(section,'Style lokal übernehmen').click();assert.equal(editor.config.overrides.length,2);assert.ok(nodes(section).some(n=>String(n.textContent).includes('zentral verwaltet')));
});

test('complete local YAML accepts arbitrary design objects lists actions and field deletions', async () => {
  const state=library();state.templates.calendar.config.entities=['sensor.original'];const {hass}=setup(state);
  const edited={type:'custom:calendar',layout:'month',entities:['sensor.local'],card_mod:{style:{'.': 'ha-card {background: transparent}', 'hui-card $': {'.':'div {color: red}'}}},styles:{card:[{'border-radius':'12px'},{opacity:0.9}]},tap_action:{action:'navigate',navigation_path:'/local'}};
  hass.callWS=async msg=>{assert.equal(msg.type,'card_library/parse_card');assert.ok(msg.yaml.includes('card_mod:'));return edited;};
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');const source=nodes(section).find(n=>tag(n)==='textarea');source.value='type: custom:calendar\ncard_mod:\n  style: {}';await find(section,'YAML lokal übernehmen').click();
  const {resolveTemplate}=await import('../custom_components/card_library/frontend/library-core.js');assert.deepEqual(resolveTemplate(editor.state.library,'calendar',editor.config.overrides),edited);assert.equal(state.templates.calendar.config.card_mod,undefined);assert.ok(editor.config.overrides.some(o=>o.path[0]==='color'&&o.remove));
});
test('complete local YAML preserves protected bindings and rejects root card type changes', async () => {
  const state=library();state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];const {hass}=setup(state);let edited={type:'custom:calendar',layout:'week',color:'#ffffff',style_ha_card:'border: none;'};hass.callWS=async()=>edited;
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');await find(section,'YAML lokal übernehmen').click();assert.ok(!editor.config.overrides.some(o=>o.path[0]==='color'));const previous=structuredClone(editor.config.overrides);
  edited={type:'entities',entities:[]};await find(section,'YAML lokal übernehmen').click();assert.deepEqual(editor.config.overrides,previous);assert.ok(nodes(section).some(n=>String(n.textContent).includes('Kartentyp')));
});
test('complete local YAML rejects stale and malformed results without losing current overrides', async () => {
  const {hass}=setup();let release;hass.callWS=()=>new Promise(resolve=>{release=resolve;});const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');const pending=find(section,'YAML lokal übernehmen').click();editor.config.overrides=[{path:['layout'],value:'agenda'}];release({type:'custom:calendar',layout:'week'});await pending;assert.equal(editor.config.overrides[0].value,'agenda');assert.ok(nodes(section).some(n=>String(n.textContent).includes('inzwischen geändert')));
  find(section,'Aktuelle Konfiguration laden').click();hass.callWS=async()=>{throw Error('Ungültiges YAML');};await find(section,'YAML lokal übernehmen').click();assert.equal(editor.config.overrides[0].value,'agenda');assert.ok(nodes(section).some(n=>n.textContent==='Ungültiges YAML'));
});

test('card-mod additions changes and removals rerun the HA factory instead of native setConfig', async () => {
  const {hass,push}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass=hass;await settle();let previous=wrapper.child;
  for(const card_mod of [{style:'ha-card {background: red}'},{style:{'.':'ha-card {background: blue}', 'hui-card $':{'.':'div {color: red}'}}},undefined]) {
    let updates=0;previous.setConfig=()=>updates++;const changed=library();if(card_mod)changed.templates.calendar.config.card_mod=card_mod;push(changed);await settle();assert.notEqual(wrapper.child,previous);assert.equal(updates,0);assert.deepEqual(wrapper.child.config.card_mod,card_mod);previous=wrapper.child;
  }
});
test('nested stack card-mod changes rebuild the real stack and preserve all local configuration', async () => {
  const state=library();state.templates.calendar.config={type:'horizontal-stack',cards:[{type:'entities',entities:['sensor.a']}]};const {hass}=setup(state);const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass=hass;await settle();const previous=wrapper.child;let updates=0;previous.setConfig=()=>updates++;
  const style={style:{'hui-entities-card $':{'.':'ha-card {border:none;}'}}};wrapper.setConfig({template:'calendar',overrides:[{path:['cards',0,'card_mod'],value:style},{path:['cards',0,'entities'],value:['sensor.local']}]});await settle();assert.notEqual(wrapper.child,previous);assert.equal(updates,0);assert.deepEqual(wrapper.child.config.cards[0].card_mod,style);assert.deepEqual(wrapper.child.config.cards[0].entities,['sensor.local']);
});
test('footer card-mod changes rerun inner factory while ordinary styles reach native setConfig', async () => {
  const {hass}=setup();const footer=document.createElement('library-container-card');const config={type:'custom:library-container-card',max_width:1030,card:{type:'custom:calendar'}};footer.setConfig(config);footer.hass=hass;await settle();const first=footer.child;first.setConfig=value=>{first.config=value;};
  footer.setConfig({...config,card:{...config.card,style_ha_card:'background:transparent;'}});await settle();assert.equal(footer.child,first);assert.equal(first.config.style_ha_card,'background:transparent;');
  footer.setConfig({...config,card:{...config.card,card_mod:{style:'ha-card {border:none;}'}}});await settle();assert.notEqual(footer.child,first);assert.equal(footer.child.config.card_mod.style,'ha-card {border:none;}');
});

test('arbitrary local UI extension fields rerun the HA factory with the complete resolved config', async () => {
  const {hass}=setup();const wrapper=document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass=hass;await settle();const first=wrapper.child;let updates=0;first.setConfig=()=>updates++;
  const styles={card:[{background:'transparent'},{'box-shadow':'none'}]};wrapper.setConfig({template:'calendar',overrides:[{path:['styles'],value:styles},{path:['style_ha_card'],value:'border: none !important;'}]});await settle();assert.notEqual(wrapper.child,first);assert.equal(updates,0);assert.deepEqual(wrapper.child.config.styles,styles);assert.equal(wrapper.child.config.style_ha_card,'border: none !important;');assert.equal(wrapper.child.config.layout,'month');
});

test('slow local editor factory receives latest overrides after YAML or style edits', async () => {
  let release;class SlowEditorCard extends NativeCard {static getConfigElement(){return new Promise(resolve=>{release=resolve;});}}registry.set('slow-editor-card',SlowEditorCard);
  try {const state=library();state.templates.calendar.config={type:'custom:slow-editor-card',title:'Before'};const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();editor.config.overrides=[{path:['title'],value:'Latest'}];release(new NativeEditor());await settle();assert.equal(editor.editor.config.title,'Latest');}
  finally {registry.delete('slow-editor-card');}
});
test('slow central editor factory receives latest draft fields', async () => {
  let release;class SlowEditorCard extends NativeCard {static getConfigElement(){return new Promise(resolve=>{release=resolve;});}}registry.set('slow-central-card',SlowEditorCard);
  try {const state=library();state.templates.calendar.config={type:'custom:slow-central-card',title:'Before'};const {manager}=setup(state);manager.selected='calendar';manager.render();await settle();manager.draft.templates.calendar.config.title='Latest';release(new NativeEditor());await settle();assert.equal(manager.editor.config.title,'Latest');}
  finally {registry.delete('slow-central-card');}
});
test('footer handles immediate rebuild during initial hass assignment', async () => {
  const original=window.loadCardHelpers;let creations=0;let first;
  window.loadCardHelpers=async()=>({createCardElement:config=>{const card=new NativeCard();card.config=config;creations++;if(creations===1){first=card;Object.defineProperty(card,'hass',{set(){card.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});}});}return card;}});
  try {const {hass}=setup();const footer=document.createElement('library-container-card');footer.setConfig({type:'custom:library-container-card',card:{type:'entities',entities:[]}});footer.hass=hass;await settle();assert.equal(creations,2);assert.notEqual(footer.child,first);assert.equal(footer.shadowRoot.children[1],footer.child);}
  finally {window.loadCardHelpers=original;}
});
test('original editor cache reflects config before synchronous change echoes and recovers on errors', async () => {
  const {updateOriginalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');const cache={signature:JSON.stringify({type:'entities',title:'Old'})};const next={type:'entities',title:'New'};let observed;
  const editor={setConfig(){observed=cache.signature;}};updateOriginalEditor(editor,cache,{},next);assert.equal(observed,JSON.stringify(next));
  const stable=cache.signature;editor.setConfig=()=>{throw Error('unsupported update');};assert.throws(()=>updateOriginalEditor(editor,cache,{}, {...next,title:'Fail'}));assert.equal(cache.signature,stable);
});

test('footer original editor receives changing Lovelace context', async () => {
  const {originalEditor}=await import('../custom_components/card_library/frontend/library-ha-ui.js');const {hass}=setup();const editor=await originalEditor(hass,{type:'custom:library-container-card',card:{type:'custom:calendar'}},{views:[]});const native=editor.children[0],context={views:[{title:'New context'}]};editor.lovelace=context;assert.equal(native.lovelace,context);
});
test('local style remains emitted when a third-party editor update throws', async () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();const original=editor.editor;original.setConfig=()=>{throw Error('Editor update failed');};let emitted;editor.addEventListener('config-changed',event=>{emitted=event.detail.config;});const section=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');nodes(section).find(n=>tag(n)==='textarea').value='ha-card {border: none;}';find(section,'Style lokal übernehmen').click();assert.equal(emitted.overrides[0].value,'ha-card {border: none;}');assert.equal(original.listeners['config-changed'].length,0);await settle();assert.equal(editor.config.overrides[0].value,'ha-card {border: none;}');
});
test('removed native child upgrade does not receive the current hass object', async () => {
  const {hass}=setup();const card=document.createElement('library-card');card.setConfig({template:'calendar'});card.hass=hass;await settle();const old=card.child;card.setConfig({template:'calendar',overrides:[{path:['layout'],value:'week'}]});await settle();const stale=old.hass;card.hass={...hass,states:{'sensor.new':{state:'on'}}};old.dispatchEvent({type:'ll-upgrade',target:old,stopPropagation(){}});assert.equal(old.hass,stale);
});

test('unchanged preview reuse retains functional ll-rebuild with the latest snapshot', async () => {
  const {manager}=setup();const host=new Element();const first=library();await manager.previewCard(host,first,'calendar');const child=host.previewChild;
  const latest=library();await manager.previewCard(host,latest,'calendar');latest.templates.calendar.config.layout='Latest';child.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});await settle();assert.notEqual(host.previewChild,child);assert.equal(host.previewChild.config.layout,'Latest');
});

test('shared resolution cache cannot turn malformed overrides into valid empty overrides', async () => {
  const {hass}=setup();const valid=document.createElement('library-card');valid.setConfig({template:'calendar',overrides:[]});valid.hass=hass;await settle();assert.ok(valid.child);
  for(const overrides of [null,false,0,'']) {const invalid=document.createElement('library-card');invalid.setConfig({template:'calendar',overrides});invalid.hass=hass;await settle();assert.equal(invalid.child,null);assert.ok(nodes(invalid.shadowRoot).some(n=>String(n.textContent).includes('Liste')));}
});

test('reference and footer adapters preserve zero card size for hidden child cards', async () => {
  const {hass}=setup();const reference=document.createElement('library-card');reference.setConfig({template:'calendar'});reference.hass=hass;const footer=document.createElement('library-container-card');footer.setConfig({type:'custom:library-container-card',card:{type:'conditional',conditions:[],card:{type:'markdown',content:'Hidden'}}});footer.hass=hass;await settle();for(const wrapper of [reference,footer]){wrapper.child.getCardSize=()=>0;assert.equal(wrapper.getCardSize(),0);}
});

test('native local editor rejects protected list truncation then accepts a valid sibling edit', async () => {
  const state=library();state.templates.calendar.config={type:'horizontal-stack',cards:[{type:'markdown',content:'A'},{type:'markdown',content:'B',color:'#aa3344'}]};state.templates.calendar.bindings=[{path:['cards',1,'color'],person:'anna',field:'color'}];const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();
  editor.editor.dispatchEvent({type:'config-changed',detail:{config:{type:'horizontal-stack',cards:[{type:'markdown',content:'A'}]}},stopPropagation(){}});assert.equal(editor.config.overrides,undefined);assert.ok(nodes(editor.shadowRoot).some(n=>String(n.textContent).includes('Struktur')));
  const valid=structuredClone(state.templates.calendar.config);valid.cards[0].content='Changed';editor.editor.dispatchEvent({type:'config-changed',detail:{config:valid},stopPropagation(){}});assert.equal(editor.config.overrides[0].value,'Changed');
});

test('central native editor cannot reconstruct a removed protected list item incompletely', async () => {
  const state=library();state.templates.calendar.config={type:'horizontal-stack',cards:[{type:'markdown',content:'A'},{type:'markdown',content:'B',color:'#aa3344'}]};state.templates.calendar.bindings=[{path:['cards',1,'color'],person:'anna',field:'color'}];const {manager}=setup(state);manager.selected='calendar';manager.render();await settle();const previous=structuredClone(manager.draft.templates.calendar.config);
  manager.editor.dispatchEvent({type:'config-changed',detail:{config:{type:'horizontal-stack',cards:[{type:'markdown',content:'A'}]}},stopPropagation(){}});assert.deepEqual(manager.draft.templates.calendar.config,previous);assert.equal(Boolean(manager.dirty),false);assert.ok(nodes(manager.shadowRoot).some(n=>String(n.textContent).includes('Struktur')));
});

test('equivalent reference changes do not force a later unrelated central card rebuild', async () => {
  const {hass,push}=setup();const card=document.createElement('library-card');card.setConfig({template:'calendar'});card.hass=hass;await settle();const child=card.child;let updates=0;child.setConfig=config=>{updates++;child.config=config;};
  card.setConfig({template:'calendar',overrides:[{path:['layout'],value:'month'}]});await settle();assert.equal(card.child,child);
  const changed=library();changed.templates.calendar.config.color='#ffffff';push(changed);await settle();assert.equal(card.child,child);assert.equal(updates,1);assert.equal(child.config.layout,'month');
});

test('local style UI can modify a middle card in an expanded local stack', async () => {
  const state=library();state.templates.calendar.config={type:'horizontal-stack',cards:[{type:'markdown',content:'Central'}]};const {hass}=setup(state);const cards=[{type:'markdown',content:'A'},{type:'markdown',content:'B'},{type:'markdown',content:'C'}];const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar',overrides:[{path:['cards'],value:cards}]});editor.hass=hass;const section=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');nodes(section).find(n=>tag(n)==='input').value='cards.1.card_mod.style';nodes(section).find(n=>tag(n)==='textarea').value='ha-card {background: transparent;}';find(section,'Style lokal übernehmen').click();
  const {resolveTemplate}=await import('../custom_components/card_library/frontend/library-core.js');const resolved=resolveTemplate(editor.state.library,'calendar',editor.config.overrides);assert.equal(resolved.cards.length,3);assert.equal(resolved.cards[1].content,'B');assert.equal(resolved.cards[1].card_mod.style,'ha-card {background: transparent;}');assert.equal(resolved.cards[2].content,'C');assert.equal(cards[1].card_mod,undefined);
});

test('unapplied local YAML text survives library rerenders and still detects stale configuration', async () => {
  const {hass,push}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');const source=nodes(section).find(n=>tag(n)==='textarea');source.value='type: custom:calendar\nlayout: agenda';source.oninput?.();
  const changed=library();changed.templates.calendar.config.color='#ffffff';push(changed);const refreshed=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)');assert.equal(nodes(refreshed).find(n=>tag(n)==='textarea').value,source.value);await find(refreshed,'YAML lokal übernehmen').click();assert.ok(nodes(refreshed).some(n=>String(n.textContent).includes('inzwischen geändert')));assert.equal(editor.config.overrides,undefined);
});
test('unapplied local CSS and target survive library rerenders', () => {
  const {hass,push}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');find(section,'style_ha_card').click();const source=nodes(section).find(n=>tag(n)==='textarea');source.value='background: transparent !important;';source.oninput?.();push(library());const refreshed=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');assert.equal(nodes(refreshed).find(n=>tag(n)==='textarea').value,source.value);assert.equal(nodes(refreshed).find(n=>tag(n)==='input').value,'style_ha_card');
});

test('explicit reset clears unapplied YAML and CSS drafts', () => {
  const {hass}=setup();const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const yaml=openSection(editor.shadowRoot,'Vollständige lokale Konfiguration (YAML)'),source=nodes(yaml).find(n=>tag(n)==='textarea');source.value='type: custom:calendar\ntitle: Draft';source.oninput();const style=openSection(editor.shadowRoot,'Zusätzliche lokale Styles'),css=nodes(style).find(n=>tag(n)==='textarea');css.value='ha-card {color: red;}';css.oninput();find(editor.shadowRoot,'Lokale Anpassungen zurücksetzen').click();assert.equal(editor.localYamlDraft,null);assert.equal(editor.localStyleDraft,null);
});

test('external template changes discard old local paths and drafts and choose the footer style target', () => {
  const state=library();state.templates.footer={name:'Footer',config:{type:'custom:library-container-card',card:{type:'markdown',content:'Footer'}},bindings:[]};const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;editor.localPath=['old'];editor.stylePath='cards.1.card_mod.style';editor.localStyleDraft={template:'calendar',path:editor.stylePath,text:'Old CSS'};editor.localYamlDraft={template:'calendar',text:'Old YAML',baseline:'old'};
  editor.setConfig({template:'footer'});assert.equal(editor.localPath,null);assert.equal(editor.localStyleDraft,null);assert.equal(editor.localYamlDraft,null);const styles=openSection(editor.shadowRoot,'Zusätzliche lokale Styles');assert.equal(nodes(styles).find(n=>tag(n)==='input').value,'card.card_mod.style');
});

test('a failing library editor cannot interrupt central updates to other dashboard references', async () => {
  const {manager,hass,push}=setup();const card=document.createElement('library-card');card.setConfig({template:'calendar'});card.hass=hass;await settle();manager.libraryChanged=()=>{throw Error('Editor refresh failed');};const changed=library();changed.templates.calendar.config.layout='Updated';assert.doesNotThrow(()=>push(changed));await settle();assert.equal(card.child.config.layout,'Updated');assert.ok(nodes(manager.shadowRoot).some(n=>n.textContent==='Editor refresh failed'));
});

test('dashboard loading inspects the requested template before helpers and never resolves unused templates', async () => {
  let receive,reads=0;const hass={states:{},connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};const card=document.createElement('library-card');card.setConfig({template:'requested'});card.hass=hass;
  receive({templates:{requested:{get config(){reads++;return {type:'markdown',content:'Requested'};},bindings:[]},unused:{get config(){throw Error('Unused template was inspected');},bindings:[]}},groups:{}});await settle();assert.equal(card.child.config.content,'Requested');assert.equal(reads,1);
});
test('distinct local references share one template dependency check per snapshot', async () => {
  let receive,reads=0;const hass={states:{},connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};const cards=Array.from({length:10},(_,i)=>{const card=document.createElement('library-card');card.setConfig({template:'requested',overrides:[{path:['title'],value:'Local '+i}]});return card;});cards[0].hass=hass;
  receive({templates:{requested:{get config(){reads++;return {type:'markdown',content:'Central'};},bindings:[]}},groups:{}});for(const card of cards.slice(1))card.hass=hass;await settle();assert.equal(reads,1);for(let i=0;i<cards.length;i++)assert.equal(cards[i].child.config.title,'Local '+i);
});
test('warm template cache cannot conceal deletion changed bindings or missing dependencies', async () => {
  const state=library();state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];const {hass,push}=setup(state);const card=document.createElement('library-card');card.setConfig({template:'calendar'});card.hass=hass;await settle();const first=card.child;let updates=0;first.setConfig=config=>{first.config=config;updates++;};const unrelated=structuredClone(state);unrelated.people.anna.name='New name';push(unrelated);await settle();assert.equal(card.child,first);assert.equal(updates,0);
  const changed=structuredClone(unrelated);changed.people.anna.color='#112233';push(changed);await settle();assert.equal(first.config.color,'#112233');assert.equal(updates,1);
  const regrouped=structuredClone(changed);regrouped.groups.palette={name:'Palette',value:'#abcdef'};regrouped.templates.calendar.bindings=[{path:['color'],group:'palette'}];push(regrouped);await settle();assert.equal(first.config.color,'#abcdef');assert.equal(updates,2);
  const missing=structuredClone(changed);delete missing.people.anna;push(missing);await settle();assert.equal(card.child,null);push(changed);await settle();assert.equal(card.child.config.color,'#112233');const deleted=structuredClone(changed);delete deleted.templates.calendar;push(deleted);await settle();assert.equal(card.child,null);
});

test('missing requested template or bound group never loads HA card helpers', async () => {
  const original=window.loadCardHelpers;let helperCalls=0,receive;window.loadCardHelpers=async()=>{helperCalls++;return original();};
  try {const hass={states:{},connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};const card=document.createElement('library-card');card.setConfig({template:'missing'});card.hass=hass;receive({templates:{unrelated:{config:{type:'markdown',content:'Other'},bindings:[]}},groups:{}});await settle();assert.equal(helperCalls,0);assert.equal(card.child,null);
    receive({templates:{missing:{config:{type:'markdown',content:'Needed'},bindings:[{path:['content'],group:'absent'}]}},groups:{}});await settle();assert.equal(helperCalls,0);assert.equal(card.child,null);
  } finally {window.loadCardHelpers=original;}
});

test('popup UI generates a reference action with local overrides and original Bubble options', () => {
  const {hass} = setup();
  const editor = document.createElement('library-card-editor');
  editor.setConfig({type:'custom:library-card', template:'calendar', overrides:[{path:['layout'], value:'agenda'}]});
  editor.hass = hass;
  const section = openSection(editor.shadowRoot, 'Als Bubble-Popup verwenden');
  const title=inputField(section,'Popup-Titel');title.value='Mein Popup';title.onchange();
  const width=inputField(section,'Breite am Desktop (optional)');width.value='900px';width.onchange();
  const output = inputField(section,'Button zum Öffnen (YAML)');
  assert.match(output.value, /fire-dom-event/);
  assert.match(output.value, /card_library/);
  assert.match(output.value, /calendar/);
  assert.match(output.value, /agenda/);
  assert.match(output.value, /900px/);
  assert.match(output.value, /Mein Popup/);
  assert.equal(output.readOnly, true);
});

test('insertion shows the saved native popup hash and normal button separately from local settings', () => {
  const state = library();
  state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#Menu',cards:[{type:'markdown',content:'Central'}]};
  const {hass} = setup(state);
  const editor = document.createElement('library-card-editor');
  editor.setConfig({template:'calendar',overrides:[{path:['hash'],value:'#local-draft'},{path:['cards',0,'content'],value:'Local'}]});
  editor.hass = hass;
  const section = openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  const central = nodes(section).find(node=>tag(node)==='fieldset'&&node.children.some(child=>child.textContent==='Zentralen Popup-Hash verwenden'));
  assert.ok(central);
  const hash = nodes(central).find(node=>tag(node)==='input');
  assert.equal(hash.value,'#Menu'); assert.equal(hash.readOnly,true);
  const output = nodes(central).find(node=>tag(node)==='textarea');
  assert.match(output.value,/navigate/); assert.match(output.value,/#Menu/);
  assert.doesNotMatch(output.value,/fire-dom-event|local-draft|Local|overrides/);
  assert.ok(nodes(central).some(node=>String(node.textContent||'').includes('Örtliche Anpassungen')));
});

test('insertion uses the effective metadata hash and follows central route changes', () => {
  const state = library();
  state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[]};
  state.templates.calendar.popup = {hash:'#assigned',options:{name:'Central title'}};
  const {hass,push} = setup(state);
  const editor = document.createElement('library-card-editor'); editor.setConfig({template:'calendar'}); editor.hass = hass;
  let section = openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  let central = nodes(section).find(node=>tag(node)==='fieldset'&&node.children.some(child=>child.textContent==='Zentralen Popup-Hash verwenden'));
  assert.ok(central); assert.match(nodes(central).find(node=>tag(node)==='textarea').value,/#assigned/);
  const next=structuredClone(state);next.revision++;delete next.templates.calendar.popup;next.templates.calendar.config.hash='#new-native';push(next);
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  central=nodes(section).find(node=>tag(node)==='fieldset'&&node.children.some(child=>child.textContent==='Zentralen Popup-Hash verwenden'));
  const output=nodes(central).find(node=>tag(node)==='textarea');assert.match(output.value,/#new-native/);assert.doesNotMatch(output.value,/#assigned/);
});

test('popup button output refreshes after native local edits without rebuilding that editor', async () => {
  const {hass} = setup();
  const editor = document.createElement('library-card-editor');editor.setConfig({template:'calendar',overrides:[]});editor.hass=hass;
  const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();
  const native=editor.editor;assert.ok(native);
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,layout:'agenda'}},stopPropagation(){}}));
  assert.equal(editor.editor,native);
  const output=nodes(section).find(node=>tag(node)==='textarea'&&String(node.value).includes('fire-dom-event'));
  assert.ok(output);assert.match(output.value,/agenda/);
});

test('popup options show inherited native values and clearing a local value restores inheritance', () => {
  const state=library();state.templates.calendar.config={type:'custom:bubble-card',card_type:'pop-up',hash:'#Menu',name:'Menü',width_desktop:'800px',cards:[]};
  const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  const title=inputField(section,'Popup-Titel'),width=inputField(section,'Breite am Desktop (optional)');
  assert.equal(title.value,'Menü');assert.equal(width.value,'800px');assert.deepEqual(editor.bubbleOptions,{});
  title.value='Wohnzimmer';title.onchange();assert.equal(editor.bubbleOptions.name,'Wohnzimmer');
  title.value='';title.onchange();assert.equal(title.value,'Menü');assert.deepEqual(editor.bubbleOptions,{});
  const output=inputField(section,'Button zum Öffnen (YAML)');assert.match(output.value,/Menü/);assert.doesNotMatch(output.value,/Wohnzimmer/);
});

test('two own hashes can be saved for one template with separate local overrides', async () => {
  const state=library();state.templates.calendar.config={type:'custom:bubble-card',card_type:'pop-up',hash:'#Menu',name:'Menü',cards:[{type:'markdown',content:'Central'}]};
  const {hass,saved}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar',overrides:[{path:['cards',0,'content'],value:'Wohnzimmer'}]});editor.hass=hass;
  let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  let hash=inputField(section,'Eigener Popup-Hash');hash.value='#Menu-Wohnzimmer';hash.oninput();
  let title=inputField(section,'Popup-Titel');title.value='Menü Wohnzimmer';title.onchange();
  await find(section,'Verknüpfung speichern').click();
  assert.equal(saved.length,1);let first=saved[0].library.templates.calendar.popup_links[0];
  assert.deepEqual(first,{hash:'#Menu-Wohnzimmer',overrides:[{path:['cards',0,'content'],value:'Wohnzimmer'}],options:{name:'Menü Wohnzimmer'}});
  assert.equal(saved[0].library.templates.calendar.config.hash,'#Menu');
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  assert.match(inputField(section,'Hash-Button (YAML)').value,/#Menu-Wohnzimmer/);
  const selection=inputField(section,'Popup-Verknüpfung');selection.value='';selection.onchange();
  editor.setConfig({template:'calendar',overrides:[{path:['cards',0,'content'],value:'Flur'}]});
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');hash=inputField(section,'Eigener Popup-Hash');hash.value='#Menu-Flur';hash.oninput();
  title=inputField(section,'Popup-Titel');title.value='Menü Flur';title.onchange();await find(section,'Verknüpfung speichern').click();
  assert.equal(saved.length,2);const links=saved[1].library.templates.calendar.popup_links;assert.equal(links.length,2);assert.deepEqual(links[0],first);
  assert.deepEqual(links[1].overrides,[{path:['cards',0,'content'],value:'Flur'}]);assert.equal(links[1].hash,'#Menu-Flur');
  assert.match(inputField(openSection(editor.shadowRoot,'Als Bubble-Popup verwenden'),'Hash-Button (YAML)').value,/#Menu-Flur/);
});

test('saved hash output waits for current local edits to be saved and uses current overrides', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#local',overrides:[{path:['layout'],value:'agenda'}]}];
  const {hass,saved}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');let selection=inputField(section,'Popup-Verknüpfung');selection.value='#local';selection.onchange();
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');assert.equal(editor.config.overrides[0].value,'agenda');assert.match(inputField(section,'Hash-Button (YAML)').value,/#local/);
  openSection(editor.shadowRoot,'Örtliche Anpassungen');await settle();const native=editor.editor;
  native.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...native.config,layout:'week'}},stopPropagation(){}}));
  assert.equal(editor.editor,native);assert.equal(inputField(section,'Hash-Button (YAML)').value,'');
  assert.match(inputField(section,'Button zum Öffnen (YAML)').value,/week/);
  await find(section,'Verknüpfung speichern').click();assert.equal(saved[0].library.templates.calendar.popup_links[0].overrides[0].value,'week');
});

test('removing an unused alias keeps its template and other routes', async () => {
  const state=library();state.templates.calendar.popup={hash:'#central'};state.templates.calendar.popup_links=[{hash:'#one'},{hash:'#two'}];
  const {hass,saved}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const selection=inputField(section,'Popup-Verknüpfung');selection.value='#one';selection.onchange();
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');await find(section,'Verknüpfung entfernen').click();
  assert.equal(saved.length,1);assert.deepEqual(saved[0].library.templates.calendar.popup_links,[{hash:'#two'}]);assert.equal(saved[0].library.templates.calendar.popup.hash,'#central');
});

test('an alias used by a dashboard button cannot be removed or renamed', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#used'}];
  const {hass,saved}=setup(state,[{type:'button',tap_action:{action:'navigate',navigation_path:'#used'}}]);
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const selection=inputField(section,'Popup-Verknüpfung');selection.value='#used';selection.onchange();section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  await find(section,'Verknüpfung entfernen').click();assert.equal(saved.length,0);assert.ok(nodes(section).some(node=>String(node.textContent||'').includes('Dashboard-Buttons')));
  const hash=inputField(section,'Eigener Popup-Hash');hash.value='#renamed';hash.oninput();await find(section,'Verknüpfung speichern').click();assert.equal(saved.length,0);
});

test('nonadmins can use saved aliases but cannot save library links', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#one'}];const {hass,saved}=setup(state);hass.user={is_admin:false};
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const hash=inputField(section,'Eigener Popup-Hash');hash.value='#forbidden';hash.oninput();
  const save=find(section,'Verknüpfung speichern');assert.equal(save.disabled,true);await save.click();assert.equal(saved.length,0);
});

test('alias save from an old HA connection cannot overwrite the new library', async () => {
  const {hass}=setup();let finish;hass.callWS=()=>new Promise(resolve=>finish=resolve);
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const hash=inputField(section,'Eigener Popup-Hash');hash.value='#old';hash.oninput();const pending=find(section,'Verknüpfung speichern').click();
  const next=library();next.revision=10;next.templates.calendar.name='New connection';const {hass:newHass}=setup(next);editor.hass=newHass;
  finish({...library(),revision:1,templates:{...library().templates,calendar:{...library().templates.calendar,popup_links:[{hash:'#old'}]}}});await pending;
  assert.equal(editor.state.library.revision,10);assert.equal(editor.state.library.templates.calendar.popup_links,undefined);
});

test('duplicate aliases and conflicting central bindings are rejected before saving', async () => {
  const state=library();state.templates.calendar.popup={hash:'#central'};state.templates.calendar.bindings=[{path:['color'],person:'anna',field:'color'}];
  const {hass,saved}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;
  const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const hash=inputField(section,'Eigener Popup-Hash');hash.value='#central';hash.oninput();await find(section,'Verknüpfung speichern').click();assert.equal(saved.length,0);
  hash.value='#different';hash.oninput();editor.config.overrides=[{path:['color'],value:'#112233'}];await find(section,'Verknüpfung speichern').click();assert.equal(saved.length,0);
});

test('duplicating a template never copies its alias hashes', () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#only-original'}];const {manager}=setup(state);manager.selected='calendar';manager.render();find(manager.shadowRoot,'Vorlage duplizieren').click();assert.equal(manager.draft.templates[manager.selected].popup_links,undefined);assert.equal(manager.draft.templates.calendar.popup_links[0].hash,'#only-original');
});

test('alias selection in central management retains every saved local override', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#local',overrides:[{path:['layout'],value:'agenda'}],options:{name:'Alias'}}];
  const {manager,saved}=setup(state);manager.selected='calendar';manager.render();let section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');
  const selection=inputField(section,'Popup-Verknüpfung');selection.value='#local';selection.onchange();section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');
  assert.match(inputField(section,'Hash-Button (YAML)').value,/#local/);await find(section,'Verknüpfung speichern').click();
  assert.deepEqual(manager.draft.templates.calendar.popup_links,state.templates.calendar.popup_links);assert.equal(saved.length,0);assert.equal(manager.dirty,true);
});

test('alias edits cannot replace central changes made while dashboard checks are pending', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#old'}];const {manager,hass,saved}=setup(state);manager.selected='calendar';manager.render();
  let section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');const selection=inputField(section,'Popup-Verknüpfung');selection.value='#old';selection.onchange();section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');
  const hash=inputField(section,'Eigener Popup-Hash');hash.value='#renamed';hash.oninput();
  const callWS=hass.callWS;let finish;hass.callWS=msg=>msg.type==='lovelace/config'?new Promise(resolve=>finish=resolve):callWS(msg);
  const pending=find(section,'Verknüpfung speichern').click();await settle();assert.ok(finish);
  manager.draft.templates.calendar.config.layout='changed-while-scan';manager.edit();finish({views:[]});await pending;
  assert.equal(manager.draft.templates.calendar.config.layout,'changed-while-scan');assert.deepEqual(manager.draft.templates.calendar.popup_links,[{hash:'#old'}]);assert.equal(saved.length,0);
  assert.ok(nodes(section).some(node=>String(node.textContent||'').includes('inzwischen geändert')));
});

test('a dirty manager shows the current saved hash separately from its central draft', () => {
  const state=library();state.templates.calendar.popup={hash:'#saved'};const {manager,push}=setup(state);manager.selected='calendar';manager.render();let section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');
  manager.draft.templates.calendar.popup.hash='#draft';manager.edit();
  assert.match(inputField(section,'Popup-Button (YAML)').value,/#saved/);assert.doesNotMatch(inputField(section,'Popup-Button (YAML)').value,/#draft/);
  const next=structuredClone(state);next.revision++;next.templates.calendar.popup.hash='#external';push(next);
  assert.match(inputField(section,'Popup-Button (YAML)').value,/#external/);assert.equal(manager.draft.templates.calendar.popup.hash,'#draft');assert.match(manager.conflictNode.textContent,/geändert/);
});

test('switching templates clears alias metadata and popup option exceptions', () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#first',options:{name:'First local',width_desktop:'950px'}}];state.templates.other={name:'Other',config:{type:'markdown',content:'Other'}};
  const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');const selection=inputField(section,'Popup-Verknüpfung');selection.value='#first';selection.onchange();
  editor.setConfig({template:'other'});section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');assert.equal(inputField(section,'Eigener Popup-Hash').value,'');assert.equal(inputField(section,'Popup-Titel').value,'');assert.equal(inputField(section,'Breite am Desktop (optional)').value,'');assert.deepEqual(editor.bubbleOptions,{});
  assert.doesNotMatch(inputField(section,'Button zum Öffnen (YAML)').value,/#first|calendar|First local|950px/);
});

test('direct popup actions contain only local options so central defaults stay live', () => {
  const state=library();state.templates.calendar.popup={hash:'#central',options:{name:'Central title',width_desktop:'900px'}};
  const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;const section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');
  assert.equal(inputField(section,'Popup-Titel').value,'Central title');assert.equal(inputField(section,'Breite am Desktop (optional)').value,'900px');
  const output=inputField(section,'Button zum Öffnen (YAML)').value;assert.match(output,/"popup": \{\}/);assert.doesNotMatch(output,/900px/);
});

test('switching templates during an alias save releases controls on the new template', async () => {
  const state=library();state.templates.other={name:'Other',config:{type:'markdown',content:'Other'}};const {hass}=setup(state);let finish,message;hass.callWS=msg=>{message=msg;return new Promise(resolve=>finish=resolve);};
  const editor=document.createElement('library-card-editor');editor.setConfig({template:'calendar'});editor.hass=hass;let section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');let hash=inputField(section,'Eigener Popup-Hash');hash.value='#first';hash.oninput();const pending=find(section,'Verknüpfung speichern').click();
  editor.setConfig({template:'other'});section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');hash=inputField(section,'Eigener Popup-Hash');hash.value='#second';hash.oninput();assert.equal(find(section,'Verknüpfung speichern').disabled,true);
  finish({...message.library,revision:message.revision+1});await pending;
  section=openSection(editor.shadowRoot,'Als Bubble-Popup verwenden');assert.equal(inputField(section,'Eigener Popup-Hash').value,'#second');assert.equal(find(section,'Verknüpfung speichern').disabled,false);assert.equal(find(section,'Bubble-Popup testen').disabled,false);assert.equal(editor.config.template,'other');
});

test('a manager selection change during alias checks keeps the current native editor bound to the new draft', async () => {
  const state=library();state.templates.calendar.popup_links=[{hash:'#old'}];state.templates.other={name:'Other',config:{type:'custom:calendar',layout:'month'}};const {manager,hass}=setup(state);manager.selected='calendar';manager.render();let section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');
  const selection=inputField(section,'Popup-Verknüpfung');selection.value='#old';selection.onchange();section=openSection(manager.shadowRoot,'Als Bubble-Popup verwenden');const hash=inputField(section,'Eigener Popup-Hash');hash.value='#renamed';hash.oninput();
  const callWS=hass.callWS;let finish;hass.callWS=msg=>msg.type==='lovelace/config'?new Promise(resolve=>finish=resolve):callWS(msg);const pending=find(section,'Verknüpfung speichern').click();await settle();
  manager.selected='other';manager.render();await settle();finish({views:[]});await pending;await settle();
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...manager.editor.config,layout:'after-alias-rename'}},stopPropagation(){}}));
  assert.equal(manager.draft.templates.other.config.layout,'after-alias-rename');assert.equal(manager.draft.templates.calendar.popup_links[0].hash,'#renamed');
});

test('central popup hash UI stores and removes the route with the template', async () => {
  const {manager,saved} = setup(); manager.selected = 'calendar'; manager.render();
  const section = openSection(manager.shadowRoot, 'Popup über #Hash öffnen');
  const inputs = nodes(section).filter(n => tag(n) === 'input');
  inputs[0].value = '#kalender'; inputs[0].onchange();
  inputs[1].value = 'Familie'; inputs[1].onchange();
  inputs[2].value = '900px'; inputs[2].onchange();
  await manager.save();
  assert.deepEqual(saved[0].library.templates.calendar.popup, {hash:'#kalender', options:{name:'Familie',width_desktop:'900px'}});
  const next = openSection(manager.shadowRoot, 'Popup über #Hash öffnen');
  const hash = nodes(next).find(n => tag(n) === 'input'); hash.value = ''; hash.onchange();
  await manager.save(); assert.equal(saved[1].library.templates.calendar.popup, undefined);
});
test('central popup hash UI rejects an existing hash without overwriting a route', () => {
  const lib = library(); lib.templates.other = {name:'Andere',config:{type:'markdown',content:'x'},popup:{hash:'#kalender'}};
  const {manager} = setup(lib); manager.selected = 'calendar'; manager.render();
  const section = openSection(manager.shadowRoot, 'Popup über #Hash öffnen');
  const hash = nodes(section).find(n => tag(n) === 'input'); hash.value = '#kalender'; hash.onchange();
  assert.equal(manager.draft.templates.calendar.popup, undefined);
  assert.ok(nodes(section).some(n => String(n.textContent || '').includes('bereits')));
});

test('duplicating a template does not copy its unique popup hash', () => {
  const lib = library(); lib.templates.calendar.popup = {hash:'#kalender', options:{name:'Familie'}};
  const {manager} = setup(lib); manager.selected = 'calendar'; manager.render();
  find(manager.shadowRoot, 'Vorlage duplizieren').click();
  assert.notEqual(manager.selected, 'calendar');
  assert.equal(manager.draft.templates[manager.selected].popup, undefined);
  assert.equal(manager.draft.templates.calendar.popup.hash, '#kalender');
});
test('native popup management provides only a hash button and retains the original editor', async () => {
  const state = library(); state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#native',name:'Saved popup',cards:[{type:'markdown',content:'Saved'}]};
  const {manager} = setup(state); manager.selected = 'calendar'; manager.render(); await settle();
  assert.equal(manager.editor.config.type,'custom:bubble-card');
  assert.equal(manager.editor.config.card_type,'pop-up');
  const section = openSection(manager.shadowRoot,'Popup über #Hash öffnen');
  const output = nodes(section).find(node=>tag(node)==='textarea');
  assert.match(output.value, /navigate/); assert.match(output.value, /#native/);
  assert.doesNotMatch(output.value,/custom:library-card|fire-dom-event/);
  assert.ok(!nodes(manager.shadowRoot).some(node=>node.textContent==='Dashboard-Referenz'));
  manager.editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...manager.editor.config,hash:'#edited'}},stopPropagation(){}}));
  assert.match(output.value,/#edited/); assert.doesNotMatch(output.value,/#native/);
});
test('duplicating a native popup keeps central bindings and gives the copy a unique hash', async () => {
  const state = library(); state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[{type:'markdown',content:'Saved',color:'#aa3344'}]};
  state.templates.calendar.bindings = [{path:['cards',0,'color'],person:'anna',field:'color'}];
  const {manager,saved} = setup(state); manager.selected = 'calendar'; manager.render();
  find(manager.shadowRoot,'Vorlage duplizieren').click();
  const copy = manager.draft.templates[manager.selected];
  assert.match(copy.popup.hash,/^#popup-/); assert.notEqual(copy.popup.hash,'#native');
  assert.deepEqual(copy.bindings,state.templates.calendar.bindings);
  await manager.save(); assert.equal(saved.length,1);
  assert.equal(saved[0].library.templates.calendar.config.hash,'#native');
});
test('popup content references remove only the native frame and follow central edits', async () => {
  const state = library(); state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[{type:'markdown',content:'Saved'}]};
  const {hass,push} = setup(state); const card = document.createElement('library-card');
  card.setConfig({type:'custom:library-card',template:'calendar',popup_content:true}); card.hass = hass; await settle();
  assert.deepEqual(card.child.config,{type:'vertical-stack',cards:[{type:'markdown',content:'Saved'}]});
  const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards[0].content = 'Updated'; push(next); await settle();
  assert.equal(card.child.config.cards[0].content,'Updated');
  assert.equal(state.templates.calendar.config.card_type,'pop-up');
});
test('deleting a native popup used only by a hash button is blocked', async () => {
  const state = library(); state.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[{type:'markdown',content:'Saved'}]};
  const {manager} = setup(state,[{type:'button',tap_action:{action:'navigate',navigation_path:'#native'}}]);
  await manager.deleteItem('templates','calendar');
  assert.ok(manager.draft.templates.calendar); assert.match(manager.notice,/verwendet/);
});

test('removed library card does not finish an asynchronous child creation', async () => {
  const {hass} = setup();
  const original = window.loadCardHelpers; let resolve;
  window.loadCardHelpers = () => new Promise(done => {resolve = done;});
  try {
    const card = document.createElement('library-card'); card.setConfig({template:'calendar'}); card.hass = hass;
    card.disconnectedCallback();
    resolve({createCardElement:() => new NativeCard()}); await settle();
    assert.equal(card.child, undefined);
  } finally { window.loadCardHelpers = original; }
});
test('editing an old popup option after deleting its route cannot recreate or crash the route', () => {
  const lib = library(); lib.templates.calendar.popup = {hash:'#kalender', options:{styles:'old-style'}};
  const {manager} = setup(lib); manager.selected = 'calendar'; manager.render();
  const section = openSection(manager.shadowRoot, 'Popup über #Hash öffnen');
  const extra = openSection(section, 'Weitere originale Bubble-Einstellungen');
  const style = nodes(extra).find(n => tag(n) === 'input' && n.value === 'old-style');
  const hash = nodes(section).find(n => tag(n) === 'input'); hash.value = ''; hash.onchange();
  style.value = 'new-style'; assert.doesNotThrow(() => style.onchange());
  assert.equal(manager.draft.templates.calendar.popup, undefined);
});

test('removed footer cancels native child loading and resumes when reconnected', async () => {
  const original = window.loadCardHelpers; const pending = [];
  window.loadCardHelpers = () => new Promise(resolve => pending.push(resolve));
  try {
    const footer = document.createElement('library-container-card');
    footer.setConfig({type:'custom:library-container-card',card:{type:'markdown',content:'Footer'}});
    footer.hass = {states:{}};
    footer.disconnectedCallback();
    let creations = 0;
    const helpers = {createCardElement:config => {creations++;const card = new NativeCard();card.config = config;return card;}};
    pending.shift()(helpers); await settle();
    assert.equal(creations, 0); assert.equal(footer.child, undefined);
    footer.connectedCallback(); pending.shift()(helpers); await settle();
    assert.equal(creations, 1); assert.equal(footer.child.config.content, 'Footer');
  } finally { window.loadCardHelpers = original; }
});

test('central native editor immediately restores attempted protected values in its visible form', async () => {
  const state = library(); state.templates.calendar.bindings = [{path:['color'],person:'anna',field:'color'}];
  const {manager} = setup(state); manager.selected = 'calendar'; manager.render(); await settle();
  const native = manager.editor; const edited = {...native.config,color:'#ffffff'};
  native.config = edited;
  native.dispatchEvent({type:'config-changed',detail:{config:edited},stopPropagation(){}});
  assert.equal(native.config.color, '#aa3344');
  assert.equal(Boolean(manager.dirty), false);
  let updates = 0; native.setConfig = config => {updates++;native.config = config;};
  const title = {...native.config,title:'Typing'}; native.config = title;
  native.dispatchEvent({type:'config-changed',detail:{config:title},stopPropagation(){}});
  assert.equal(updates, 0); assert.equal(manager.draft.templates.calendar.config.title, 'Typing');
});

test('local native editor immediately restores protected values while preserving allowed changes', async () => {
  const state = library(); state.templates.calendar.bindings = [{path:['color'],person:'anna',field:'color'}];
  const {hass} = setup(state); const wrapper = document.createElement('library-card-editor');
  wrapper.setConfig({template:'calendar'}); wrapper.hass = hass;
  openSection(wrapper.shadowRoot, 'Örtliche Anpassungen'); await settle();
  const native = wrapper.editor; const edited = {...native.config,color:'#ffffff',layout:'agenda'};
  native.config = edited;
  native.dispatchEvent({type:'config-changed',detail:{config:edited},stopPropagation(){}});
  assert.equal(native.config.color, '#aa3344'); assert.equal(native.config.layout, 'agenda');
  assert.deepEqual(wrapper.config.overrides, [{path:['layout'],value:'agenda'}]);
  assert.equal(state.templates.calendar.config.layout, 'month');
});

for (const local of [false,true]) test(local
  ? 'local edits survive a native-editor failure while restoring protected values'
  : 'central edits survive a native-editor failure while restoring protected values', async () => {
  const state = library(); state.templates.calendar.bindings = [{path:['color'],person:'anna',field:'color'}];
  const {manager,hass} = setup(state);
  const owner = local ? document.createElement('library-card-editor') : manager;
  if (local) {owner.setConfig({template:'calendar'});owner.hass = hass;openSection(owner.shadowRoot,'Örtliche Anpassungen');}
  else {owner.selected = 'calendar';owner.render();}
  await settle(); const native = owner.editor;
  const edited = {...native.config,color:'#ffffff',layout:'agenda'};
  native.setConfig = () => {throw Error('editor rejected resynchronization');};
  native.dispatchEvent({type:'config-changed',detail:{config:edited},stopPropagation(){}});
  if (local) assert.deepEqual(owner.config.overrides,[{path:['layout'],value:'agenda'}]);
  else {assert.equal(owner.draft.templates.calendar.config.layout,'agenda');assert.equal(owner.dirty,true);}
  await settle(); assert.notEqual(owner.editor,native);
  assert.equal(owner.editor.config.color,'#aa3344'); assert.equal(owner.editor.config.layout,'agenda');
});

for (const local of [false,true]) test(local
  ? 'oversized alias payloads from local native editors leave the current settings intact'
  : 'oversized alias payloads from central native editors leave the draft intact', async () => {
  const {manager,hass} = setup();
  const owner = local ? document.createElement('library-card-editor') : manager;
  if (local) {owner.setConfig({template:'calendar'});owner.hass = hass;openSection(owner.shadowRoot,'Örtliche Anpassungen');}
  else {owner.selected = 'calendar';owner.render();}
  await settle(); const native = owner.editor;
  let aliases = 'x'.repeat(32); for (let depth = 0; depth < 16; depth++) aliases = [aliases,aliases];
  native.dispatchEvent({type:'config-changed',detail:{config:{...native.config,aliases}},stopPropagation(){}});
  assert.equal(owner.editor,native);
  if (local) assert.equal(owner.config.overrides,undefined);
  else assert.equal(Boolean(owner.dirty),false);
  assert.ok(nodes(owner.shadowRoot).some(node => /2 MB/.test(node.textContent || '')));
});

test('delayed save reply cannot replace a newer authoritative library snapshot', async () => {
  const {manager,hass,push} = setup(); manager.draft.templates.calendar.name = 'Saved'; manager.edit();
  const original = hass.callWS;
  hass.callWS = async message => {
    if (message.type !== 'card_library/save') return original(message);
    const result = {...structuredClone(message.library),revision:1}; push(result);
    const newer = structuredClone(result); newer.revision = 2; newer.templates.calendar.name = 'Changed elsewhere'; push(newer);
    return result;
  };
  await manager.save();
  assert.equal(manager.draft.revision, 2);
  assert.equal(manager.draft.templates.calendar.name, 'Changed elsewhere');
  assert.equal(manager.dirty, false);
});

test('delayed restore reply cannot replace a newer authoritative library snapshot', async () => {
  const {manager,hass,push} = setup(); const baseline = structuredClone(manager.draft);
  manager.mode = 'history'; manager.history = [{revision:0,saved_at:new Date().toISOString(),library:baseline}];
  const original = hass.callWS;
  hass.callWS = async message => {
    if (message.type === 'card_library/history') return [];
    if (message.type !== 'card_library/restore') return original(message);
    const result = {...structuredClone(baseline),revision:1}; push(result);
    const newer = structuredClone(result); newer.revision = 2; newer.templates.calendar.name = 'Changed after restore'; push(newer);
    return result;
  };
  manager.render(); await find(manager.shadowRoot,'Diese Version wiederherstellen').click();
  assert.equal(manager.draft.revision, 2);
  assert.equal(manager.draft.templates.calendar.name, 'Changed after restore');
  assert.equal(manager.dirty, false); assert.equal(manager.busy, false);
});

test('save acknowledgements from the old HA connection retain the unconfirmed draft', async () => {
  const {manager,hass} = setup(); manager.draft.templates.calendar.name = 'Pending edit'; manager.edit();
  const original = hass.callWS; let resolve;
  hass.callWS = message => message.type === 'card_library/save' ? new Promise(done => {resolve = () => done({...message.library,revision:1});}) : original(message);
  const pending = manager.save(); await settle();
  const next = library(); next.templates.calendar.name = 'New connection';
  manager.hass = {...hass,connection:{subscribeMessage:async callback => {callback(next);return () => {};}}};
  resolve(); await pending;
  assert.equal(manager.state.library.templates.calendar.name,'New connection');
  assert.equal(manager.draft.templates.calendar.name,'Pending edit');
  assert.equal(manager.dirty,true); assert.match(manager.notice,/Verbindung/);
});

test('a retained draft cannot be saved into another connection until explicitly reloaded', async () => {
  const {manager,hass} = setup(); manager.draft.templates.calendar.name = 'Old draft'; manager.edit();
  const original = hass.callWS; let resolve;
  hass.callWS = message => message.type === 'card_library/save' ? new Promise(done => {resolve = () => done({...message.library,revision:1});}) : original(message);
  const pending = manager.save(); await settle(); let writes = 0;
  const next = library(); next.templates.calendar.name = 'New connection';
  manager.hass = {...hass,connection:{subscribeMessage:async callback => {callback(next);return () => {};}},callWS:async message => {
    if (message.type === 'card_library/save') {writes++;return {...message.library,revision:1};}
    return original(message);
  }};
  resolve(); await pending; await manager.save();
  assert.equal(writes,0); assert.equal(manager.dirty,true); assert.match(manager.conflictNode.textContent,/Verbindung/);
  find(manager.shadowRoot,'Entwurf verwerfen / neu laden').click();
  assert.equal(manager.draft.templates.calendar.name,'New connection');
  manager.draft.templates.calendar.name = 'New edit'; manager.edit(); await manager.save();
  assert.equal(writes,1); assert.equal(manager.dirty,false);
});

test('a connection change during deletion checks prevents sending the stale save', async () => {
  const {manager,hass} = setup(); manager.draft.templates = {}; manager.edit();
  const original = hass.callWS; let resolve, writes = 0;
  hass.callWS = message => {
    if (message.type === 'lovelace/dashboards/list') return new Promise(done => {resolve = done;});
    if (message.type === 'card_library/save') writes++;
    return original(message);
  };
  const pending = manager.save(); await settle();
  manager.hass = {...hass,connection:{subscribeMessage:async callback => {callback(library());return () => {};}}};
  resolve([]); await pending;
  assert.equal(writes,0); assert.equal(manager.dirty,true); assert.match(manager.notice,/Verbindung/);
});

test('restore acknowledgements from an old connection cannot overwrite the new library', async () => {
  const {manager,hass} = setup(); const baseline = structuredClone(manager.draft);
  manager.mode = 'history'; manager.history = [{revision:0,saved_at:new Date().toISOString(),library:baseline}];
  const original = hass.callWS; let resolve;
  hass.callWS = message => {
    if (message.type === 'card_library/restore') return new Promise(done => {resolve = () => done({...baseline,revision:1});});
    if (message.type === 'card_library/history') return Promise.resolve([]);
    return original(message);
  };
  manager.render(); const pending = find(manager.shadowRoot,'Diese Version wiederherstellen').click(); await settle();
  const next = library(); next.templates.calendar.name = 'New connection';
  manager.hass = {...hass,connection:{subscribeMessage:async callback => {callback(next);return () => {};}}};
  resolve(); await pending;
  assert.equal(manager.draft.templates.calendar.name,'New connection');
  assert.equal(manager.draft.revision,0); assert.equal(manager.busy,false); assert.match(manager.notice,/Verbindung/);
});

test('template deletion and imported removal protect explicit popup actions', async () => {
  const action = {type:'button',tap_action:{action:'fire-dom-event',card_library:{action:'popup',template:'calendar'}}};
  const {manager,saved} = setup(library(), [action]);
  await manager.deleteItem('templates', 'calendar');
  assert.ok(manager.draft.templates.calendar); assert.match(manager.notice, /wird in Dashboards verwendet/);
  manager.draft.templates = {}; manager.edit(); await manager.save();
  assert.equal(saved.length, 0); assert.match(manager.notice, /Verwendete Vorlagen/);
});

test('template deletion protects saved popup hash even after its draft route was changed', async () => {
  const state = library(); state.templates.calendar.popup = {hash:'#kalender'};
  const {manager,saved} = setup(state, [{type:'button',tap_action:{action:'navigate',navigation_path:'#kalender'}}]);
  manager.draft.templates.calendar.popup.hash = '#unpublished'; manager.edit();
  await manager.deleteItem('templates', 'calendar');
  assert.ok(manager.draft.templates.calendar); assert.match(manager.notice, /wird in Dashboards verwendet/);
  manager.draft.templates = {}; await manager.save();
  assert.equal(saved.length, 0); assert.match(manager.notice, /Verwendete Vorlagen/);
});

test('native local editors can reorder unprotected keys without resynchronizing while typing', async () => {
  const {hass} = setup(); const wrapper = document.createElement('library-card-editor');
  wrapper.setConfig({template:'calendar'}); wrapper.hass = hass;
  openSection(wrapper.shadowRoot, 'Örtliche Anpassungen'); await settle();
  const native = wrapper.editor; let updates = 0;
  native.setConfig = config => {updates++;native.config = config;};
  const edited = {title:'Typing',color:'#001122',layout:'month',type:'custom:calendar'};
  native.dispatchEvent({type:'config-changed',detail:{config:edited},stopPropagation(){}});
  assert.equal(updates, 0); assert.deepEqual(wrapper.config.overrides, [{path:['title'],value:'Typing'}]);
});

test('card-mod uses original HA hosts for references footer children and library previews', async () => {
  let loads = 0;
  class OriginalHost extends Element {
    constructor() {super('hui-card');}
    set config(value) {this._config = value;if(this.native)this.native.config = value;}
    get config() {return this._config;}
    set hass(value) {this._hass = value;if(this.native)this.native.hass = value;}
    get hass() {return this._hass;}
    load() {loads++;this.native = new NativeCard();this.native.config = this.config;this.native.hass = this.hass;this.native.appliedCardMod = this.config.card_mod;this.native.getCardSize = () => 0;this.replaceChildren(this.native);}
    getCardSize() {return this.native.getCardSize();}
    getGridOptions() {return {columns:6,rows:2};}
  }
  registry.set('hui-card', OriginalHost);
  try {
    const state = library(); state.templates.calendar.config.card_mod = {style:'ha-card {color:red;}'};
    const {manager,hass,push} = setup(state);
    const wrapper = document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass = hass;await settle();
    const host = wrapper.child, native = host.native;
    assert.equal(tag(host), 'hui-card');assert.deepEqual(native.appliedCardMod, state.templates.calendar.config.card_mod);
    assert.equal(wrapper.getCardSize(), 0);assert.deepEqual(wrapper.getGridOptions(), {columns:6,rows:2});
    const changed = structuredClone(state);changed.templates.calendar.config.layout = 'agenda';push(changed);await settle();
    assert.equal(wrapper.child, host);assert.equal(host.native, native);assert.equal(native.config.layout, 'agenda');
    const latestHass = {...hass,states:{changed:{state:'on'}}};wrapper.hass = latestHass;assert.equal(native.hass, latestHass);
    const footer = document.createElement('library-container-card');footer.setConfig({type:'custom:library-container-card',card:state.templates.calendar.config});footer.hass = hass;await settle();
    assert.equal(tag(footer.child), 'hui-card');assert.equal(footer.getCardSize(), 0);
    const preview = new Element('div');await manager.previewCard(preview, state, 'calendar');
    assert.equal(tag(preview.previewChild), 'hui-card');assert.equal(loads, 3);
  } finally {registry.delete('hui-card');}
});

test('native-host construction falls back to the existing factory on older HA hosts', async () => {
  const {createRenderedCard} = await import('../custom_components/card_library/frontend/library-ha-ui.js');
  const config = {type:'markdown',content:'Test',card_mod:{style:'ha-card {color:red;}'}};
  let calls = 0;const native = new NativeCard();
  const helpers = {createCardElement(value) {calls++;native.config = value;return native;}};
  const rendered = createRenderedCard(helpers, config, {states:{}}, {customElements:{get:() => true},document:{createElement:() => new Element('hui-card')}});
  assert.equal(rendered.element, native);assert.equal(rendered.native, native);assert.equal(calls, 1);
  native.config.content = 'Mutated';assert.equal(config.content, 'Test');
});

test('late rebuilds from loaded cards cannot restart removed references or footers', async () => {
  const {hass} = setup();
  const wrapper = document.createElement('library-card');wrapper.setConfig({template:'calendar'});wrapper.hass = hass;
  const footer = document.createElement('library-container-card');footer.setConfig({type:'custom:library-container-card',card:{type:'markdown',content:'Footer'}});footer.hass = hass;
  await settle();
  const original = window.loadCardHelpers;let calls = 0;
  window.loadCardHelpers = async () => {calls++;return original();};
  try {
    for (const owner of [wrapper,footer]) {
      const child = owner.child;owner.disconnectedCallback();
      child.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});
      child.hass = 'Unchanged';child.dispatchEvent({type:'ll-upgrade',target:child,stopPropagation(){}});
      await owner.render();
      assert.equal(owner.child, child);assert.equal(child.hass, 'Unchanged');
      owner.connectedCallback();await settle();assert.equal(child.hass, hass);
    }
    assert.equal(calls, 0);
  } finally {window.loadCardHelpers = original;}
});

test('button-card parameters stay local while design and other variables remain inherited',async()=>{
  const state=library();state.templates.shutter={name:'Rollladen',config:{type:'custom:button-card',variables:{entity_cover:'',entity_modus:'',friendly_name:'Fenster',nav_anchor:'rolllade_info'},entity:'[[[ return variables.entity_cover; ]]]',styles:{card:[{padding:'12px'}]}},bindings:[]};
  const {hass,push}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'shutter'});editor.hass=hass;
  const cover=inputField(editor.shadowRoot,'Rollladen');cover.value='cover.kueche';cover.onchange();
  const name=inputField(editor.shadowRoot,'Anzeigename');name.value='Küche';name.onchange();
  assert.deepEqual(editor.config.overrides,[{path:['variables','entity_cover'],value:'cover.kueche'},{path:['variables','friendly_name'],value:'Küche'}]);
  assert.equal(editor.state.library.templates.shutter.config.variables.entity_cover,'');
  const changed=structuredClone(state);changed.revision=1;changed.templates.shutter.config.styles.card=[{padding:'20px'}];changed.templates.shutter.config.variables.nav_anchor='new-menu';push(changed);
  const {resolveTemplate}=await import('../custom_components/card_library/frontend/library-core.js');
  const result=resolveTemplate(editor.state.library,'shutter',editor.config.overrides);assert.equal(result.variables.entity_cover,'cover.kueche');assert.equal(result.variables.nav_anchor,'new-menu');assert.equal(result.styles.card[0].padding,'20px');
  const input=inputField(editor.shadowRoot,'Rollladen');const row=input.libraryParent.libraryParent;find(row,'Wert aus Vorlage übernehmen').click();
  assert.equal(resolveTemplate(editor.state.library,'shutter',editor.config.overrides).variables.entity_cover,'');assert.equal(resolveTemplate(editor.state.library,'shutter',editor.config.overrides).variables.friendly_name,'Küche');
});

test('button-card entity picker writes one local override and follows current hass',()=>{
  class Picker extends Element {constructor(){super('ha-entity-picker');}}
  registry.set('ha-entity-picker',Picker);
  try {
    const state=library();state.templates.shutter={name:'Shutter',config:{type:'custom:button-card',variables:{entity_cover:''}},bindings:[]};
    const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'shutter'});editor.hass=hass;
    const picker=nodes(editor.shadowRoot).find(n=>n.tagName==='ha-entity-picker');assert.deepEqual(picker.includeDomains,['cover']);
    picker.dispatchEvent({type:'value-changed',target:picker,detail:{value:'cover.flur'},stopPropagation(){}});
    assert.deepEqual(editor.config.overrides,[{path:['variables','entity_cover'],value:'cover.flur'}]);
    const updated={...hass,states:{'cover.flur':{state:'open'}}};editor.hass=updated;assert.equal(picker.hass,updated);
  } finally {registry.delete('ha-entity-picker');}
});

test('button-card batch YAML import creates named drafts and preserves existing templates',async()=>{
  const {manager,hass,saved}=setup();const original=hass.callWS;hass.callWS=async message=>message.type==='card_library/parse_templates' ? [{name:'base',config:{type:'custom:button-card'},bindings:[]},{name:'rolladen_karte',config:{type:'custom:button-card',variables:{entity_cover:''}},bindings:[]}] : original(message);
  manager.mode='yaml';manager.yamlDraft='button_card_templates:\n  base: {}\n  rolladen_karte: {}';manager.render();await find(manager.shadowRoot,'YAML als Karte übernehmen').click();
  assert.equal(Object.keys(manager.draft.templates).length,3);assert.equal(manager.draft.templates[manager.selected].name,'rolladen_karte');assert.equal(manager.dirty,true);assert.equal(saved.length,0);assert.ok(manager.draft.templates.calendar);
});

test('invalid button-card batch response cannot partially replace the library draft',async()=>{
  const {manager,hass}=setup();hass.callWS=async()=>[{name:'valid',config:{type:'custom:button-card'}},{name:'bad',config:{title:'Missing type'}}];
  manager.mode='yaml';manager.yamlDraft='button_card_templates:\n  a: {}';manager.render();const before=structuredClone(manager.draft);
  await find(manager.shadowRoot,'YAML als Karte übernehmen').click();assert.deepEqual(manager.draft,before);assert.equal(Boolean(manager.dirty),false);assert.match(manager.notice,/Kartentyp/);
});

test('usage overview lists counts, unused templates and dashboard links without modifying drafts',()=>{
  const state=library();state.templates.popup={name:'Menü',config:{type:'markdown',content:'Popup'},popup:{hash:'#Menu'},bindings:[]};
  const {manager}=setup(state);manager.inventory={scannedAt:new Date().toISOString(),failures:[],cards:[
    {dashboard:'Familie',view:'Wohnzimmer',view_path:'wohnzimmer',url_path:'dashboard-main',path:['views',0,'cards',0],config:{type:'custom:library-card',template:'calendar'}},
    {dashboard:'Familie',view:'Wohnzimmer',view_path:'wohnzimmer',url_path:'dashboard-main',path:['views',0,'cards',1],config:{type:'button',tap_action:{action:'navigate',navigation_path:'#Menu'}}}
  ]};manager.mode='usage';const before=structuredClone(manager.draft);manager.render();
  assert.ok(nodes(manager.shadowRoot).some(node=>node.textContent==='Kalender · 1 Fundstelle'));
  assert.ok(nodes(manager.shadowRoot).some(node=>node.textContent==='0 Kartenverknüpfungen · 1 Popup-Aufruf'));
  const links=nodes(manager.shadowRoot).filter(node=>tag(node)==='a');assert.ok(links.some(link=>link.href==='/dashboard-main/wohnzimmer'));assert.ok(links.some(link=>link.href==='/dashboard-main/wohnzimmer#Menu'));
  assert.deepEqual(manager.draft,before);find(manager.shadowRoot,'Vorlage bearbeiten').click();assert.equal(manager.mode,'templates');
});

test('usage overview shows unknown counts before scanning and incomplete-scan warning afterward',()=>{
  const {manager}=setup();manager.mode='usage';manager.render();assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent || '').includes('Noch nicht geprüft')));assert.ok(!nodes(manager.shadowRoot).some(node=>node.textContent==='Kalender · 0 Fundstellen'));
  manager.inventory={scannedAt:new Date().toISOString(),failures:['Privates Dashboard: Zugriff verweigert'],cards:[]};manager.render();
  assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent || '').includes('Prüfung unvollständig')));assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent || '').includes('Weitere Verwendungen sind möglich')));
});

test('usage overview automatically scans on selection and prevents old-connection inventories',async()=>{
  const {manager,hass}=setup();const selection=inputField(manager.shadowRoot,'Konfigurationsbereich');selection.value='usage';selection.onchange();await settle();
  assert.ok(manager.inventory);assert.equal(manager.mode,'usage');
  let complete;const original=hass.callWS;hass.callWS=message=>message.type==='lovelace/dashboards/list'?new Promise(resolve=>{complete=resolve;}):original(message);const pending=manager.scan();
  manager.hass={...hass,connection:{subscribeMessage:async()=>()=>{}},callWS:async()=>[]};assert.equal(manager.inventory,null);
  complete([]);await pending;assert.equal(manager.inventory,null);
});

test('category search filters templates and metadata fields persist in central drafts',()=>{
  const state=library();state.templates.calendar.category='Kalender';state.templates.light={name:'Licht',category:'Beleuchtung',config:{type:'button'},bindings:[]};
  const {manager}=setup(state);manager.templateSearch='Licht';manager.render();assert.deepEqual(manager.filteredTemplates().map(([id])=>id),['light']);manager.templateSearch='';manager.templateCategory='Kalender';assert.deepEqual(manager.filteredTemplates().map(([id])=>id),['calendar']);
  manager.templateCategory=null;manager.selected='calendar';manager.render();inputField(manager.shadowRoot,'Kategorie').value='Familie';inputField(manager.shadowRoot,'Kategorie').onchange();assert.equal(manager.draft.templates.calendar.category,'Familie');assert.equal(manager.dirty,true);
});
test('defined required entity inputs create local exceptions while preserving design',async()=>{
  const state=library();state.templates.calendar.inputs=[{path:['entity'],label:'Kalenderentität',type:'entity',required:true,domains:['calendar']}];
  const {hass}=setup(state);const editor=document.createElement('library-card-editor');editor.setConfig({type:'custom:library-card',template:'calendar'});editor.hass=hass;
  const input=inputField(editor.shadowRoot,'Kalenderentität *');input.value='calendar.local';input.onchange();
  assert.deepEqual(editor.config.overrides,[{path:['entity'],value:'calendar.local'}]);assert.equal(editor.state.library.templates.calendar.config.entity,undefined);
  const card=document.createElement('library-card');card.setConfig({type:'custom:library-card',template:'calendar'});card.hass=hass;await settle();assert.equal(card.child,null);assert.ok(nodes(card.shadowRoot).some(node=>String(node.textContent).includes('Pflichtfeld fehlt')));
});
test('protected templates show read-only UI and require central unlock before editing',async()=>{
  const state=library();state.templates.calendar.protected=true;const {manager}=setup(state);manager.selected='calendar';manager.render();await settle();
  assert.equal(inputField(manager.shadowRoot,'Name der Vorlage').readOnly,true);assert.ok(!nodes(manager.shadowRoot).some(node=>node.textContent==='Zentrale Vorlage bearbeiten'));
  find(manager.shadowRoot,'Schutz aufheben').click();assert.equal(manager.draft.templates.calendar.protected,false);assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent).includes('zuerst zentral speichern')));
});
test('selected-template rollback preserves other templates and shared values',async()=>{
  const {manager}=setup();manager.draft.groups.g={name:'Current group',value:'current'};
  const snapshot={library:{templates:{calendar:{name:'Old calendar',config:{type:'custom:calendar',layout:'old'},bindings:[]}},groups:{g:{name:'Old group',value:'old'}},people:{}}};
  await manager.restoreTemplate(snapshot,'calendar');assert.equal(manager.draft.templates.calendar.config.layout,'old');assert.equal(manager.draft.groups.g.value,'current');assert.equal(manager.dirty,true);
});
test('local use editor preserves placement, exports changes and saves only that dashboard reference',async()=>{
  const source={dashboard:'Home',view:'Main',url_path:null,path:['views',0,'cards',0],config:{type:'custom:library-card',template:'calendar',grid_options:{columns:6}}};
  const {manager,hass}=setup();const original=hass.callWS;let write;
  hass.callWS=async message=>message.type==='card_library/dashboard_get'?{mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[source.config]}]}}:message.type==='card_library/dashboard_write'?(write=message,{mode:'storage',fingerprint:'b'.repeat(64),config:{views:[{cards:[message.value]}]}}):original(message);
  await manager.openUsage(source);assert.equal(manager.mode,'local-use');const editor=nodes(manager.shadowRoot).find(node=>node instanceof customElements.get('library-card-editor'));
  editor.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...source.config,overrides:[{path:['layout'],value:'local'}]}},stopPropagation(){}}));
  const exported=inputField(manager.shadowRoot,'Konfiguration dieser Verwendung');assert.match(exported.value,/local/);
  await manager.saveUsage();assert.equal(write.value.grid_options.columns,6);assert.equal(write.value.overrides[0].value,'local');assert.equal(manager.state.library.templates.calendar.config.layout,'month');
});
test('local use refuses a moved or changed dashboard card before opening an editor',async()=>{
  const {manager,hass}=setup();hass.callWS=async()=>({mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[{type:'custom:library-card',template:'other'}]}]}});
  await assert.rejects(()=>manager.openUsage({path:['views',0,'cards',0],config:{type:'custom:library-card',template:'calendar'}}),/geändert oder verschoben/);
});
test('duplicating local use keeps source settings and writes an appended link at the selected target',async()=>{
  const source={dashboard:'Home',view:'Main',url_path:null,path:['views',0,'cards',0],config:{type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'local'}]}};
  const {manager,hass}=setup();const original=hass.callWS;let write;hass.callWS=async message=>message.type==='card_library/dashboard_get'?{mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[source.config]}]}}:message.type==='card_library/dashboard_write'?(write=message,{}):original(message);
  await manager.openUsage(source);await manager.duplicateUsage({url_path:'dashboard-other',path:['views',0,'cards']});
  assert.equal(write.operation,'append');assert.equal(write.dashboard,'dashboard-other');assert.equal(write.value.overrides[0].value,'local');assert.deepEqual(source.config.overrides,[{path:['layout'],value:'local'}]);
});
test('comparison and change preview show local exceptions that prevent central changes',()=>{
  const {manager}=setup();const use={dashboard:'Home',view:'Main',path:['views',0,'cards',0],config:{type:'custom:library-card',template:'calendar',overrides:[{path:['layout'],value:'local'}]}};
  manager.inventory={cards:[use],failures:[],scannedAt:new Date().toISOString()};manager.draft.templates.calendar.config.layout='new';manager.edit();manager.mode='review';manager.render();
  assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent).includes('durch lokale Ausnahmen unverändert')));
  manager.comparePair=[use,{...use,config:{type:'custom:library-card',template:'calendar'}}];manager.mode='compare-use';manager.render();assert.ok(nodes(manager.shadowRoot).some(node=>String(node.textContent).includes('unterschiedliche Felder')));
});

test('input-definition editor adds required domain-restricted fields and can edit them',()=>{
  const {manager}=setup();manager.selected='calendar';manager.render();
  inputField(manager.shadowRoot,'Feldpfad').value='entity';inputField(manager.shadowRoot,'Beschriftung').value='Hauptentität';inputField(manager.shadowRoot,'Pflichtfeld').checked=true;inputField(manager.shadowRoot,'Entitätsdomänen (optional, mit Komma)').value='calendar';
  find(manager.shadowRoot,'Eingabefeld speichern').click();assert.deepEqual(manager.draft.templates.calendar.inputs,[{path:['entity'],label:'Hauptentität',type:'entity',required:true,domains:['calendar']}]);
  find(manager.shadowRoot,'Eingabefeld bearbeiten').click();inputField(manager.shadowRoot,'Beschriftung').value='Kalender';find(manager.shadowRoot,'Eingabefeld speichern').click();assert.equal(manager.draft.templates.calendar.inputs.length,1);assert.equal(manager.draft.templates.calendar.inputs[0].label,'Kalender');
});
test('hash-use editing persists only its alias overrides and refuses to discard central drafts',async()=>{
  const state=library();state.templates.calendar.popup_links=[{hash:'#local',overrides:[{path:['layout'],value:'agenda'}]}];
  const source={dashboard:'Home',view:'Main',url_path:null,card_path:['views',0,'cards',0],path:['views',0,'cards',0,'tap_action'],config:{type:'button',tap_action:{action:'navigate',navigation_path:'#local'}},reference:{template:'calendar',popup_hash:'#local'}};
  const {manager,hass,saved}=setup(state);const original=hass.callWS;hass.callWS=async message=>message.type==='card_library/dashboard_get'?{mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[source.config]}]}}:original(message);
  await manager.openUsage(source);manager.localUse.reference.overrides=[{path:['layout'],value:'month-local'}];manager.dirty=true;await assert.rejects(()=>manager.saveUsage(),/Zentralen Entwurf/);assert.equal(saved.length,0);
  manager.dirty=false;await manager.saveUsage();assert.equal(saved[0].library.templates.calendar.popup_links[0].overrides[0].value,'month-local');assert.equal(saved[0].library.templates.calendar.config.layout,'month');
});
test('local preview keeps reference-level card-mod decorators and layout options',async()=>{
  const {manager}=setup();const use={config:{type:'custom:library-card',template:'calendar',card_mod:{style:'ha-card {color:red}'},grid_options:{columns:6}}};previews.length=0;
  const host=new Element('div');await manager.previewUsage(host,use);
  assert.deepEqual(previews.at(-1).card_mod,use.config.card_mod);assert.deepEqual(previews.at(-1).grid_options,{columns:6});
});

test('invalid input definitions keep entered values so they can be corrected',()=>{
  const {manager}=setup();manager.selected='calendar';manager.render();
  inputField(manager.shadowRoot,'Feldpfad').value='type';inputField(manager.shadowRoot,'Beschriftung').value='My field';
  find(manager.shadowRoot,'Eingabefeld speichern').click();assert.equal(inputField(manager.shadowRoot,'Feldpfad').value,'type');assert.equal(inputField(manager.shadowRoot,'Beschriftung').value,'My field');assert.equal(manager.draft.templates.calendar.inputs,undefined);
});

test('duplicating hash popups creates an independent hash link and inserts a navigate button',async()=>{
  const state=library();state.templates.calendar.popup_links=[{hash:'#old',overrides:[{path:['layout'],value:'agenda'}],options:{width_desktop:'600px'}}];
  const source={dashboard:'Home',view:'Main',url_path:null,card_path:['views',0,'cards',0],path:['views',0,'cards',0,'tap_action'],config:{type:'button',tap_action:{action:'navigate',navigation_path:'#old'}},reference:{template:'calendar',popup_hash:'#old'}};
  const {manager,hass,saved}=setup(state);const original=hass.callWS;let write;
  hass.callWS=async message=>message.type==='card_library/dashboard_get'?{mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[source.config]}]}}:message.type==='card_library/dashboard_write'?(write=message,{}):original(message);
  await manager.openUsage(source);manager.duplicateHash='#new';await manager.duplicateUsage({url_path:'dashboard-other',path:['views',0,'cards']});
  assert.equal(write.value.tap_action.action,'navigate');assert.equal(write.value.tap_action.navigation_path,'#new');assert.equal(write.library_revision,1);
  assert.deepEqual(saved[0].library.templates.calendar.popup_links[0],state.templates.calendar.popup_links[0]);assert.equal(saved[0].library.templates.calendar.popup_links[1].options.width_desktop,'600px');
});
test('failed insertion after hash creation reports the preserved alias instead of deleting it',async()=>{
  const state=library();state.templates.calendar.popup_links=[{hash:'#old'}];
  const source={dashboard:'Home',view:'Main',url_path:null,card_path:['views',0,'cards',0],path:['views',0,'cards',0,'tap_action'],config:{type:'button',tap_action:{action:'navigate',navigation_path:'#old'}},reference:{template:'calendar',popup_hash:'#old'}};
  const {manager,hass,saved}=setup(state);const original=hass.callWS;
  hass.callWS=async message=>message.type==='card_library/dashboard_get'?{mode:'storage',fingerprint:'a'.repeat(64),config:{views:[{cards:[source.config]}]}}:message.type==='card_library/dashboard_write'?Promise.reject(Error('conflict')):original(message);
  await manager.openUsage(source);manager.duplicateHash='#copy';await assert.rejects(()=>manager.duplicateUsage({url_path:'target',path:['views',0,'cards']}),/Hash-Kopie #copy wurde gespeichert/);assert.equal(saved.length,1);assert.equal(manager.localUse.pendingDuplicateHash,'#copy');
});
