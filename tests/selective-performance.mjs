// Actual frontend modules, simulated DOM/HA: measures work, not live HA load time.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class Element {
  constructor(){this.children=[];this.listeners={};this.isConnected=true;}
  attachShadow(){return this.shadowRoot=new Element();}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  addEventListener(type,listener){(this.listeners[type] ||= []).push(listener);}
}
const counts={templateReads:0,clones:0,creations:0,updates:0,helpers:0},registry=new Map();
const nativeClone=globalThis.structuredClone;globalThis.structuredClone=value=>{counts.clones++;return nativeClone(value);};
globalThis.HTMLElement=Element;globalThis.customElements={define:(id,type)=>registry.set(id,type),get:id=>registry.get(id)};
globalThis.document={createElement:id=>registry.has(id)?new (registry.get(id))():new Element()};
globalThis.window={customCards:[],loadCardHelpers:async()=>{counts.helpers++;return {createCardElement:config=>{counts.creations++;const card=new Element();card.config=config;card.setConfig=config=>{counts.updates++;card.config=config;};return card;}};}};
await import(pathToFileURL(resolve(process.argv[2] || '.', 'custom_components/card_library/frontend/card-library.js')));
let receive;const hass={connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};
const snapshot=revision=>({revision,templates:{shared:{get config(){counts.templateReads++;return {type:'entities',entities:Array.from({length:1000},(_,i)=>`sensor.item_${i}`)};},bindings:[]},unrelated:{config:{type:'markdown',content:'Changed '+revision},bindings:[]}},groups:{},people:{}});
const cards=Array.from({length:20},(_,i)=>{const card=document.createElement('library-card');card.setConfig({template:'shared',overrides:[{path:['title'],value:'Local '+i}]});return card;});
const start=performance.now();cards[0].hass=hass;receive(snapshot(0));for(const card of cards.slice(1))card.hass=hass;await new Promise(resolve=>setImmediate(resolve));const initial={...counts};
for(let revision=1;revision<=3;revision++){receive(snapshot(revision));await new Promise(resolve=>setImmediate(resolve));}
console.log(JSON.stringify({scenario:'20 distinct references, 1000 entities, 3 unrelated template updates',initial,total:counts,elapsedMs:performance.now()-start},null,2));
