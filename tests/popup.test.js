import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bubblePopupConfig, createPopupController, createPopupHashRouter, installPopupActions} from '../custom_components/card_library/frontend/library-popup.js';

function fixture({supported = true, registered = true, helpers, validate, wrapper = false} = {}) {
  const cards = [], wrappers = [], recipients = [], location = new URL('https://ha.example/dashboard/0?test=1');
  const win = new EventTarget();
  Object.assign(win, {location, setTimeout, clearTimeout, loadCardHelpers:helpers || (async () => ({createCardElement(config){const card = document.createElement('bubble-card'); card.setConfig(config); return card;}}))});
  win.history = {state:{ha:true}, pushState(state, _, url){this.state = state; location.href = new URL(url, location).href;}, replaceState(state, _, url){this.state = state; location.href = new URL(url, location).href;}};
  const root = {hass:{connection:{}, states:{initial:{state:'on'}}}, shadowRoot:{append(){}}, provideHass(host){recipients.push(host); host.hass = this.hass;}};
  const document = {querySelector:() => root, createElement(tag) {
    if (tag === 'div') return {attachShadow(){this.shadowRoot = {append(card){card.connected = true;}};}, remove(){}};
    if (tag === 'hui-card') {
      const element = {localName:'hui-card', set hass(value) {this._hass = value; if(this.firstElementChild) this.firstElementChild.hass = value;}, load() {
        const card = document.createElement('bubble-card'); card.setConfig(this.config); card.hass = this._hass;
        this.firstElementChild = card;
      }, remove(){this.removed = true; this.firstElementChild?.remove();}};
      wrappers.push(element); return element;
    }
    const card = {localName:'bubble-card', setConfig(config){this.config = config;}, set hass(value){this.latestHass = value; this.isStandalonePopUp = supported;}, remove(){this.removed = true; this.connected = false;}};
    cards.push(card); return card;
  }};
  const env = {window:win, document, customElements:{get:tag => tag === 'hui-card' ? wrapper : registered}, Event};
  const controller = createPopupController(env, validate);
  return {controller, win, cards, wrappers, recipients, root, env};
}
function nativeHelpers(f) { return {createCardElement(config) { const card = f.env.document.createElement('bubble-card'); card.setConfig(config); return card; }}; }
const action = {action:'popup', template:'calendar', overrides:[{path:['cards',0,'entity'], value:'sensor.local'}], popup:{name:'Kalender', styles:'.bubble-pop-up { background: transparent; }'}};

const aliasLibrary = () => ({templates:{calendar:{name:'Native',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#base',name:'Native title',width_desktop:'900px',cards:[{type:'entities',entities:['sensor.central'],card_mod:{style:'ha-card { color: red; }'}}]},popup:{hash:'#base',options:{name:'Global title',width_desktop:'1000px'}},popup_links:[
  {hash:'#a',overrides:[{path:['cards',0,'entities'],value:['sensor.a']}],options:{name:'Person A'}},
  {hash:'#b',overrides:[{path:['cards',0,'entities'],value:['sensor.b']}],options:{width_desktop:'700px'}}
]}},groups:{},people:{}});

test('native aliases retain distinct exceptions through A B A navigation and repeated signals', async () => {
  const {resolveTemplate} = await import('../custom_components/card_library/frontend/library-core.js');
  let library = aliasLibrary();
  const f = fixture({validate:(_,ref)=>resolveTemplate(library,ref.template,ref.overrides)});
  const router = createPopupHashRouter(f.env,f.controller); router.setLibrary(library);
  for (const [hash,entity,name,width] of [['#a','sensor.a','Person A','1000px'],['#b','sensor.b','Global title','700px'],['#a','sensor.a','Person A','1000px']]) {
    f.win.location.hash = hash; f.win.dispatchEvent(new Event('location-changed')); await settle();
    const card = f.cards.at(-1);
    assert.deepEqual(card.config.cards[0].entities,[entity]); assert.equal(card.config.name,name); assert.equal(card.config.width_desktop,width);
    for (const type of ['location-changed','hashchange','popstate','bubble-card-location-changed']) f.win.dispatchEvent(new Event(type));
    await settle(); assert.equal(f.cards.at(-1),card); assert.deepEqual(card.config.cards[0].entities,[entity]);
  }
  const active = f.cards.at(-1), count = f.cards.length;
  library = structuredClone(library); library.templates.calendar.popup_links[1].options.name = 'Changed B'; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,count); assert.equal(active.config.name,'Person A');
  library = structuredClone(library); library.templates.calendar.config.cards[0].card_mod.style = 'ha-card { color: blue; }'; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,count); assert.deepEqual(active.config.cards[0].entities,['sensor.a']); assert.match(active.config.cards[0].card_mod.style,/blue/);
  library = structuredClone(library); library.templates.calendar.popup.options.width_desktop = '1100px'; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,count+1); assert.equal(f.cards.at(-1).config.width_desktop,'1100px'); assert.deepEqual(f.cards.at(-1).config.cards[0].entities,['sensor.a']);
  f.controller.close();
});

test('plain content aliases pass local exceptions into the live reference and inherit options', async () => {
  const library = aliasLibrary(); library.templates.calendar.config = {type:'entities',entities:['sensor.central']};
  library.templates.calendar.popup_links = [{hash:'#a',overrides:[{path:['entities'],value:['sensor.a']}]},{hash:'#b',overrides:[{path:['entities'],value:['sensor.b']}],options:{name:'B'}}];
  const f = fixture(), router = createPopupHashRouter(f.env,f.controller); router.setLibrary(library);
  f.win.location.hash = '#a'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.deepEqual(f.cards.at(-1).config.cards[0].overrides,library.templates.calendar.popup_links[0].overrides);
  assert.equal(f.cards.at(-1).config.name,'Global title');
  f.win.location.hash = '#b'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.deepEqual(f.cards.at(-1).config.cards[0].overrides,library.templates.calendar.popup_links[1].overrides);
  assert.equal(f.cards.at(-1).config.name,'B'); f.controller.close();
});

test('unopened aliases never resolve their content during router updates', async () => {
  const library = aliasLibrary(); library.templates.unopened = {name:'Unopened',config:{type:'markdown'},bindings:[{path:['content'],group:'large'}],popup_links:[{hash:'#unopened'}]};
  library.groups.large = {name:'Large'}; Object.defineProperty(library.groups.large,'value',{get(){throw Error('Unopened content read');}});
  const f = fixture(), errors = [], router = createPopupHashRouter(f.env,f.controller,error=>errors.push(error));
  router.setLibrary(library); f.win.location.hash = '#a'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(errors.length,0); assert.equal(f.cards.length,1); f.controller.close();
});

test('new required inputs suspend stale native hash popups and recover on the same hash', async () => {
  const {resolveTemplate} = await import('../custom_components/card_library/frontend/library-core.js');
  let library = aliasLibrary(); const errors = [];
  const f = fixture({validate:(_,ref)=>resolveTemplate(library,ref.template,ref.overrides)});
  const router = createPopupHashRouter(f.env,f.controller,error=>errors.push(error));
  f.win.location.hash = '#a'; router.setLibrary(library); await settle();
  const previous = f.cards.at(-1); assert.equal(previous.connected,true);
  library = structuredClone(library); library.templates.calendar.inputs = [{path:['cards',0,'title'],label:'Titel',type:'text',required:true}];
  router.setLibrary(library); await settle();
  assert.equal(previous.removed,true); assert.equal(f.win.location.hash,'#a'); assert.equal(errors.length,1); assert.match(errors[0].message,/Titel/);
  library = structuredClone(library); library.templates.calendar.config.cards[0].title = 'Gültiger Titel';
  router.setLibrary(library); await settle();
  assert.equal(f.cards.length,2); assert.equal(f.cards.at(-1).connected,true); assert.equal(f.cards.at(-1).config.cards[0].title,'Gültiger Titel');
  assert.equal(f.win.location.hash,'#a'); f.controller.close();
});

test('invalidating required native inputs cancels helpers already loading for that hash', async () => {
  let release; const library = aliasLibrary(), errors = [];
  const f = fixture({helpers:()=>new Promise(resolve=>{release=resolve;})});
  const router = createPopupHashRouter(f.env,f.controller,error=>errors.push(error));
  f.win.location.hash = '#a'; router.setLibrary(library); await settle();
  const next = structuredClone(library); next.templates.calendar.inputs = [{path:['cards',0,'title'],label:'Titel',type:'text',required:true}];
  router.setLibrary(next); release(nativeHelpers(f)); await settle();
  assert.equal(f.cards.length,0); assert.equal(f.win.location.hash,'#a'); assert.equal(errors.length,1);
});

test('unopened native popup inputs do not evaluate unused dependencies', async () => {
  const library = aliasLibrary();
  library.templates.unopened = {name:'Unopened',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#unopened',cards:[{type:'markdown'}]},bindings:[{path:['cards',0,'content'],group:'unused'}],inputs:[{path:['cards',0,'title'],label:'Unused',type:'text',required:true}]};
  library.groups.unused = {name:'Unused'}; Object.defineProperty(library.groups.unused,'value',{get(){throw Error('Unused dependency read');}});
  const f = fixture(), errors = [], router = createPopupHashRouter(f.env,f.controller,error=>errors.push(error));
  f.win.location.hash = '#a'; router.setLibrary(library); await settle();
  assert.equal(errors.length,0); assert.equal(f.cards.length,1); f.controller.close();
});

test('removing the selected alias closes it while preserving the base and other aliases', async () => {
  const f = fixture(), library = aliasLibrary(), router = createPopupHashRouter(f.env,f.controller);
  f.win.location.hash = '#a'; router.setLibrary(library); await settle();
  const old = f.cards.at(-1); library.templates.calendar.popup_links.shift(); router.setLibrary(library); await settle();
  assert.equal(old.removed,true); assert.equal(f.win.location.hash,'');
  f.win.location.hash = '#b'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(f.cards.at(-1).config.hash,'#b'); f.controller.close();
});

test('alias updates inside the native factory discard obsolete exceptions and frame options', async () => {
  const {resolveTemplate} = await import('../custom_components/card_library/frontend/library-core.js');
  let library = aliasLibrary(); const f = fixture({validate:(_,ref)=>resolveTemplate(library,ref.template,ref.overrides)}), router = createPopupHashRouter(f.env,f.controller);
  const helpers = nativeHelpers(f); let first = true;
  f.win.loadCardHelpers = async () => ({createCardElement(config) {
    const card = helpers.createCardElement(config);
    if (first) {
      first = false; library = structuredClone(library);
      library.templates.calendar.popup_links[0].overrides[0].value = ['sensor.latest']; library.templates.calendar.popup_links[0].options.name = 'Latest A';
      router.setLibrary(library);
    }
    return card;
  }});
  f.win.location.hash = '#a'; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,2); assert.equal(f.cards[0].removed,true); assert.notEqual(f.cards[0].connected,true);
  assert.equal(f.cards[1].config.name,'Latest A'); assert.deepEqual(f.cards[1].config.cards[0].entities,['sensor.latest']); assert.equal(f.cards[1].connected,true);
  f.controller.close();
});

test('direct actions inherit central popup options while retaining explicit local exceptions', async () => {
  const {resolveTemplate} = await import('../custom_components/card_library/frontend/library-core.js');
  let library = aliasLibrary(); const f = fixture({validate:(_,ref)=>resolveTemplate(library,ref.template,ref.overrides)});
  f.controller.setLibrary(library); await f.controller.open({template:'calendar',popup:{name:'Local'}});
  assert.equal(f.cards.at(-1).config.name,'Local'); assert.equal(f.cards.at(-1).config.width_desktop,'1000px');
  library = structuredClone(library); library.templates.calendar.popup.options.width_desktop = '1200px'; f.controller.setLibrary(library);
  await f.controller.refreshManualPopup(); assert.equal(f.cards.at(-1).config.name,'Local'); assert.equal(f.cards.at(-1).config.width_desktop,'1200px');
  f.controller.close();
});

test('popup embeds a reference and preserves original Bubble options and local exceptions', () => {
  const config = bubblePopupConfig(action, '#test');
  assert.equal(config.type, 'custom:bubble-card');
  assert.equal(config.card_type, 'pop-up');
  assert.deepEqual(config.cards, [{type:'custom:library-card', template:'calendar', popup_content:'auto', overrides:action.overrides}]);
  assert.equal(config.styles, action.popup.styles);
  config.cards[0].overrides[0].value = 'changed';
  assert.equal(action.overrides[0].value, 'sensor.local');
});
test('a saved standalone Bubble popup supplies its original frame and linked content', () => {
  const saved = {type:'custom:bubble-card',card_type:'pop-up',hash:'#saved',name:'Saved popup',width_desktop:'920px',styles:'.bubble-pop-up {color:red}',cards:[{type:'markdown',content:'Original'}]};
  const config = bubblePopupConfig({template:'calendar',popup:{name:'Local title'}}, '#kalender', saved);
  assert.equal(config.name, 'Local title'); assert.equal(config.width_desktop, '920px');
  assert.equal(config.styles, saved.styles); assert.equal(config.hash, '#kalender');
  assert.deepEqual(config.cards, saved.cards);
  config.cards[0].content = 'Local copy';
  assert.equal(saved.cards[0].content, 'Original');
});
test('standalone popup cards retain their original Bubble grid and sizing options', () => {
  const saved = {type:'custom:bubble-card',card_type:'pop-up',hash:'#grid',cards:[
    {type:'markdown',content:'Left',grid_options:{columns:6,rows:2}},
    {type:'markdown',content:'Right',grid_options:{columns:6,rows:'auto'}}
  ]};
  const config = bubblePopupConfig({template:'calendar'},'#grid',saved);
  assert.deepEqual(config.cards,saved.cards);
  assert.equal(config.cards.length,2); assert.equal(config.cards[0].grid_options.columns,6);
});
test('a saved legacy popup stack supplies its native header without nesting another popup', () => {
  const saved = {type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#saved',name:'Legacy',width_desktop:'800px'},{type:'entities',entities:['light.room']}]};
  const config = bubblePopupConfig({template:'calendar'}, '#kalender', saved);
  assert.equal(config.name, 'Legacy'); assert.equal(config.width_desktop, '800px');
  assert.deepEqual(config.cards, [{type:'custom:library-card',template:'calendar',popup_content:'auto'}]);
});
test('native saved popup hashes open without extra popup metadata or a dashboard card', async () => {
  const f = fixture(); const router = createPopupHashRouter(f.env, f.controller);
  const library = {templates:{calendar:{name:'Native',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#kalender',name:'Native title',cards:[{type:'markdown',content:'Saved'}]}}},groups:{},people:{}};
  router.setLibrary(library); assert.equal(f.cards.length, 0);
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(f.cards.length, 1); assert.equal(f.cards[0].config.hash, '#kalender');
  assert.equal(f.cards[0].config.name, 'Native title');
  f.controller.close();
});
test('changing between native and plain popup templates replaces the content mode', async () => {
  const f = fixture(), router = createPopupHashRouter(f.env,f.controller);
  const library = {templates:{calendar:{name:'Popup',config:{type:'custom:bubble-card',card_type:'pop-up',cards:[]},popup:{hash:'#popup'}}},groups:{},people:{}};
  f.win.location.hash = '#popup'; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,1);
  library.templates.calendar.config = {type:'markdown',content:'Plain'}; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,2);
  library.templates.calendar.config = {type:'custom:bubble-card',card_type:'pop-up',cards:[]}; router.setLibrary(library); await settle();
  assert.equal(f.cards.length,3); f.controller.close();
});
test('invalid popup configuration cannot replace renderer, content or hash', () => {
  for (const key of ['type','card_type','cards','hash']) assert.throws(() => bubblePopupConfig({...action, popup:{[key]:'bad'}}, '#test'));
  for (const bad of [{template:''},{template:'x', overrides:{}},{template:'x',popup:[]},{template:'x',popup:null, overrides:NaN}]) assert.throws(() => bubblePopupConfig(bad, '#test'));
});
test('opens original Bubble on demand and HA state updates reach its instance', async () => {
  const f = fixture(); assert.equal(f.cards.length, 0);
  await f.controller.open(action);
  assert.equal(f.cards.length, 1);
  assert.equal(f.win.location.hash, f.cards[0].config.hash);
  const latest = {...f.root.hass, states:{changed:{state:'off'}}};
  f.recipients[0].hass = latest;
  assert.equal(f.cards[0].latestHass, latest);
  f.controller.close();
  assert.equal(f.cards[0].removed, true);
  assert.equal(f.win.location.href, 'https://ha.example/dashboard/0?test=1');
});
test('repeated opens retain one HA recipient and remove previous cards', async () => {
  const f = fixture(); await f.controller.open(action); const first = f.cards[0];
  await f.controller.open({...action, template:'second'});
  assert.equal(first.removed, true); assert.equal(f.recipients.length, 1);
  assert.notEqual(first.config.hash, f.cards[1].config.hash);
  f.controller.close();
});
test('missing Bubble resource does not modify the URL or create a card', async () => {
  const f = fixture({registered:false});
  await assert.rejects(f.controller.open(action), /nicht geladen/);
  assert.equal(f.cards.length, 0); assert.equal(f.win.location.hash, '');
});
test('older Bubble implementation fails visibly and cleans its host card', async () => {
  const f = fixture({supported:false});
  await assert.rejects(f.controller.open(action), /3.2.0/);
  assert.equal(f.cards[0].removed, true); assert.equal(f.win.location.hash, '');
});
test('missing templates and invalid protected overrides fail before rendering', async () => {
  const f = fixture({validate:() => {throw Error('missing template');}});
  await assert.rejects(f.controller.open(action), /missing template/);
  assert.equal(f.cards.length, 0); assert.equal(f.win.location.hash, '');
});
test('closing during helper loading prevents a late popup', async () => {
  let resolve; const f = fixture({helpers:() => new Promise(done => {resolve = done;})});
  const pending = f.controller.open(action); await Promise.resolve();
  f.controller.close(); resolve(nativeHelpers(f)); await pending;
  assert.equal(f.cards.length, 0); assert.equal(f.win.location.hash, '');
});
test('navigation during helper loading does not open on the next dashboard', async () => {
  let resolve; const f = fixture({helpers:() => new Promise(done => {resolve = done;})});
  const pending = f.controller.open(action); await Promise.resolve();
  f.win.location.pathname = '/dashboard/1'; resolve(nativeHelpers(f)); await pending;
  assert.equal(f.cards.length, 0); assert.equal(f.win.location.pathname, '/dashboard/1');
});
test('closing through Bubble hash navigation cleans up after its transition', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards[0].removed, true);
  f.recipients[0].hass = {states:{}};
  assert.equal(f.cards[0].latestHass, f.root.hass);
});
test('renderer initialization failures leave no card or changed URL', async () => {
  const f = fixture(); const create = f.env.document.createElement;
  f.env.document.createElement = tag => {const el = create(tag); if(tag === 'bubble-card') el.setConfig = () => {throw Error('renderer failed');}; return el;};
  await assert.rejects(f.controller.open(action), /renderer failed/);
  assert.notEqual(f.cards[0].connected, true); assert.equal(f.win.location.hash, '');
});

const routedLibrary = () => ({templates:{calendar:{name:'Kalender', config:{type:'markdown',content:'central'}, popup:{hash:'#kalender',options:{name:'Familie',width_desktop:'900px'}}}},groups:{},people:{}});
// Flush async imports and the native disconnection task before asserting mounts.
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setTimeout(resolve, 0)); };

test('normal HA navigation hash opens a central template without a dashboard reference card', async () => {
  const f = fixture(); const router = createPopupHashRouter(f.env, f.controller);
  router.setLibrary(routedLibrary()); assert.equal(f.cards.length, 0);
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(f.cards.length, 1);
  assert.equal(f.cards[0].config.hash, '#kalender');
  assert.equal(f.cards[0].config.cards[0].template, 'calendar');
  assert.equal(f.win.location.hash, '#kalender');
  f.controller.close();
});
test('direct hash links wait for library data and unrelated hashes create nothing', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller);
  router.setLibrary(null); assert.equal(f.cards.length, 0);
  router.setLibrary(routedLibrary()); await settle(); assert.equal(f.cards.length, 1);
  f.controller.close(); f.win.location.hash = '#unrelated'; f.win.dispatchEvent(new Event('hashchange')); await settle();
  assert.equal(f.cards.length, 1);
});
test('duplicate URL signals do not rebuild an already opened popup', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await settle();
  for (const type of ['location-changed','hashchange','popstate','bubble-card-location-changed']) f.win.dispatchEvent(new Event(type));
  router.setLibrary(routedLibrary()); await settle(); assert.equal(f.cards.length, 1);
  f.controller.close();
});
test('central popup options update the open original Bubble shell', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); const lib = routedLibrary(); router.setLibrary(lib); await settle();
  const first = f.cards[0]; lib.templates.calendar.popup.options.name = 'Neu'; router.setLibrary(lib); await settle();
  assert.equal(first.removed, true); assert.equal(f.cards[1].config.name, 'Neu'); assert.equal(f.win.location.hash, '#kalender');
  f.controller.close();
});
test('removing a central route closes and removes its active popup', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); const lib = routedLibrary(); router.setLibrary(lib); await settle();
  delete lib.templates.calendar; router.setLibrary(lib);
  assert.equal(f.cards[0].removed, true); assert.equal(f.win.location.hash, '');
});
test('returning to the hash through forward navigation opens it again', async () => {
  const f = fixture(); const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary());
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('popstate')); await settle();
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('popstate'));
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('popstate')); await settle();
  assert.equal(f.cards.length, 2); assert.equal(f.cards[0].removed, true);
  f.controller.close();
});
test('routing cancels slow hash opens after navigation away', async () => {
  let resolve; const f = fixture({helpers:() => new Promise(done => {resolve = done;})});
  f.win.location.hash = '#kalender'; const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await Promise.resolve();
  f.win.location.hash = '#unrelated'; f.win.dispatchEvent(new Event('location-changed'));
  resolve(nativeHelpers(f)); await settle(); assert.equal(f.cards.length, 0);
});
test('unsupported routed Bubble popup still reports its failure after URL cleanup', async () => {
  const f = fixture({supported:false}); const errors = []; f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller, error => errors.push(error)); router.setLibrary(routedLibrary());
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(errors.length, 1); assert.equal(f.cards[0].removed, true); assert.equal(f.win.location.hash, '');
});
test('resource bootstrap receives the library even with no library cards in the dashboard', async () => {
  const f = fixture(); const old = {window:globalThis.window, document:globalThis.document, customElements:globalThis.customElements};
  Object.assign(globalThis, f.env);
  let watchCount = 0;
  try {
    const controller = installPopupActions(() => {}, (_, update) => {watchCount++; update(routedLibrary());});
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(watchCount); assert.equal(f.cards.length, 0);
    f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('location-changed')); await settle();
    assert.equal(f.cards.length, 1); assert.equal(f.recipients.length, 1);
    controller.close();
  } finally {Object.assign(globalThis, old);}
});

test('closing an old popup cannot navigate back from a new dashboard with the same hash', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  await f.controller.open(action, {hash:'#kalender'});
  f.win.location.pathname = '/dashboard/other';
  f.controller.close();
  assert.equal(f.win.location.pathname, '/dashboard/other');
});
test('an obsolete failed validation cannot report an error after a later successful popup', async () => {
  let reject; const f = fixture({validate:(_, reference) => reference.template === 'slow' ? new Promise((_, fail) => {reject = fail;}) : undefined});
  const pending = f.controller.open({...action, template:'slow'});
  await f.controller.open(action);
  reject(Error('obsolete failure'));
  await pending;
  assert.equal(f.cards[0].removed, undefined);
  assert.equal(f.win.location.hash, f.cards[0].config.hash);
  f.controller.close();
});
test('failed hash requests can be retried with a normal second navigation click', async () => {
  let fail = true; const errors = [];
  const f = fixture({validate:() => {if(fail) throw Error('temporary failure');}});
  f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller, error => errors.push(error)); router.setLibrary(routedLibrary()); await settle();
  fail = false; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(errors.length, 1); assert.equal(f.cards.length, 1);
  f.controller.close();
});
test('browser page cache restores a hash popup without changing its URL on pagehide', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await settle();
  f.win.dispatchEvent(new Event('pagehide'));
  assert.equal(f.win.location.hash, '#kalender');
  assert.equal(f.cards[0].removed, true);
  f.win.dispatchEvent(new Event('pageshow')); await settle();
  assert.equal(f.cards.length, 2); f.controller.close();
});

test('null popup options fail validation instead of silently becoming defaults', () => {
  assert.throws(() => bubblePopupConfig({template:'calendar',popup:null}, '#test'));
});
test('a failing library callback cannot interrupt HA state propagation', () => {
  const f = fixture();
  f.controller.connect(() => {});
  assert.throws(() => f.controller.connect(() => {throw Error('library callback failed');}));
  assert.doesNotThrow(() => {f.recipients[0].hass = f.root.hass;});
});

test('invalid replacement leaves an existing working popup visible', async () => {
  const f = fixture({validate:(_, reference) => {if(reference.template === 'bad') throw Error('bad reference');}});
  await f.controller.open(action); const hash = f.win.location.hash;
  await assert.rejects(f.controller.open({...action,template:'bad'}), /bad reference/);
  assert.equal(f.cards[0].removed, undefined); assert.equal(f.win.location.hash, hash);
  f.controller.close();
});
test('temporarily unavailable library preserves the hash and reopens after recovery', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await settle();
  router.setLibrary(null); assert.equal(f.win.location.hash, '#kalender'); assert.equal(f.cards[0].removed, true);
  router.setLibrary(routedLibrary()); await settle(); assert.equal(f.cards.length, 2); f.controller.close();
});
test('connection changes invalidate an in-flight request validated against old library data', async () => {
  let resolve; const f = fixture({helpers:() => new Promise(done => {resolve = done;})});
  const pending = f.controller.open(action); await Promise.resolve();
  f.root.hass = {...f.root.hass, connection:{}};
  f.recipients[0].hass = f.root.hass;
  resolve(nativeHelpers(f)); await pending;
  assert.equal(f.cards.length, 0);
});

test('unavailable card helpers cannot remove an existing working popup', async () => {
  const f = fixture(); await f.controller.open(action); const hash = f.win.location.hash;
  f.win.loadCardHelpers = async () => ({});
  await assert.rejects(f.controller.open(action), /Kartenhelfer/);
  assert.equal(f.cards[0].removed, undefined); assert.equal(f.win.location.hash, hash); f.controller.close();
});

test('opening more-info in the same dashboard does not close or recreate the popup', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await settle();
  f.win.location.search = '?more-info-entity-id=sensor.example';
  f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards.length, 1); assert.equal(f.cards[0].removed, undefined);
  f.controller.close();
  assert.equal(f.win.location.search, '?more-info-entity-id=sensor.example');
});
test('same-dashboard query changes during loading do not lose the hash request', async () => {
  let resolve; const f = fixture({helpers:() => new Promise(done => {resolve = done;})});
  f.win.location.hash = '#kalender'; const router = createPopupHashRouter(f.env, f.controller);
  router.setLibrary(routedLibrary()); await Promise.resolve();
  f.win.location.search = '?more-info-entity-id=sensor.example'; f.win.dispatchEvent(new Event('location-changed'));
  resolve(nativeHelpers(f)); await settle();
  assert.equal(f.cards.length, 1); assert.equal(f.win.location.search, '?more-info-entity-id=sensor.example');
  f.controller.close();
});
test('popup teardown is idempotent when disconnection synchronously asks to suspend', async () => {
  const f = fixture(); await f.controller.open(action); let removals = 0;
  f.cards[0].remove = () => {removals++; if(removals < 3) f.controller.suspend();};
  f.controller.suspend(); assert.equal(removals, 1);
});
test('failed URL restoration still disconnects the temporary popup', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.history.replaceState = () => {throw Error('history blocked');};
  assert.throws(() => f.controller.close(), /history blocked/);
  assert.equal(f.cards[0].removed, true);
});

test('popup outer styles use the HA original-card factory', async () => {
  let factoryConfig;
  const f = fixture(); const helpers = nativeHelpers(f);
  f.win.loadCardHelpers = async () => ({createCardElement(config) {factoryConfig = structuredClone(config); const card = helpers.createCardElement(config); card.decorated = true; return card;}});
  await f.controller.open({...action, popup:{theme:'My theme',card_mod:{style:'ha-card { background: transparent; }'}}});
  assert.equal(factoryConfig.theme, 'My theme'); assert.equal(factoryConfig.card_mod.style, 'ha-card { background: transparent; }');
  assert.equal(f.cards[0].decorated, true); f.controller.close();
});
test('HA error placeholders are rejected instead of mounted as Bubble popups', async () => {
  const f = fixture({helpers:async () => ({createCardElement:() => ({localName:'hui-error-card'})})});
  await assert.rejects(f.controller.open(action), /originale Bubble/);
  assert.equal(f.cards.length, 0); assert.equal(f.win.location.hash, '');
});
test('routed popups do not emit duplicate public HA navigation events', async () => {
  const f = fixture(); let publicEvents = 0;
  f.win.addEventListener('location-changed', () => publicEvents++);
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary());
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(publicEvents, 1); assert.equal(f.cards.length, 1); f.controller.close();
});

test('popup card_mod mounts the original hui-card host and forwards HA states to Bubble', async () => {
  const f = fixture({wrapper:true});
  await f.controller.open({...action,popup:{card_mod:{style:'.bubble-pop-up { background: transparent; }'}}});
  assert.equal(f.wrappers.length, 1); assert.equal(f.wrappers[0].connected, true);
  assert.equal(f.wrappers[0].config.card_mod.style, '.bubble-pop-up { background: transparent; }');
  const hass = {...f.root.hass, states:{updated:{state:'on'}}}; f.recipients[0].hass = hass;
  assert.equal(f.cards[0].latestHass, hass);
  f.controller.close(); assert.equal(f.wrappers[0].removed, true); assert.equal(f.cards[0].removed, true);
});

test('handoff to a native popup does not disconnect the old shell behind the new scroll lock', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards[0].removed, undefined);
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards[0].removed, true);
});
test('quick native-popup handoff cancels disposal already scheduled by an initial close', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('location-changed'));
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards[0].removed, undefined); f.controller.close();
});

test('temporary library loss does not tear down a held shell beneath a native popup', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary()); await settle();
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  router.setLibrary(null); f.controller.close();
  assert.equal(f.cards[0].removed, undefined);
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 430));
  assert.equal(f.cards[0].removed, true);
});

for (const queryChange of [false, true]) test(queryChange
  ? 'more-info changes during a pending popup handoff preserve the new request'
  : 'duplicate signals during a pending popup handoff preserve the new request', async () => {
  const f = fixture(); const library = routedLibrary();
  library.templates.second = {name:'Zweites Popup',config:{type:'markdown',content:'second'},popup:{hash:'#second'}};
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(library);
  f.win.location.hash = '#kalender'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  let resolve;
  f.win.loadCardHelpers = () => new Promise(done => {resolve = done;});
  f.win.location.hash = '#second'; f.win.dispatchEvent(new Event('location-changed')); await settle();
  if (queryChange) f.win.location.search = '?more-info-entity-id=sensor.example';
  for (const type of ['location-changed','hashchange','popstate','bubble-card-location-changed']) f.win.dispatchEvent(new Event(type));
  resolve(nativeHelpers(f)); await settle();
  assert.equal(f.cards.length, 2);
  assert.equal(f.cards[0].removed, true);
  assert.equal(f.cards[1].config.hash, '#second');
  assert.equal(f.cards[1].removed, undefined);
  if (queryChange) assert.equal(f.win.location.search, '?more-info-entity-id=sensor.example');
  f.controller.close();
});

test('replacing the HA root disposes a held popup before attaching the new state host', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  const replacement = {hass:{connection:{},states:{}},shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  f.controller.connect(() => {});
  assert.equal(f.cards[0].removed, true);
  assert.equal(f.recipients.length, 2);
  assert.equal(f.win.location.hash, '#native-popup');
});

test('an explicit popup action replaces and disposes a shell held beneath a native popup', async () => {
  const f = fixture(); await f.controller.open(action);
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  await f.controller.open({...action,template:'second'});
  assert.equal(f.cards[0].removed, true);
  assert.equal(f.cards[1].removed, undefined);
  assert.equal(f.cards[1].config.cards[0].template, 'second');
  f.controller.close(); assert.equal(f.win.location.hash, '#native-popup');
});

test('query changes during deferred Bubble initialization do not cancel an explicit popup', async () => {
  const f = fixture({supported:false}); const pending = f.controller.open(action);
  await settle(); assert.equal(f.cards.length, 1);
  f.win.location.search = '?more-info-entity-id=sensor.example';
  f.win.dispatchEvent(new Event('location-changed'));
  f.cards[0].isStandalonePopUp = true;
  await pending;
  assert.equal(f.cards[0].removed, undefined);
  assert.equal(f.win.location.hash, f.cards[0].config.hash);
  f.controller.close();
});

test('HA root replacement preserves a routed hash and reopens it through the new library connection', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); const library = routedLibrary();
  f.controller.connect(() => router.setLibrary(library)); await settle();
  const replacement = {hass:{connection:{},states:{}},shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  f.controller.connect(() => {router.setLibrary(null); router.setLibrary(library);}); await settle();
  assert.equal(f.win.location.hash, '#kalender');
  assert.equal(f.cards.length, 2); assert.equal(f.cards[0].removed, true);
  assert.equal(f.cards[1].latestHass, replacement.hass); f.controller.close();
});

test('late states from the previous HA root cannot update or remove the current popup', async () => {
  const f = fixture(); await f.controller.open(action);
  const previousRecipient = f.recipients[0];
  const replacement = {hass:{connection:{},states:{new:{state:'on'}}},shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  await f.controller.open({...action,template:'second'});
  previousRecipient.hass = f.root.hass;
  assert.equal(f.cards[1].removed, undefined);
  assert.equal(f.cards[1].latestHass, replacement.hass); f.controller.close();
});

for (const throws of [false,true]) test(throws
  ? 'native factory failures preserve the working popup during replacement'
  : 'native error placeholders preserve the working popup during replacement', async () => {
  const f = fixture(); await f.controller.open(action); const hash = f.win.location.hash;
  f.win.loadCardHelpers = async () => ({createCardElement() {if (throws) throw Error('native config failure'); return {localName:'hui-error-card',remove(){}};}});
  await assert.rejects(f.controller.open({...action,template:'second'}));
  assert.equal(f.cards[0].removed, undefined); assert.equal(f.win.location.hash, hash);
  f.controller.close();
});

test('a foreign popup keeps its scroll lock when an older initializer is cancelled', async () => {
  const f = fixture({supported:false});
  f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(routedLibrary());
  await settle(); assert.equal(f.cards.length, 1);
  let foreignScrollLocked = true;
  const remove = f.cards[0].remove;
  // Native Bubble cleanup resets the shared body scroll lock on disconnection.
  f.cards[0].remove = () => {remove.call(f.cards[0]); foreignScrollLocked = false;};
  f.win.location.hash = '#native-popup'; f.win.dispatchEvent(new Event('location-changed'));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(f.cards[0].removed, undefined);
  assert.equal(foreignScrollLocked, true);
  f.win.location.hash = ''; f.win.dispatchEvent(new Event('location-changed'));
  f.controller.suspend(true);
});

for (const handoff of ['replacement', 'close', 'app remount']) test(`${handoff} waits for deferred native teardown before opening a new scroll lock`, async () => {
  const f = fixture(); let scrollLocked = false;
  const create = f.env.document.createElement;
  f.env.document.createElement = tag => {
    const card = create(tag);
    if (tag !== 'bubble-card') return card;
    const setHass = Object.getOwnPropertyDescriptor(card, 'hass').set;
    Object.defineProperty(card, 'hass', {set(hass) {
      setHass.call(this, hass);
      if (this.connected && f.win.location.hash === this.config.hash) scrollLocked = true;
    }});
    const remove = card.remove;
    // Current Bubble defers disconnectedCallback cleanup by one timer task.
    card.remove = () => {remove.call(card); setTimeout(() => {scrollLocked = false;}, 0);};
    return card;
  };
  f.win.location.hash = '#kalender'; await f.controller.open(action, {hash:'#kalender'});
  assert.equal(scrollLocked, true);
  if (handoff === 'close') f.controller.close();
  if (handoff === 'app remount') {
    const replacement = {hass:f.root.hass,shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
    f.env.document.querySelector = () => replacement; f.controller.connect(() => {});
  }
  f.win.location.hash = '#second'; f.win.dispatchEvent(new Event('location-changed'));
  await f.controller.open({...action,template:'second'}, {hash:'#second'});
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(scrollLocked, true);
  assert.equal(f.cards[0].removed, true); assert.equal(f.cards[1].removed, undefined);
  f.controller.close();
});

test('native factory navigation cannot attach an obsolete popup on another dashboard', async () => {
  const f = fixture(); const helpers = nativeHelpers(f);
  f.win.loadCardHelpers = async () => ({createCardElement(config) {
    const card = helpers.createCardElement(config);
    f.win.location.pathname = '/dashboard/next'; f.win.dispatchEvent(new Event('location-changed'));
    return card;
  }});
  await f.controller.open(action);
  assert.equal(f.cards[0].removed, true);
  assert.notEqual(f.cards[0].connected, true);
  assert.equal(f.win.location.pathname, '/dashboard/next'); assert.equal(f.win.location.hash, '');
});

test('a popup requested by a synchronous close action takes priority over the older replacement', async () => {
  const f = fixture(); await f.controller.open(action);
  let latest;
  f.win.addEventListener('location-changed', () => {
    if (!f.win.location.hash && !latest) latest = f.controller.open({...action,template:'latest'});
  });
  await f.controller.open({...action,template:'second'});
  await latest;
  const live = f.cards.filter(card => card.connected && !card.removed);
  assert.equal(live.length, 1);
  assert.equal(live[0].config.cards[0].template, 'latest');
  f.controller.suspend(true);
});

test('an HA app remount with the same library connection restores a routed popup', async () => {
  const f = fixture(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); const library = routedLibrary();
  let watchedConnection;
  const watch = hass => {
    if (watchedConnection === hass.connection) return;
    watchedConnection = hass.connection; router.setLibrary(library);
  };
  f.controller.connect(watch); await settle();
  const replacement = {hass:f.root.hass,shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  f.controller.connect(watch); f.win.dispatchEvent(new Event('location-changed')); await settle();
  assert.equal(f.cards.length, 2);
  assert.equal(f.cards[0].removed, true); assert.equal(f.cards[1].removed, undefined);
  assert.equal(f.win.location.hash, '#kalender'); f.controller.close();
});

test('a routed popup finishing helper loading after an app remount binds to the current root', async () => {
  let resolve, calls = 0;
  const f = fixture({helpers:() => ++calls === 1 ? new Promise(done => {resolve = done;}) : Promise.resolve(nativeHelpers(f))});
  f.win.location.hash = '#kalender'; const router = createPopupHashRouter(f.env, f.controller);
  router.setLibrary(routedLibrary()); await settle();
  const replacement = {hass:{...f.root.hass,states:{current:{state:'on'}}},shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  resolve(nativeHelpers(f)); await settle();
  assert.equal(f.recipients.length, 2);
  assert.equal(f.cards.length, 1); assert.equal(f.cards[0].latestHass, replacement.hass);
  assert.equal(f.win.location.hash, '#kalender'); f.controller.close();
});

test('a native factory cannot attach its popup to an app root replaced during creation', async () => {
  const f = fixture(); const helpers = nativeHelpers(f);
  f.win.loadCardHelpers = async () => ({createCardElement(config) {
    const card = helpers.createCardElement(config);
    f.env.document.querySelector = () => ({hass:f.root.hass,provideHass(){},shadowRoot:{append(){}}});
    return card;
  }});
  await f.controller.open(action);
  assert.equal(f.cards[0].removed, true); assert.notEqual(f.cards[0].connected, true);
  assert.equal(f.win.location.hash, '');
});

test('an obsolete native hass error cannot cancel a newer popup requested during that update', async () => {
  const f = fixture(); await f.controller.open(action); let latest;
  Object.defineProperty(f.cards[0], 'hass', {set() {
    latest = f.controller.open({...action,template:'latest'});
    throw Error('obsolete native renderer failure');
  }});
  f.recipients[0].hass = f.root.hass;
  await latest;
  const live = f.cards.filter(card => card.connected && !card.removed);
  assert.equal(live.length, 1); assert.equal(live[0].config.cards[0].template, 'latest');
  f.controller.close();
});

test('fast A to B to A navigation ignores helpers completed out of order', async () => {
  const pending = []; const f = fixture({helpers:() => new Promise(resolve => pending.push(resolve))});
  const library = routedLibrary();
  library.templates.second = {name:'Second',config:{type:'markdown',content:'second'},popup:{hash:'#second'}};
  const router = createPopupHashRouter(f.env, f.controller); router.setLibrary(library);
  for (const hash of ['#kalender', '#second', '#kalender']) {
    f.win.location.hash = hash; f.win.dispatchEvent(new Event('location-changed')); await settle();
  }
  assert.equal(pending.length, 3);
  pending[1](nativeHelpers(f)); pending[0](nativeHelpers(f)); await settle();
  assert.equal(f.cards.length, 0);
  pending[2](nativeHelpers(f)); await settle();
  assert.equal(f.cards.length, 1); assert.equal(f.cards[0].config.hash, '#kalender');
  f.controller.close();
});

test('central option updates during helper loading only create the current popup', async () => {
  const pending = []; const f = fixture({helpers:() => new Promise(resolve => pending.push(resolve))});
  f.win.location.hash = '#kalender'; const router = createPopupHashRouter(f.env, f.controller);
  const library = routedLibrary(); router.setLibrary(library); await settle();
  library.templates.calendar.popup.options.name = 'Latest'; router.setLibrary(library); await settle();
  pending[0](nativeHelpers(f)); await settle(); assert.equal(f.cards.length, 0);
  pending[1](nativeHelpers(f)); await settle();
  assert.equal(f.cards.length, 1); assert.equal(f.cards[0].config.name, 'Latest');
  f.controller.close();
});

test('central option updates inside the native factory discard its obsolete candidate', async () => {
  const f = fixture(); const library = routedLibrary(); f.win.location.hash = '#kalender';
  const router = createPopupHashRouter(f.env, f.controller); const helpers = nativeHelpers(f); let first = true;
  f.win.loadCardHelpers = async () => ({createCardElement(config) {
    const card = helpers.createCardElement(config);
    if (first) {
      first = false; library.templates.calendar.popup.options.name = 'Latest'; router.setLibrary(library);
    }
    return card;
  }});
  router.setLibrary(library); await settle();
  assert.equal(f.cards.length, 2); assert.equal(f.cards[0].removed, true);
  assert.notEqual(f.cards[0].connected, true); assert.equal(f.cards[1].config.name, 'Latest');
  assert.equal(f.cards[1].removed, undefined); f.controller.close();
});

test('an app remount during deferred native initialization cannot publish an obsolete popup hash', async () => {
  const f = fixture({supported:false}); const pending = f.controller.open(action);
  await settle(); assert.equal(f.cards.length, 1);
  const replacement = {hass:f.root.hass,shadowRoot:{append(){}},provideHass(host) {f.recipients.push(host); host.hass = this.hass;}};
  f.env.document.querySelector = () => replacement;
  f.cards[0].isStandalonePopUp = true;
  await pending;
  assert.equal(f.cards[0].removed, true); assert.equal(f.win.location.hash, '');
});

test('native hass and URL restoration failures cannot interrupt HA state propagation', async () => {
  const f = fixture(); await f.controller.open(action);
  Object.defineProperty(f.cards[0], 'hass', {set() {throw Error('native renderer failure');}});
  f.win.history.replaceState = () => {throw Error('history blocked');};
  assert.doesNotThrow(() => {f.recipients[0].hass = f.root.hass;});
  assert.equal(f.cards[0].removed, true);
});
