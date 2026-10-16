import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withPreloadedPopups} from '../custom_components/card_library/frontend/library-preloaded-popups.js';
import {bubblePopupConfig} from '../custom_components/card_library/frontend/library-popup.js';
import {popupTemplateRoutes, importLibrary} from '../custom_components/card_library/frontend/library-core.js';
import {retainBubblePopup} from '../custom_components/card_library/frontend/library-bubble-preload.js';
const state=()=>({templates:{menu:{name:'Menu',preload:true,config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#menu',cards:[{type:'markdown',content:'Central'}]},bindings:[],popup_links:[{hash:'#a'},{hash:'#b',preload:false}]}},groups:{},people:{}});
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
function fixture(){
 const cards=[],recipients=[],errors=[],location=new URL('https://ha.example/dashboard/0');
 const win=new EventTarget();Object.assign(win,{location,setTimeout,clearTimeout,console:{warn:message=>errors.push(message)}});
 win.history={state:{},pushState(_,__,url){location.href=new URL(url,location).href;},replaceState(_,__,url){location.href=new URL(url,location).href;}};
 const root={hass:{connection:{},states:{}},shadowRoot:{append(node){node.isConnected=true;}},dispatchEvent(){}};
 const createCard=config=>{const shadow={children:[],removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;return child;}};
  const card={localName:'bubble-card',config,isStandalonePopUp:true,shadowRoot:shadow,_standalonePopUpCardsActive:false,updates:0,updateBubbleCard(){this.updates++;this._managedCards=this.config.cards.map(config=>({config}));},remove(){this.removed=true;this.isConnected=false;},set hass(value){this.latestHass=value;},setConfig(value){this.config=value;}};
  card.popUp={parentNode:shadow};shadow.children.push(card.popUp);cards.push(card);return card;};
 win.loadCardHelpers=async()=>({createCardElement:createCard});
 const doc={querySelector:()=>root,createElement(){return {style:{},setAttribute(){},attachShadow(){this.shadowRoot={append(card){card.isConnected=true;}};},remove(){this.removed=true;}};}};
 const env={window:win,document:doc,customElements:{get:()=>true},Event};
 const calls=[],lazy={open:async(...args)=>calls.push(['open',...args]),close(){calls.push(['close']);},suspend(){calls.push(['suspend']);},setLibrary(){},cancelPending(){calls.push(['cancel']);},updateNativeContent(){return false;},connect(cb){recipients.push(cb);cb(root.hass);},getApplicationRoot:()=>root};
 const controller=withPreloadedPopups(env,lazy,bubblePopupConfig);
 return {controller,root,win,cards,calls,recipients,errors};
}
test('preload inheritance and explicit false survive library import',()=>{
 const library=importLibrary({format:'ha-card-library',version:2,library:state()});
 assert.deepEqual(popupTemplateRoutes(library,library.templates.menu).map(r=>[r.hash,r.preload]),[['#menu',true],['#a',true],['#b',false]]);
 for(const value of [null,'true',0,{},[]]){const s=state();s.templates.menu.preload=value;assert.throws(()=>importLibrary({format:'ha-card-library',version:2,library:s}),/Wahrheitswert/);s.templates.menu.preload=true;s.templates.menu.popup_links[0].preload=value;assert.throws(()=>importLibrary({format:'ha-card-library',version:2,library:s}),/Wahrheitswert/);}
});
test('only selected variants build without navigation and keep their native instances on repeated opens',async()=>{
 const f=fixture();f.controller.setLibrary(state());await settle();assert.equal(f.cards.length,2);assert.equal(f.win.location.hash,'');assert.equal(f.calls.length,0);
 const identities=[...f.cards];f.win.location.hash='#a';await f.controller.open({template:'menu',preload:true},{hash:'#a'});f.win.location.hash='';f.controller.close();f.win.location.hash='#a';await f.controller.open({template:'menu',preload:true},{hash:'#a'});
 assert.equal(f.cards.length,2);assert.deepEqual(f.cards,identities);assert(identities.every(c=>c.isConnected&&!c.removed));f.controller.suspend(true);
});
test('unrelated library updates reuse warm variants and invalid required values evict stale cards',async()=>{
 const f=fixture(),s=state();f.controller.setLibrary(s);await settle();const before=[...f.cards];
 const next=structuredClone(s);next.templates.unused={name:'Unused',config:{type:'markdown',content:'Unused'},bindings:[]};f.controller.setLibrary(next);await settle();assert.equal(f.cards.length,2);
 next.templates.menu.inputs=[{path:['title'],label:'Required',type:'text',required:true}];f.controller.setLibrary(next);await settle();assert(before.every(c=>c.removed));assert(f.errors.length);f.controller.suspend(true);
});
test('disabling preload, connection replacement and pagehide restore descriptors and dispose retained instances',async()=>{
 const f=fixture(),s=state();f.controller.connect(()=>{});f.controller.setLibrary(s);await settle();const before=[...f.cards];
 f.win.dispatchEvent(new Event('pagehide'));assert(before.every(c=>c.removed));assert(before.every(c=>!Object.getOwnPropertyDescriptor(c,'_standalonePopUpCardsActive').get));
 f.controller.setLibrary(s);await settle();const current=f.cards.slice(2);f.root.hass={connection:{},states:{}};f.recipients[0](f.root.hass);assert(current.every(c=>c.removed));
 const disabled=state();disabled.templates.menu.preload=false;f.controller.setLibrary(disabled);await settle();assert.equal(f.cards.length,4);f.controller.suspend(true);
});
test('lazy variants use the existing controller and malformed flags never navigate',async()=>{
 const f=fixture();await f.controller.open({template:'menu'});assert.equal(f.calls[0][0],'open');assert.equal(f.cards.length,0);
 await assert.rejects(()=>f.controller.open({template:'menu',preload:'yes'}),/Wahrheitswert/);assert.equal(f.calls.length,1);
});
test('the compatibility adapter retains only its own shell and restores native removal on release',()=>{
 const f=fixture();const helpers={};f.win.loadCardHelpers().then(v=>Object.assign(helpers,v));
 const parent={removeChild(child){child.parentNode=null;return child;}},popup={parentNode:parent};
 const card={isStandalonePopUp:true,config:{cards:[]},shadowRoot:parent,popUp:popup,_standalonePopUpCardsActive:false,updateBubbleCard(){}};
 const adapter=retainBubblePopup(card);card._standalonePopUpCardsActive=false;assert.equal(card._standalonePopUpCardsActive,true);parent.removeChild(popup);assert.equal(popup.parentNode,parent);
 const other={parentNode:parent};parent.removeChild(other);assert.equal(other.parentNode,null);adapter.release();assert.equal(card._standalonePopUpCardsActive,false);parent.removeChild(popup);assert.equal(popup.parentNode,null);
 assert.throws(()=>retainBubblePopup({}),/unterstützt/);
});
