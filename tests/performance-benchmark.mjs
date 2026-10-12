// Controlled frontend-work benchmark. No HA/network timing is measured here.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
let nodes=0, factories=0, cards=0;
class Element {
  constructor(tag=''){this.tagName=tag;this.children=[];this.listeners={};this.isConnected=true;this.value='';nodes++;}
  attachShadow(){return this.shadowRoot=new Element('shadow');}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(){}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(f=>f!==fn);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn(event);}
}
class Editor extends Element {setConfig(config){this.config=config;}}
class Card extends Element {static getConfigElement(){factories++;return new Editor('native-editor');}}
const registry=new Map([['calendar',Card]]);
globalThis.HTMLElement=Element;
globalThis.customElements={get:tag=>registry.get(tag),define:(tag,type)=>registry.set(tag,type)};
globalThis.document={createElement:tag=>registry.has(tag)?new (registry.get(tag))():new Element(tag)};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;Object.assign(this,options);}};
globalThis.window={customCards:[],location:{href:'https://ha.example/'},loadCardHelpers:async()=>({createCardElement:config=>{cards++;const card=new Card('native-card');card.config=config;return card;}})};
const source=resolve(process.argv[2]||'.','custom_components/card_library/frontend/card-library.js');
await import(pathToFileURL(source));
const rows=Number(process.argv[3]||1000);
const template=index=>({name:'Template '+index,config:{type:'custom:calendar',rows:Array.from({length:rows},(_,i)=>({entity:'sensor.value_'+i,title:'Row '+i,color:'#abcdef'}))},bindings:[]});
const library={revision:1,templates:{a:template(1),b:template(2)},groups:{},people:{}};
let callback;
const hass={user:{is_admin:true},states:{},connection:{subscribeMessage:async cb=>{callback=cb;return()=>{};}},callWS:async()=>[]};
const manager=document.createElement('library-manager');manager.hass=hass;callback(library);
const before={nodes,factories,cards};const start=performance.now();
manager.selected='a';
for(let i=0;i<5;i++){manager.render();await new Promise(resolve=>setImmediate(resolve));}
console.log(JSON.stringify({scenario:`Two templates, ${rows} rows each; five menu renders with previews/advanced panels closed`,nodes:nodes-before.nodes,editorFactories:factories-before.factories,previewCards:cards-before.cards,elapsedMs:Number((performance.now()-start).toFixed(2))}));
