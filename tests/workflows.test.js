import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importLibrary,resolveTemplate,inputErrors,validateInputDefinitions} from '../custom_components/card_library/frontend/library-core.js';
import {canonical,differences,usageReference,usageAnalysis,installWorkflows} from '../custom_components/card_library/frontend/library-workflows.js';
const state=()=>({templates:{t:{name:'Template',config:{type:'custom:button-card',entity:'',variables:{entity_cover:''},styles:{card:[{padding:'12px'}]}},inputs:[{path:['entity'],label:'Entity',type:'entity',required:true,domains:['cover']}] }},groups:{},people:{}});

test('input definitions reject invalid metadata, unsafe paths, overlapping fields and binding overlaps',()=>{
  for(const field of [{path:['type'],label:'bad',type:'text'},{path:['entity'],label:'',type:'text'},{path:['entity'],label:'E',type:'select',options:[]},{path:['entity'],label:'E',type:'entity',domains:['bad.domain']},{path:['entity'],label:'E',type:'text',required:null}])assert.throws(()=>validateInputDefinitions({inputs:[field]}));
  assert.throws(()=>validateInputDefinitions({category:null}));assert.throws(()=>validateInputDefinitions({protected:null}));assert.throws(()=>validateInputDefinitions({inputs:null}));
  assert.throws(()=>validateInputDefinitions({inputs:[{path:['entity'],label:'A',type:'text'},{path:['entity'],label:'B',type:'text'}]}));
  assert.throws(()=>validateInputDefinitions({inputs:[{path:['entity'],label:'A',type:'text'}],bindings:[{path:['entity'],group:'g'}]}));
});
test('blank central entity defaults can be stored but required local values are validated',()=>{
  const source=state();assert.doesNotThrow(()=>importLibrary({format:'ha-card-library',version:2,library:source}));
  assert.equal(inputErrors(source.templates.t,source.templates.t.config).length,1);
  assert.equal(inputErrors(source.templates.t,{...source.templates.t.config,entity:'cover.kitchen'}).length,0);
  assert.equal(inputErrors(source.templates.t,{...source.templates.t.config,entity:'light.kitchen'}).length,1);
});
test('number, boolean, text and select input values are checked without treating false or zero as missing',()=>{
  const template={inputs:[{path:['n'],label:'N',type:'number',required:true},{path:['b'],label:'B',type:'boolean',required:true},{path:['s'],label:'S',type:'select',options:['one','two']},{path:['t'],label:'T',type:'text',required:true}]};
  assert.deepEqual(inputErrors(template,{n:0,b:false,s:'one',t:'yes'}),[]);
  assert.equal(inputErrors(template,{n:true,b:'yes',s:'three',t:'  '}).length,4);
});
test('difference preview ignores object key order and identifies local overrides that block central changes',()=>{
  assert.equal(canonical({a:1,b:2}),canonical({b:2,a:1}));assert.deepEqual(differences({a:1},{a:2}),[{path:['a'],before:1,after:2}]);
  const source=state(),after=structuredClone(source),local=[{path:['styles'],value:{card:[{padding:'4px'}]}}];after.templates.t.config.styles.card[0].padding='20px';
  assert.equal(canonical(resolveTemplate(source,'t',local)),canonical(resolveTemplate(after,'t',local)));
});
test('usage analysis resolves local entity variables and flags missing entities and local exceptions',()=>{
  const library=state();const use={config:{type:'custom:library-card',template:'t',overrides:[{path:['entity'],value:'cover.kitchen'},{path:['variables','entity_cover'],value:'cover.hall'}]}};
  const result=usageAnalysis(use,library,{states:{'cover.kitchen':{}}});assert.equal(result.exceptions,2);assert.deepEqual(result.missing,['cover.hall']);assert.deepEqual(result.errors,[]);
});
test('direct and hash popup variants resolve the correct local overrides without changing the template',()=>{
  const library=state();library.templates.t.popup={hash:'#base'};library.templates.t.popup_links=[{hash:'#hall',overrides:[{path:['entity'],value:'cover.hall'}]}];
  const before=structuredClone(library);const reference=usageReference({reference:{template:'t',popup_hash:'#hall'}},library);assert.equal(reference.overrides[0].value,'cover.hall');
  assert.deepEqual(library,before);assert.throws(()=>usageReference({reference:{template:'t',popup_hash:'#gone'}},library));
});
test('large differences are capped to keep the editor usable',()=>{const a={},b={};for(let i=0;i<600;i++){a['field'+i]=0;b['field'+i]=1;}assert.equal(differences(a,b).length,500);});


// Exercise the management workflows independently of the HA runtime. These
// doubles retain paths, events and snapshots so asynchronous race cases can be
// reproduced without a live dashboard.
const {installTools}=await import('../custom_components/card_library/frontend/library-manager-tools.js');
const ui=await import('../custom_components/card_library/frontend/library-ui.js');
class WorkflowElement {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.value='';this.isConnected=true;this.style={};}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(type,listener){(this.listeners[type] ||= []).push(listener);}
  dispatchEvent(event){for(const listener of this.listeners[event.type] || [])listener(event);this['on'+event.type]?.(event);}
}
globalThis.customElements={get:()=>undefined};
globalThis.document={createElement:tag=>new WorkflowElement(tag)};
let previewCreations=0;
globalThis.window={location:{href:'https://ha.example/lovelace/main'},confirm:()=>true,loadCardHelpers:async()=>({createCardElement:config=>{previewCreations++;const card=new WorkflowElement('native');card.config=config;return card;}})};
const helpers={...ui,button:(parent,label,click)=>{const node=ui.el('button',label,parent);node.onclick=click;return node;},select:(parent,items,value,change)=>{const node=ui.field(parent,'Choice','select');ui.setSelectOptions(node,items);node.value=value;node.onchange=()=>change(node.value);return node;}};
class WorkflowManager {
  constructor(library=state()){this.state={library:{...structuredClone(library),revision:0},listeners:new Set()};this.draft=structuredClone(this.state.library);this._hass={states:{}};this.selected='t';}
  render(){this.renderCount=(this.renderCount || 0)+1;}
  edit(){this.dirty=true;}
  assertLibraryConnection(state){if(this.state!==state)throw Error('Connection changed');}
}
installTools(WorkflowManager,helpers);installWorkflows(WorkflowManager,helpers);
const walk=node=>[node,...node.children.flatMap(walk)];
const named=(root,label)=>walk(root).find(node=>node.textContent===label);
const namedField=(root,label)=>named(root,label).libraryParent.children.find(node=>['input','textarea','select'].includes(node.libraryTag));
const hashUse=()=>({dashboard:'Home',view:'Main',url_path:null,card_path:['views',0,'cards',0],path:['views',0,'cards',0,'tap_action'],config:{type:'button',tap_action:{action:'navigate',navigation_path:'#hall'}},reference:{template:'t',popup_hash:'#hall'}});

 test('hash-use save acknowledgement advances shared state without waiting for subscription',async()=>{
  const source=state();source.templates.t.inputs=[];source.templates.t.popup_links=[{hash:'#hall',overrides:[]}];const manager=new WorkflowManager(source),use=hashUse();let notices=0;
  manager.state.listeners.add(()=>notices++);
  manager.localUse={use,reference:usageReference(use,manager.state.library),original:use.config.tap_action,revision:0,snapshot:{mode:'storage',fingerprint:'a'}};
  manager.localUse.reference.overrides=[{path:['entity'],value:'cover.local'}];
  manager._hass.callWS=async message=>({...structuredClone(message.library),revision:message.revision+1});
  await manager.saveUsage();assert.equal(manager.state.library.revision,1);assert.equal(manager.localUse.revision,1);assert.equal(notices,1);
  manager.localUse.reference.overrides=[{path:['entity'],value:'cover.next'}];await manager.saveUsage();assert.equal(manager.state.library.revision,2);assert.equal(notices,2);
});
test('hash save acknowledgements never replace a newer snapshot and reject invalid replies atomically',()=>{
  const manager=new WorkflowManager(),stateRef=manager.state,newer={...structuredClone(stateRef.library),revision:8};stateRef.library=newer;
  manager.applyLibraryAcknowledgement(stateRef,{...structuredClone(newer),revision:4},3);assert.equal(stateRef.library,newer);
  let changed=false;for(const reply of [{...newer,revision:8.5},{...newer,revision:3},{...newer,templates:{bad:{name:'Invalid',config:{}}}}])assert.throws(()=>manager.applyLibraryAcknowledgement(stateRef,reply,3,()=>{changed=true;}));
  assert.equal(changed,false);assert.equal(stateRef.library,newer);
});
test('local previews participate in HA state forwarding, reuse unchanged cards and rebuild lazy placeholders',async()=>{
  const manager=new WorkflowManager(),host=new WorkflowElement(),use={config:{type:'custom:library-card',template:'t'}};const before=previewCreations;
  await manager.previewUsage(host,use);const first=host.previewChild;assert.equal(host.attributes['data-library-preview'],'');assert.equal(first,host.children[0]);
  manager._hass={states:{'cover.new':{}}};await manager.previewUsage(host,use);assert.equal(host.previewChild,first);assert.equal(first.hass,manager._hass);assert.equal(previewCreations,before+1);
  first.dispatchEvent({type:'ll-rebuild',stopPropagation(){}});await new Promise(resolve=>setImmediate(resolve));assert.notEqual(host.previewChild,first);assert.equal(previewCreations,before+2);
});
test('editing input metadata in another template cannot remove fields there or reuse the previous draft',()=>{
  const source=state();source.templates.b={name:'Other',config:{type:'entities'},inputs:[{path:['entity'],label:'Other entity',type:'entity'}]};const manager=new WorkflowManager(source),first=new WorkflowElement();
  manager.metadataPanel(first,manager.draft.templates.t);named(first,'Eingabefeld bearbeiten').onclick();manager.selected='b';const second=new WorkflowElement();manager.metadataPanel(second,manager.draft.templates.b);
  assert.equal(namedField(second,'Beschriftung').value,'');namedField(second,'Feldpfad').value='title';namedField(second,'Beschriftung').value='Title';namedField(second,'Choice').value='text';named(second,'Eingabefeld speichern').onclick();
  assert.equal(manager.draft.templates.b.inputs.length,2);assert.equal(manager.draft.templates.b.inputs[0].label,'Other entity');
});
test('change review uses the new alias overrides and reports a removed hash instead of an unchanged card',()=>{
  const source=state();source.templates.t.inputs=[];source.templates.t.popup_links=[{hash:'#hall',overrides:[{path:['entity'],value:'cover.old'}]}];const manager=new WorkflowManager(source),use=hashUse();manager.inventory={cards:[{...use,path:use.card_path}],failures:[]};
  manager.draft.templates.t.popup_links[0].overrides=[{path:['entity'],value:'cover.new'}];let host=new WorkflowElement();manager.reviewPanel(host);assert.ok(walk(host).some(node=>String(node.textContent).includes('Kartenkonfiguration wird aktualisiert')));
  delete manager.draft.templates.t.popup_links;host=new WorkflowElement();manager.reviewPanel(host);assert.ok(walk(host).some(node=>String(node.textContent).includes('Popup-Verknüpfung wurde geändert')));
});
test('deleted comparison templates produce a recoverable message',()=>{
  const manager=new WorkflowManager();manager.comparePair=[{config:{type:'custom:library-card',template:'gone'}},{config:{type:'custom:library-card',template:'t'}}];const host=new WorkflowElement();assert.doesNotThrow(()=>manager.compareUsePanel(host));assert.ok(walk(host).some(node=>node.className==='error'));
});
test('dashboard deletion scan cannot install old-connection inventory or delete its replacement draft',async()=>{
  const manager=new WorkflowManager(),oldDraft=manager.draft;let finish;
  manager._hass.callWS=message=>message.type==='lovelace/dashboards/list'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(message.type==='lovelace/config'?{views:[]}:[]);
  const pending=manager.deleteItem('templates','t');manager.state={library:{...state(),revision:1}};manager.draft=structuredClone(manager.state.library);finish([]);
  await assert.rejects(()=>pending,/Connection changed/);assert.ok(manager.draft.templates.t);assert.ok(oldDraft.templates.t);assert.equal(manager.inventory,undefined);
});
test('plain YAML card import refuses an old-connection reply before adding it to a new library',async()=>{
  const manager=new WorkflowManager(),host=new WorkflowElement();manager.yamlDraft='type: entities';let finish;manager._hass.callWS=()=>new Promise(resolve=>{finish=resolve;});manager.addTemplate=()=>{throw Error('Must not import');};
  manager.yamlPanel(host);const pending=named(host,'YAML als Karte übernehmen').onclick();manager.state={library:{...state(),revision:1}};manager.draft=structuredClone(manager.state.library);finish({type:'entities'});await pending;
  assert.match(manager.notice,/Connection changed/);assert.equal(manager.yamlDraft,'type: entities');
});

test('popup comparisons include inherited frame options and local styling exceptions',()=>{
  const source=state();source.templates.t.popup={hash:'#base',options:{name:'Central',width_desktop:'500px'}};
  source.templates.t.popup_links=[{hash:'#hall',options:{width_desktop:'700px',bg_color:'#ff8800'}}];
  const analysis=usageAnalysis(hashUse(),source,{states:{}});
  assert.deepEqual(analysis.popupOptions,{name:'Central',width_desktop:'700px',bg_color:'#ff8800'});
  assert.equal(analysis.exceptions,2);
  const manager=new WorkflowManager(source);manager.comparePair=[hashUse(),{...hashUse(),reference:{template:'t',popup_hash:'#base'}}];const host=new WorkflowElement();manager.compareUsePanel(host);
  assert.ok(walk(host).some(node=>String(node.textContent).includes('popup → width_desktop')));
});
test('change review detects option-only popup updates and newly required local inputs',()=>{
  const source=state();source.templates.t.inputs=[];source.templates.t.popup={hash:'#base',options:{width_desktop:'500px'}};source.templates.t.popup_links=[{hash:'#hall'}];
  const manager=new WorkflowManager(source),use=hashUse();manager.inventory={cards:[{...use,path:use.card_path}],failures:[]};
  manager.draft.templates.t.popup.options.width_desktop='700px';manager.draft.templates.t.inputs=[{path:['new_entity'],label:'New required entity',type:'entity',required:true}];
  const host=new WorkflowElement();manager.reviewPanel(host);
  assert.ok(walk(host).some(node=>String(node.textContent).includes('Kartenkonfiguration wird aktualisiert')));
  assert.ok(walk(host).some(node=>String(node.textContent).includes('Pflichtfeld fehlt: New required entity')));
});
