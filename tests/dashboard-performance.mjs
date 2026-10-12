// Controlled frontend work-count benchmark; no live Home Assistant timing.
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
const registry=new Map();let creations=0,updates=0,helpers=0,reads=0;
globalThis.HTMLElement=Element;globalThis.customElements={define:(id,type)=>registry.set(id,type),get:id=>registry.get(id)};
globalThis.document={createElement:id=>registry.has(id)?new (registry.get(id))():new Element()};
globalThis.window={customCards:[],loadCardHelpers:async()=>{helpers++;return {createCardElement:config=>{creations++;const card=new Element();card.config=config;card.setConfig=config=>{updates++;card.config=config;};return card;}};}};
await import(pathToFileURL(resolve(process.argv[2] || '.', 'custom_components/card_library/frontend/card-library.js')));
let receive;const hass={connection:{subscribeMessage:async callback=>{receive=callback;return()=>{};}}};
const snapshot=color=>({templates:{shared:{name:'Shared',get config(){reads++;return {type:'entities',title:color,entities:Array.from({length:1000},(_,i)=>`sensor.item_${i}`)};},bindings:[]}},groups:{},people:{}});
const cards=Array.from({length:20},()=>{const card=document.createElement('library-card');card.setConfig({template:'shared'});return card;});
const start=performance.now();cards[0].hass=hass;receive(snapshot('initial'));for(const card of cards.slice(1))card.hass=hass;await new Promise(resolve=>setImmediate(resolve));
const initial={creations,updates,helpers,templateReads:reads};receive(snapshot('changed'));await new Promise(resolve=>setImmediate(resolve));
console.log(JSON.stringify({references:cards.length,entitiesPerCard:1000,initial,total:{creations,updates,helpers,templateReads:reads},elapsedMs:performance.now()-start},null,2));
