// Exercise the real resource bootstrap, websocket client, router and reference
// renderer together. Only the browser DOM and original card factories are doubles.
import {test} from 'node:test';
import assert from 'node:assert/strict';

const registry = new Map(), created = [], recipients = [], snapshots = new Map();
class Element extends EventTarget {
  constructor(tag = '') { super(); this.localName = tag; this.tagName = tag; this.children = []; this.style = {}; this.isConnected = false; }
  attachShadow() { this.shadowRoot = new Element('shadow-root'); this.shadowRoot.host = this; this.shadowRoot.isConnected = this.isConnected; return this.shadowRoot; }
  connected(value) {
    if (this.isConnected === value) return;
    this.isConnected = value;
    if (this.shadowRoot) this.shadowRoot.connected(value);
    if (value) this.connectedCallback?.(); else this.disconnectedCallback?.();
    for (const child of this.children) child.connected?.(value);
  }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); child.connected?.(this.isConnected); } }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; this.connected(false); }
  setAttribute() {}
  querySelectorAll() { return []; }
}
class NativeCard extends Element { setConfig(config) { this.config = structuredClone(config); } set hass(hass) { this.latestHass = hass; } }
class BubbleCard extends NativeCard {
  constructor() { super('bubble-card'); this.attachShadow(); }
  connectedCallback() { this.updateContent(); }
  set hass(hass) { this.latestHass = hass; this.updateContent(); for (const child of this.shadowRoot.children) child.hass = hass; }
  updateContent() {
    if (!this.isConnected || !this.latestHass) return;
    this.isStandalonePopUp = Array.isArray(this.config?.cards);
    if (!this.isStandalonePopUp) return;
    if (this.shadowRoot.children.length !== this.config.cards.length) this.shadowRoot.replaceChildren();
    for (const [index,config] of this.config.cards.entries()) {
      let child = this.shadowRoot.children[index];
      if (!child) { child = helpers.createCardElement(config); this.shadowRoot.append(child); }
      else child.setConfig(config);
      child.hass = this.latestHass;
    }
  }
}
registry.set('bubble-card', BubbleCard);
const app = new Element('home-assistant'); app.connected(true); app.attachShadow();
app.provideHass = host => { recipients.push(host); host.hass = app.hass; };
const win = new EventTarget(); win.location = new URL('https://ha.example/dashboard/0');
Object.assign(win, {setTimeout,clearTimeout,customCards:[],console});
win.history = {state:{ha:true},pushState(state,_,url) {this.state = state; win.location.href = new URL(url,win.location).href;},replaceState(state,_,url) {this.state = state; win.location.href = new URL(url,win.location).href;}};
const document = {querySelector:tag => tag === 'home-assistant' ? app : null,createElement(tag) {
  const element = registry.has(tag) ? new (registry.get(tag))() : new Element(tag);
  element.localName = tag; element.tagName = tag; return element;
}};
const helpers = {createCardElement(config) {
  const tag = config.type.startsWith('custom:') ? config.type.slice(7) : 'hui-' + config.type + '-card';
  const element = registry.has(tag) ? document.createElement(tag) : new NativeCard(tag);
  element.setConfig(config); created.push(element); return element;
}};
win.loadCardHelpers = async () => helpers;
Object.assign(globalThis, {HTMLElement:Element,window:win,document,customElements:{get:tag=>registry.get(tag),define:(tag,klass)=>registry.set(tag,klass),whenDefined:tag=>registry.has(tag) ? Promise.resolve() : new Promise(()=>{})}});
if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type,options) {super(type,options); this.detail = options?.detail;} };
const dashboard = {views:[{cards:[{type:'button',tap_action:{action:'navigate',navigation_path:'#kalender'}}]}]};
const originalDashboard = structuredClone(dashboard);
const flush = async () => { for (let i=0;i<6;i++) await new Promise(resolve=>setTimeout(resolve,0)); };
function connect(library) {
  const connection = {subscribeMessage:async callback => {snapshots.set(connection,callback); callback(library); return ()=>snapshots.delete(connection);}};
  app.hass = {connection,states:{'sensor.test':{state:'on'}},user:{is_admin:true}};
  for (const host of recipients) host.hass = app.hass;
  return snapshot => snapshots.get(connection)(snapshot);
}
const library = config => ({revision:0,templates:{calendar:{name:'Kalender',config}},groups:{},people:{}});

test('resource cold-start opens a saved standalone popup with only its dashboard button', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',name:'Native',width_desktop:'900px',cards:[{type:'markdown',content:'Saved content'}]});
  const push = connect(state);
  await import('../custom_components/card_library/frontend/card-library.js'); await flush();
  assert.equal(created.length,0); assert.equal(recipients.length,1);
  assert.equal(app.shadowRoot.children.length,1);
  assert.match(app.shadowRoot.children[0].style.cssText,/position:absolute/);
  win.location.hash = '#kalender'; win.dispatchEvent(new Event('location-changed')); await flush();
  const popup = created.find(card=>card.localName === 'bubble-card');
  assert.ok(popup?.isConnected); assert.equal(popup.config.name,'Native');
  assert.deepEqual(popup.config.cards,state.templates.calendar.config.cards);
  const content = created.find(card=>card.localName === 'hui-markdown-card');
  assert.deepEqual(content.config,{type:'markdown',content:'Saved content'});
  assert.deepEqual(dashboard,originalDashboard); assert.equal(dashboard.views[0].cards.length,1);
  push({...state,revision:1,templates:{calendar:{...state.templates.calendar,config:{...state.templates.calendar.config,cards:[{type:'markdown',content:'Central update'}]}}}}); await flush();
  assert.equal(created.filter(card=>card.localName === 'bubble-card').length,1,'Content changes retain the native popup shell');
  assert.equal(content.config.content,'Central update');
  push({...state,revision:2,templates:{calendar:{...state.templates.calendar,config:{...state.templates.calendar.config,name:'Central frame'}}}}); await flush();
  assert.equal(created.filter(card=>card.localName === 'bubble-card').length,2);
  assert.equal(created.filter(card=>card.localName === 'bubble-card').at(-1).config.name,'Central frame');
  assert.equal(popup.isConnected,false); win.__cardLibraryPopupController.close(); await flush();
});
test('a saved legacy stack opens its content outside the dashboard and keeps stack styles', async () => {
  connect(library({type:'vertical-stack',card_mod:{style:'ha-card {background:transparent}'},cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',name:'Legacy'},{type:'markdown',content:'First'},{type:'entities',entities:['sensor.test']}]})); await flush();
  const before = created.length;
  win.location.hash = '#kalender'; win.dispatchEvent(new Event('location-changed')); await flush();
  const popup = created.slice(before).find(card=>card.localName === 'bubble-card');
  const content = created.slice(before).find(card=>card.localName === 'hui-vertical-stack-card');
  assert.equal(popup.config.name,'Legacy'); assert.equal(content.config.cards.length,2);
  assert.equal(content.config.cards[0].type,'markdown'); assert.equal(content.config.cards[1].type,'entities');
  assert.deepEqual(content.config.card_mod,{style:'ha-card {background:transparent}'});
  assert.deepEqual(dashboard,originalDashboard); assert.equal(recipients.length,1);
  win.__cardLibraryPopupController.close(); await flush();
});
test('an explicit button action opens a saved native popup without a placed reference', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',name:'Original',cards:[{type:'markdown',content:'Central'}]});
  const push = connect(state); await flush();
  win.location.hash = '#previous'; win.dispatchEvent(new Event('location-changed'));
  const before = created.length;
  const event = new CustomEvent('ll-custom',{detail:{card_library:{action:'popup',template:'calendar',popup:{name:'Local frame'},overrides:[{path:['cards',0,'content'],value:'Local content'}]}}});
  win.dispatchEvent(event); await flush();
  const popup = created.slice(before).find(card=>card.localName === 'bubble-card');
  const content = created.slice(before).find(card=>card.localName === 'hui-markdown-card');
  assert.equal(popup.config.name,'Local frame'); assert.equal(content.config.content,'Local content');
  assert.deepEqual(dashboard,originalDashboard); assert.equal(recipients.length,1);
  const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards.push({type:'markdown',content:'Added centrally',grid_options:{columns:6}});
  push(next); await flush();
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,1);
  assert.equal(popup.config.cards.length,2); assert.equal(popup.config.cards[0].content,'Local content');
  const hash = win.location.hash;
  next.revision++; next.templates.calendar.config.width_desktop = '1100px'; push(structuredClone(next)); await flush();
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,2);
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').at(-1).config.name,'Local frame');
  assert.equal(win.location.hash,hash);
  win.__cardLibraryPopupController.close(); await flush();
  assert.equal(win.location.hash,'#previous');
});
test('native popup grids pass every column and row option to original Bubble wrappers', async () => {
  const cards = [{type:'markdown',content:'Left',grid_options:{columns:6,rows:2}},{type:'entities',entities:['sensor.test'],grid_options:{columns:6,rows:'auto'}}];
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',cards});
  const push = connect(state); await flush(); const before = created.length;
  win.location.hash = '#kalender'; win.dispatchEvent(new Event('location-changed')); await flush();
  const popup = created.slice(before).find(card=>card.localName === 'bubble-card');
  assert.deepEqual(popup.config.cards,cards); assert.equal(popup.config.cards.length,2);
  assert.ok(!popup.config.cards.some(card=>card.type==='custom:library-card'));
  const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards[0].grid_options = {columns:12,rows:3}; push(next); await flush();
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,1);
  assert.deepEqual(popup.config.cards[0].grid_options,{columns:12,rows:3});
  win.__cardLibraryPopupController.close(); await flush();
});
test('a manual popup waiting for helpers opens the latest central card configuration', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',cards:[{type:'markdown',content:'Old'}]});
  const push = connect(state); await flush(); const before = created.length;
  const original = win.loadCardHelpers; let release;
  win.loadCardHelpers = () => new Promise(resolve=>{release=resolve;});
  win.dispatchEvent(new CustomEvent('ll-custom',{detail:{card_library:{action:'popup',template:'calendar'}}}));
  await flush(); assert.equal(created.length,before);
  const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards[0].content = 'Latest'; push(next); await flush();
  win.loadCardHelpers = original; release(helpers); await flush();
  const popup = created.slice(before).find(card=>card.localName==='bubble-card');
  assert.equal(popup.config.cards[0].content,'Latest');
  win.__cardLibraryPopupController.close(); await flush();
});
test('a central switch between a native popup and plain content changes the actual renderer', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',cards:[]}); state.templates.calendar.popup = {hash:'#kalender'};
  const push = connect(state); await flush(); const before = created.length;
  win.location.hash = '#kalender'; win.dispatchEvent(new Event('location-changed')); await flush();
  const plain = structuredClone(state); plain.revision++; plain.templates.calendar.config = {type:'markdown',content:'Plain'}; push(plain); await flush();
  let popup = created.slice(before).filter(card=>card.localName==='bubble-card').at(-1);
  assert.deepEqual(popup.config.cards,[{type:'custom:library-card',template:'calendar',popup_content:'auto'}]);
  assert.ok(created.slice(before).some(card=>card.localName==='hui-markdown-card'&&card.config.content==='Plain'));
  const native = structuredClone(state); native.revision = 2; native.templates.calendar.config.cards = [{type:'markdown',content:'Native again',grid_options:{columns:6}}]; push(native); await flush();
  popup = created.slice(before).filter(card=>card.localName==='bubble-card').at(-1);
  assert.deepEqual(popup.config.cards,native.templates.calendar.config.cards);
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,3);
  win.__cardLibraryPopupController.close(); await flush();
});
test('a manual popup discards a factory candidate superseded by a central update', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',cards:[{type:'markdown',content:'Old'}]});
  const push = connect(state); await flush(); const before = created.length;
  const original = helpers.createCardElement; let first = true;
  helpers.createCardElement = config => {
    if (config.type==='custom:bubble-card' && first) {
      first = false; const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards[0].content = 'Latest'; push(next);
    }
    return original(config);
  };
  try {
    win.dispatchEvent(new CustomEvent('ll-custom',{detail:{card_library:{action:'popup',template:'calendar'}}})); await flush();
    const popups = created.slice(before).filter(card=>card.localName==='bubble-card');
    assert.equal(popups.length,2); assert.equal(popups[0].isConnected,false);
    assert.equal(popups[1].config.cards[0].content,'Latest'); assert.equal(popups[1].isConnected,true);
    win.__cardLibraryPopupController.close(); await flush();
  } finally {helpers.createCardElement = original;}
});

test('two central hash aliases render independent native entities and styles with only buttons', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',name:'Original',cards:[{type:'entities',entities:['sensor.central'],card_mod:{style:'ha-card { color: red; }'}}]});
  state.templates.calendar.popup = {hash:'#kalender',options:{name:'Inherited title',width_desktop:'900px'}};
  state.templates.calendar.popup_links = [
    {hash:'#person-a',overrides:[{path:['cards',0,'entities'],value:['sensor.a']},{path:['cards',0,'card_mod','style'],value:'ha-card { background: transparent; }'}],options:{name:'A'}},
    {hash:'#person-b',overrides:[{path:['cards',0,'entities'],value:['sensor.b']}],options:{width_desktop:'600px'}}
  ];
  const push = connect(state); await flush(); const before = created.length;
  win.location.hash = '#person-a'; win.dispatchEvent(new Event('location-changed')); await flush();
  let popup = created.slice(before).filter(card=>card.localName==='bubble-card').at(-1);
  assert.equal(popup.config.name,'A'); assert.equal(popup.config.width_desktop,'900px');
  assert.deepEqual(popup.config.cards[0].entities,['sensor.a']); assert.match(popup.config.cards[0].card_mod.style,/transparent/);
  win.location.hash = '#person-b'; win.dispatchEvent(new Event('location-changed')); await flush();
  popup = created.slice(before).filter(card=>card.localName==='bubble-card').at(-1);
  assert.equal(popup.config.name,'Inherited title'); assert.equal(popup.config.width_desktop,'600px');
  assert.deepEqual(popup.config.cards[0].entities,['sensor.b']); assert.match(popup.config.cards[0].card_mod.style,/red/);
  const count = created.slice(before).filter(card=>card.localName==='bubble-card').length;
  const next = structuredClone(state); next.revision++; next.templates.calendar.config.cards[0].card_mod.style = 'ha-card { color: blue; }';
  next.templates.calendar.config.cards.push({type:'markdown',content:'Central addition'}); push(next); await flush();
  assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,count);
  assert.deepEqual(popup.config.cards[0].entities,['sensor.b']); assert.match(popup.config.cards[0].card_mod.style,/blue/); assert.equal(popup.config.cards.length,2);
  win.location.hash = '#person-a'; win.dispatchEvent(new Event('location-changed')); await flush();
  popup = created.slice(before).filter(card=>card.localName==='bubble-card').at(-1);
  assert.deepEqual(popup.config.cards[0].entities,['sensor.a']); assert.match(popup.config.cards[0].card_mod.style,/transparent/); assert.equal(popup.config.cards.length,2);
  assert.deepEqual(dashboard,originalDashboard); assert.equal(recipients.length,1);
  next.revision++; next.templates.calendar.popup_links.splice(0,1); push(structuredClone(next)); await flush();
  assert.equal(popup.isConnected,false); assert.equal(win.location.hash,'');
  win.__cardLibraryPopupController.close(); await flush();
});

test('plain and legacy aliases retain live library references with their own local exceptions', async () => {
  for (const config of [{type:'entities',entities:['sensor.central']},{type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up',name:'Legacy'},{type:'entities',entities:['sensor.central']}]}]) {
    const state = library(config), path = config.type==='vertical-stack' ? ['cards',1,'entities'] : ['entities'];
    state.templates.calendar.popup_links = [{hash:'#alias',overrides:[{path,value:['sensor.local']}],options:{name:'Alias frame'}}];
    const push = connect(state); await flush(); const before = created.length;
    win.location.hash = '#alias'; win.dispatchEvent(new Event('location-changed')); await flush();
    const popup = created.slice(before).find(card=>card.localName==='bubble-card');
    const content = created.slice(before).find(card=>card.localName===(config.type==='vertical-stack' ? 'hui-vertical-stack-card' : 'hui-entities-card'));
    assert.equal(popup.config.name,'Alias frame'); assert.equal(popup.config.cards[0].type,'custom:library-card');
    assert.deepEqual(config.type==='vertical-stack' ? content.config.cards[0].entities : content.config.entities,['sensor.local']);
    const next = structuredClone(state); next.revision++;
    if (config.type==='vertical-stack') next.templates.calendar.config.cards[1].title = 'Updated centrally'; else next.templates.calendar.config.title = 'Updated centrally';
    push(next); await flush();
    assert.equal(created.slice(before).filter(card=>card.localName==='bubble-card').length,1);
    assert.equal(config.type==='vertical-stack' ? content.config.cards[0].title : content.config.title,'Updated centrally');
    win.__cardLibraryPopupController.close(); await flush();
  }
});

test('a manual popup factory cannot publish stale inherited central options', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',cards:[{type:'markdown',content:'Unchanged'}]});
  state.templates.calendar.popup = {hash:'#kalender',options:{width_desktop:'900px'}};
  const push = connect(state); await flush(); const before = created.length;
  const original = helpers.createCardElement; let first = true;
  helpers.createCardElement = config => {
    if (config.type==='custom:bubble-card' && first) {
      first = false; const next = structuredClone(state); next.revision++; next.templates.calendar.popup.options.width_desktop = '1200px'; push(next);
    }
    return original(config);
  };
  try {
    win.dispatchEvent(new CustomEvent('ll-custom',{detail:{card_library:{action:'popup',template:'calendar',popup:{name:'Local'}}}})); await flush();
    const popups = created.slice(before).filter(card=>card.localName==='bubble-card');
    assert.equal(popups.length,2); assert.equal(popups[0].isConnected,false);
    assert.equal(popups[1].config.width_desktop,'1200px'); assert.equal(popups[1].config.name,'Local'); assert.equal(popups[1].isConnected,true);
    win.__cardLibraryPopupController.close(); await flush();
  } finally {helpers.createCardElement = original;}
});

test('resource updates revalidate required fields of visible standalone hash popups', async () => {
  const state = library({type:'custom:bubble-card',card_type:'pop-up',hash:'#required',cards:[{type:'markdown',content:'Central'}]});
  const push = connect(state), notifications = [];
  const notify = event=>notifications.push(event.detail.message); app.addEventListener('hass-notification',notify);
  try {
    win.location.hash = '#required'; win.dispatchEvent(new Event('location-changed')); await flush();
    const previous = created.filter(card=>card.localName==='bubble-card').at(-1); assert.equal(previous.isConnected,true);
    const next = structuredClone(state); next.revision++; next.templates.calendar.inputs = [{path:['cards',0,'title'],label:'Titel',type:'text',required:true}];
    push(next); await flush();
    assert.equal(previous.isConnected,false); assert.equal(win.location.hash,'#required'); assert.equal(notifications.length,1); assert.match(notifications[0],/Titel/);
    const corrected = structuredClone(next); corrected.revision++; corrected.templates.calendar.config.cards[0].title = 'Nachgereicht'; push(corrected); await flush();
    const reopened = created.filter(card=>card.localName==='bubble-card').at(-1);
    assert.notEqual(reopened,previous); assert.equal(reopened.isConnected,true); assert.equal(reopened.config.cards[0].title,'Nachgereicht');
  } finally {app.removeEventListener('hass-notification',notify);win.__cardLibraryPopupController.close();await flush();}
});
