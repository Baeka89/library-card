process.env.LIBRARY_NATIVE_UI = '1';
await import('./ui.test.js');

const {test} = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const {el, field, setSelectOptions, whenOpen, visibleInSections, captureDisclosures, confirmAction} = await import('../custom_components/card_library/frontend/library-ui.js');

test('library controls use actual native HA tags including booleans, color and multiline fields', () => {
  const host = new HTMLElement('div');
  assert.equal(el('button','Save',host).tagName,'ha-button');
  assert.equal(field(host,'Name').tagName,'ha-input');
  assert.equal(field(host,'Color','input',true,'color').type,'color');
  assert.equal(field(host,'Enabled','input',true,'checkbox').tagName,'ha-checkbox');
  assert.equal(field(host,'YAML','textarea').tagName,'ha-textarea');
  const text=field(host,'Hash'); text.readOnly=true; assert.equal(text.readonly,true);
  text.readOnly=false; assert.equal(text.readonly,false);
});
test('modern HA dropdown persists user selection once and ignores nested/programmatic events', () => {
  const select = field(new HTMLElement('div'),'Template','select');
  setSelectOptions(select,[['a','A'],['b','B']]); select.value='a';
  assert.deepEqual(select.options,[{value:'a',label:'A'},{value:'b',label:'B'}]);
  let changes=0;select.onchange=()=>{changes++;};
  const send=(value,target=select)=>select.dispatchEvent({type:'selected',target,detail:{value},stopPropagation(){}});
  send('b');assert.equal(select.value,'b');assert.equal(changes,1);
  send('b');send('a',new HTMLElement('nested'));assert.equal(changes,1);
  send(undefined);assert.equal(select.value,'');assert.equal(changes,2);
});
test('older HA dropdown uses HA list items and translates indexed selection', () => {
  const select=field(new HTMLElement('div'),'Choice','select');delete select.options;
  setSelectOptions(select,[['x','X'],['y','Y']]);select.value='x';select.libraryLastValue='x';
  assert.equal(select.children[0].tagName,'ha-list-item');
  let changes=0;select.onchange=()=>changes++;select.value='y';
  select.dispatchEvent({type:'selected',target:select,detail:{index:1},stopPropagation(){}});
  assert.equal(select.value,'y');assert.equal(changes,1);
});
test('nested native panels preserve expansion state and load expensive content only when opened', async () => {
  const owner={disclosures:new Map()},host=el('div');host.libraryScope='native';host.libraryOwner=owner;
  const section=el('details',undefined,host);el('summary','Settings',section);
  const child=el('div',undefined,section);let loads=0;whenOpen(section,()=>{loads++;});
  assert.equal(section.tagName,'ha-expansion-panel');assert.equal(visibleInSections(child),false);assert.equal(loads,0);
  const toggle=expanded=>section.dispatchEvent({type:'expanded-changed',target:section,detail:{expanded},stopPropagation(){}});
  toggle(true);await Promise.resolve();assert.equal(loads,1);assert.equal(visibleInSections(child),true);
  toggle(false);toggle(true);assert.equal(loads,1);captureDisclosures(owner,host);
  const replacement=el('details',undefined,host);el('summary','Settings',replacement);assert.equal(replacement.expanded,true);
  section.dispatchEvent({type:'expanded-changed',target:child,detail:{expanded:false},stopPropagation(){}});assert.equal(section.open,true);
});
test('native confirmation rejects actions when library changes while the dialog is open',async()=>{
  class Dialog extends HTMLElement {constructor(){super('ha-dialog');this.width='small';}remove(){this.removed=true;}}
  customElements.define('ha-dialog',Dialog);
  const previousQuery=document.querySelector, previousBody=document.body;
  const host=new HTMLElement('home-assistant');document.querySelector=()=>host;
  try {
    const owner={state:{library:{revision:1}},draft:{name:'before'},render(){this.rendered=true;}};
    const pending=confirmAction(owner,'Delete?');const dialog=host.children.at(-1);
    owner.draft.name='changed';dialog.children.at(-1).children.at(-1).onclick();
    assert.equal(await pending,false);assert.equal(owner.rendered,true);assert.equal(dialog.removed,true);
    const accepted=confirmAction(owner,'Delete?');host.children.at(-1).children.at(-1).children.at(-1).onclick();assert.equal(await accepted,true);
    const cancelled=confirmAction(owner,'Delete?');host.children.at(-1).dispatchEvent({type:'closed'});assert.equal(await cancelled,false);
  } finally {document.querySelector=previousQuery;document.body=previousBody;}
});


test('expanded child disclosures defer expensive work until closed ancestors open',async()=>{
  const host=el('div'),parent=el('details',undefined,host);el('summary','Parent',parent);const child=el('details',undefined,parent);el('summary','Child',child);child.open=true;let loads=0;
  whenOpen(child,()=>loads++,true);assert.equal(loads,0);
  parent.open=true;parent.dispatchEvent({type:'toggle'});await Promise.resolve();assert.equal(loads,1);
  parent.open=false;parent.dispatchEvent({type:'toggle'});parent.open=true;parent.dispatchEvent({type:'toggle'});await Promise.resolve();assert.equal(loads,2);
});
test('refreshing older native dropdown choices replaces options rather than appending duplicates',()=>{
  const select=field(new HTMLElement('div'),'Choice','select');delete select.options;
  setSelectOptions(select,[['a','A'],['b','B']]);setSelectOptions(select,[['c','C']]);assert.equal(select.children.length,1);assert.equal(select.children[0].value,'c');
});
test('owned hidden controls override layout display rules without touching original card editors',async()=>{
  const {css}=await import('../custom_components/card_library/frontend/library-ui.js');assert.match(css,/\[data-library-ui\]\[hidden\]\{display:none!important\}/);
});
