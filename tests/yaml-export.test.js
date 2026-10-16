import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {templateYamlConfig, installYamlTools} from '../custom_components/card_library/frontend/library-yaml-export.js';
import {configurationYaml} from '../custom_components/card_library/frontend/library-tools.js';
import {el, field, setSelectOptions, whenOpen} from '../custom_components/card_library/frontend/library-ui.js';

const library = () => ({templates:{popup:{name:'Popup', config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#original',name:'Original',cards:[{type:'custom:button-card',entity:'sensor.central',name:'[[[ return entity?.attributes.friendly_name; ]]]',styles:{card:[{color:'inherit'}]},card_mod:{style:'ha-card {\n  color: {{ states("sensor.color") }};\n}'}}]},bindings:[]}},groups:{},people:{}});
async function roundtrip(config) {
  const source = configurationYaml(config);
  const output = await new Promise((resolve,reject) => {
    const parser=spawn(process.env.PYTHON || (existsSync(fileURLToPath(new URL('../.venv/bin/python',import.meta.url))) ? fileURLToPath(new URL('../.venv/bin/python',import.meta.url)) : 'python3'),['-c','import sys,json,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))']);
    let stdout='',stderr='';const timer=setTimeout(()=>{parser.kill();reject(Error('YAML roundtrip timed out'));},10000);
    parser.stdout.on('data',value=>{stdout+=value;});parser.stderr.on('data',value=>{stderr+=value;});
    parser.on('error',error=>{clearTimeout(timer);reject(error);});
    parser.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(stderr||'YAML parser failed'));});
    parser.stdin.end(source);
  });
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed,config);
  return parsed;
}

test('central YAML resolves shared/person bindings and preserves expressions and foreign fields', async () => {
  const state = library(); state.groups.colors = {name:'Farben',value:'#ff2200'}; state.people.anna = {name:'Anna',color:'#bbccdd'};
  state.templates.popup.bindings = [{path:['cards',0,'styles','card',0,'color'],group:'colors'},{path:['cards',0,'icon_color'],person:'anna',field:'color'}];
  state.templates.popup.config.grid_options = {columns:'full',rows:3};
  state.templates.popup.config.custom_field = {yes:'true',number:'001',nil:'null',date:'2026-10-15',empty:[],object:{},multiline:'a\nb\n',unicode:'Küche 🏠'};
  const before = structuredClone(state), config = await roundtrip(templateYamlConfig(state,'popup'));
  assert.equal(config.cards[0].styles.card[0].color,'#ff2200'); assert.equal(config.cards[0].icon_color,'#bbccdd');
  assert.equal(config.cards[0].name,before.templates.popup.config.cards[0].name);
  assert.equal(config.cards[0].card_mod.style,before.templates.popup.config.cards[0].card_mod.style);
  assert.deepEqual(state,before);
});

test('standalone aliases use effective route options, hash and local card exceptions', async () => {
  const state = library(); const item = state.templates.popup;
  item.popup = {hash:'#central',options:{name:'Central',width_desktop:'1000px',styles:'.bubble-pop-up { color: red; }'}};
  item.preload = true;
  item.popup_links = [{hash:'#saved',overrides:[{path:['cards',0,'entity'],value:'sensor.local'}],options:{name:'Local',foreign_option:{value:'kept'}},preload:false}];
  const before = structuredClone(state), central = await roundtrip(templateYamlConfig(state,'popup')), alias = await roundtrip(templateYamlConfig(state,'popup','#saved'));
  assert.equal(central.hash,'#central'); assert.equal(central.name,'Central'); assert.equal(central.width_desktop,'1000px'); assert.equal(central.cards[0].entity,'sensor.central');
  assert.equal(alias.hash,'#saved'); assert.equal(alias.name,'Local'); assert.equal(alias.width_desktop,'1000px'); assert.equal(alias.cards[0].entity,'sensor.local');
  assert.deepEqual(alias.foreign_option,{value:'kept'}); assert.equal(alias.preload,undefined); assert.equal(central.preload,undefined);
  assert.deepEqual(state,before);
});

test('legacy stack export retains its full native stack and every outer decoration', async () => {
  const state = library(), item = state.templates.popup;
  const card = item.config.cards[0]; item.config = {type:'vertical-stack',title:'Unverändert',card_mod:{style:':host { padding: 0; }'},cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#old',name:'Legacy',styles:'original'},{type:'horizontal-stack',cards:[card]},{type:'markdown',content:'{{ states("sensor.test") }}'}]};
  item.popup = {hash:'#central',options:{width_desktop:'900px'}}; item.popup_links = [{hash:'#local',options:{name:'Local'},overrides:[{path:['cards',1,'cards',0,'entity'],value:'sensor.local'}]}];
  const before = structuredClone(state), config = await roundtrip(templateYamlConfig(state,'popup','#local'));
  assert.equal(config.type,'vertical-stack'); assert.equal(config.cards.length,3); assert.equal(config.cards[0].hash,'#local'); assert.equal(config.cards[0].name,'Local'); assert.equal(config.cards[0].width_desktop,'900px');
  assert.equal(config.cards[1].cards[0].entity,'sensor.local'); assert.deepEqual(config.card_mod,item.config.card_mod); assert.equal(config.cards[0].cards,undefined);
  assert.deepEqual(state,before);
});

test('plain central cards remain standalone card YAML while hash variants are real Bubble envelopes', async () => {
  const state = library(), item = state.templates.popup;
  item.config = {type:'entities',entities:['sensor.central'],card_mod:{style:'ha-card { color: red; }'}}; item.popup = {hash:'#central',options:{name:'Common',width_desktop:'1000px'}};
  item.popup_links = [{hash:'#local',overrides:[{path:['entities'],value:['sensor.local']}],options:{name:'Local'}}];
  const before = structuredClone(state);
  assert.deepEqual(await roundtrip(templateYamlConfig(state,'popup')),item.config);
  const config = await roundtrip(templateYamlConfig(state,'popup','#local'));
  assert.equal(config.type,'custom:bubble-card'); assert.equal(config.card_type,'pop-up'); assert.equal(config.hash,'#local'); assert.equal(config.name,'Local'); assert.equal(config.width_desktop,'1000px');
  assert.deepEqual(config.cards,[{...item.config,entities:['sensor.local']}]); assert.deepEqual(state,before);
});

test('header/footer exports restore the native outer card and sizing structure', async () => {
  const state = library(); state.templates.popup.config = {type:'custom:library-container-card',card:{type:'markdown',content:'Footer'},max_width:80,custom_outer:{keep:true}};
  const before = structuredClone(state), config = await roundtrip(templateYamlConfig(state,'popup'));
  assert.deepEqual(config,{card:{type:'markdown',content:'Footer'},max_width:80,custom_outer:{keep:true}}); assert.deepEqual(state,before);
});

test('resolved native popup hashes follow current shared settings', () => {
  const state = library(); state.groups.hash = {name:'Hash',value:'#bound'}; state.templates.popup.bindings = [{path:['hash'],group:'hash'}];
  assert.equal(templateYamlConfig(state,'popup').hash,'#bound'); state.groups.hash.value = '#new'; assert.equal(templateYamlConfig(state,'popup').hash,'#new');
});

test('missing or ambiguous saved variants are rejected instead of copying the central config', () => {
  const state = library(); assert.throws(()=>templateYamlConfig(state,'popup','#deleted'),/existiert nicht mehr/);
  state.templates.popup.popup_links = [{hash:'#duplicate'},{hash:'#duplicate'}]; assert.throws(()=>templateYamlConfig(state,'popup','#duplicate'),/nicht eindeutig/);
});

class Element {
  constructor(tag = '') {this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.isConnected=true;this.value='';this.style={};}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children=nodes;}
  setAttribute(name,value) {this.attributes[name]=value;}
  addEventListener(name,callback) {(this.listeners[name] ||= []).push(callback);}
  dispatchEvent(event) {for(const callback of this.listeners[event.type] || []) callback(event);}
}
const registry = new Map();
registry.set('ha-textarea',class extends Element {
  constructor() {
    super('ha-textarea');this.readonly=false;
    this.native={select:()=>{this.manuallySelected=true;},focus:()=>{this.focused=true;}};
    this.shadowRoot={querySelectorAll:()=>[this.native]};
  }
});
globalThis.customElements = {get:tag=>registry.get(tag)};
globalThis.document = {createElement:tag=>registry.has(tag)?new(registry.get(tag))():new Element(tag)};
function button(parent,label,action) {const node=el('button',label,parent);node.onclick=()=>!node.disabled&&action();return node;}
function select(parent,items,value,change,label) {const node=field(parent,label,'select');setSelectOptions(node,items);node.value=value;node.onchange=()=>change(node.value);return node;}
function nodes(node) {return [node,...node.children.flatMap(nodes)];}
function byTag(root,tag) {return nodes(root).find(node=>(node.libraryTag || node.tagName)===tag);}
function setup(state = library()) {
  class Manager {} installYamlTools(Manager,{el,field,button,select,whenOpen});
  const manager = new Manager(); manager.selected='popup';manager.draft=state;
  const root=new Element('root'),section=manager.yamlExportPanel(root,state.templates.popup);
  const open=()=>{section.open=true;section.dispatchEvent({type:'toggle'});};
  return {manager,root,section,open,text:()=>byTag(section,'textarea'),choice:()=>byTag(section,'select'),copy:()=>nodes(section).find(node=>node.textContent==='YAML kopieren')};
}

test('YAML panels materialize only when opened and use native readonly textarea controls', () => {
  const state = library();Object.defineProperty(state.templates.popup.config,'extra',{enumerable:true,get(){throw Error('Card resolved eagerly');}});
  const f=setup(state); assert.equal(f.text(),undefined);
  const good=library();f.manager.draft=good;f.open(); assert.equal(f.text().tagName,'ha-textarea'); assert.equal(f.text().readOnly,true); assert.equal(f.text().readonly,true);
  assert.deepEqual(f.choice().libraryOptions,[['','Zentrale Vorlage']]);
});

test('selecting an alias and copying both resolve the latest unsaved draft', async () => {
  const state = library();state.templates.popup.popup_links=[{hash:'#saved',options:{name:'Saved'}}];
  const f=setup(state);f.open();assert.equal(f.choice().libraryOptions[0][0],'');
  f.manager.draft.templates.popup.config.cards[0].entity='sensor.new';f.choice().value='#saved';f.choice().onchange();
  assert.match(f.text().value,/sensor.new/); assert.match(f.text().value,/#saved/);
  let copied;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
  const before=structuredClone(state);f.manager.draft.templates.popup.config.cards[0].entity='sensor.latest';await f.copy().onclick();
  assert.match(copied,/sensor.latest/);assert.match(copied,/#saved/); assert.equal(f.manager.draft.templates.popup.config.cards[0].entity,'sensor.latest');
  assert.deepEqual(f.manager.draft.templates.popup.popup_links,before.templates.popup.popup_links);
});

test('clipboard rejection refreshes and selects text for manual copying without modifying library data', async () => {
  const f=setup();f.open();let rejectCopy;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>new Promise((_,reject)=>{rejectCopy=reject;})}}});
  const pending=f.copy().onclick();f.manager.draft.templates.popup.config.cards[0].entity='sensor.changed';const before=structuredClone(f.manager.draft);rejectCopy(Error('Denied'));await pending;
  assert.match(f.text().value,/sensor.changed/);assert.equal(f.text().manuallySelected,true);assert.equal(f.text().focused,true);assert.deepEqual(f.manager.draft,before);
  assert.ok(nodes(f.section).some(node=>node.textContent?.includes('manuell kopieren')));
});

test('removing a selected alias clears stale YAML and prevents copying it', async () => {
  const state=library();state.templates.popup.popup_links=[{hash:'#saved'}];const f=setup(state);f.open();f.choice().value='#saved';f.choice().onchange();
  f.manager.draft.templates.popup.popup_links=[];let copied=false;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{copied=true;}}}});
  await f.copy().onclick();assert.equal(copied,false);assert.equal(f.text().value,'');assert.equal(f.copy().disabled,true);
});

test('reopening YAML refreshes saved variant choices and the current central draft', () => {
  const f=setup();f.open();f.section.open=false;f.section.dispatchEvent({type:'toggle'});
  f.manager.draft.templates.popup.popup_links=[{hash:'#added'}];f.manager.draft.templates.popup.config.name='Current';f.open();
  assert.deepEqual(f.choice().libraryOptions,[['','Zentrale Vorlage'],['#added','Hash-Variante #added']]);assert.match(f.text().value,/Current/);
});
