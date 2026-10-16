import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopeOriginalEditor} from '../custom_components/card_library/frontend/library-editor-scope.js';

class Event {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
  stopPropagation() { this.stopped = true; }
}
globalThis.CustomEvent = Event;

class Element {
  constructor(localName = 'div') { this.localName = localName; this.children = []; this.listeners = new Map(); this.isConnected = true; }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  remove() { this.isConnected = false; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  attachShadow() { this.shadowRoot = new Element('#shadow-root'); this.shadowRoot.host = this; return this.shadowRoot; }
  getRootNode() { let node = this; while (node.parentNode) node = node.parentNode; return node; }
  addEventListener(type, listener) { const listeners = this.listeners.get(type) || []; listeners.push(listener); this.listeners.set(type, listeners); }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    if (!event.stopped && event.bubbles) (this.parentNode || (event.composed && this.host))?.dispatchEvent(event);
    return true;
  }
}
class NativeDialog extends Element {
  constructor() { super('hui-dialog-edit-card'); this._open = false; this.attachShadow(); }
  showDialog(params) { this._params = params; this._cardConfig = params.cardConfig; this._open = true; return Promise.resolve(); }
  closeDialog() { this._open = false; return true; }
  cancel() { this._open = false; this._params = undefined; this._cardConfig = undefined; }
}
const popup = () => ({type:'custom:bubble-card', card_type:'pop-up', hash:'#test', cards:[{type:'markdown', content:'Before'}]});
class BubbleEditor extends Element {
  constructor(outer, config = popup()) { super('bubble-card-editor'); this.outer = outer; this._config = config; this.hass = {states:{}}; this.lovelace = {views:[]}; }
  _getActiveEditCardDialog() { return this.outer; }
  _captureStandaloneParentDialogParams() { return {...this._getActiveEditCardDialog()?._params, cardConfig: structuredClone(this._config)}; }
  _openStandaloneCardDialog() { return this._captureStandaloneParentDialogParams(); }
  setConfig(config) { this._config = config; }
}

function setup({registered = true, observer} = {}) {
  const app = new Element('home-assistant'); app.attachShadow();
  const outer = new NativeDialog();
  const saved = [];
  outer._params = {cardConfig:{type:'custom:library-manager'}, saveCardConfig:async config => saved.push(config)};
  app.shadowRoot.append(outer);
  const registry = new Map(registered ? [['hui-dialog-edit-card', NativeDialog]] : []);
  const env = {
    document: {querySelector:() => app, createElement:tag => {
      const element = registry.has(tag) ? new (registry.get(tag))() : new Element(tag);
      element.localName = tag; return element;
    }},
    customElements: {get:tag => registry.get(tag), define:(tag, constructor) => registry.set(tag, constructor)},
    MutationObserver:observer
  };
  return {app, outer, saved, env};
}

test('Bubble child save and parent save stay in the library and cannot replace the manager', async () => {
  const {app, outer, saved, env} = setup();
  const editor = new BubbleEditor(outer), dashboardCallback = outer._params.saveCardConfig;
  const prototypeGetter = BubbleEditor.prototype._getActiveEditCardDialog;
  const prototypeShow = NativeDialog.prototype.showDialog;
  const scope = scopeOriginalEditor(editor, env);
  const changes = []; editor.addEventListener('config-changed', event => changes.push(event.detail.config));
  const captured = editor._openStandaloneCardDialog();
  const local = editor._getActiveEditCardDialog();
  assert.ok(local instanceof NativeDialog);
  assert.equal(local.localName, 'library-popup-card-dialog');
  assert.notEqual(local, outer);
  assert.equal(app.shadowRoot.children.length, 2);
  assert.equal(local._cardConfig, undefined, 'no hidden original editor or preview is built to seed parameters');
  assert.notEqual(captured.saveCardConfig, dashboardCallback);
  let child = structuredClone(editor._config);
  await local.showDialog({cardConfig:child.cards[0], saveCardConfig:async value => { child.cards[0] = value; }});
  assert.equal(editor._getActiveEditCardDialog()._params.cardConfig.type, 'markdown');
  await local._params.saveCardConfig({type:'markdown', content:'After'});
  local.closeDialog();
  await local.showDialog({...captured, cardConfig:child});
  await local._params.saveCardConfig(local._params.cardConfig);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].cards[0].content, 'After');
  assert.equal(editor._config.cards[0].content, 'After');
  assert.deepEqual(saved, []);
  assert.equal(outer._params.cardConfig.type, 'custom:library-manager');
  assert.equal(outer._params.saveCardConfig, dashboardCallback);
  assert.equal(BubbleEditor.prototype._getActiveEditCardDialog, prototypeGetter);
  assert.equal(NativeDialog.prototype.showDialog, prototypeShow);
  const unrelated = new BubbleEditor(outer);
  assert.equal(unrelated._getActiveEditCardDialog(), outer);
  scope.dispose();
  assert.equal(editor._getActiveEditCardDialog, prototypeGetter);
  assert.equal(app.shadowRoot.children.length, 1);
});

test('canceling the isolated parent leaves the library and outer Dashboard unchanged', async () => {
  const {outer, saved, env} = setup();
  const editor = new BubbleEditor(outer), initial = structuredClone(editor._config);
  const scope = scopeOriginalEditor(editor, env);
  let changes = 0; editor.addEventListener('config-changed', () => changes++);
  const parent = editor._captureStandaloneParentDialogParams(), local = editor._getActiveEditCardDialog();
  await local.showDialog({...parent, cardConfig:{...initial, name:'Discard'}});
  local.cancel();
  assert.deepEqual(editor._config, initial);
  assert.equal(changes, 0);
  assert.deepEqual(saved, []);
  assert.equal(outer._params.cardConfig.type, 'custom:library-manager');
  scope.dispose();
});

test('nested original HA stack editors receive a popup change through their own config-changed path', async () => {
  const {outer, env} = setup();
  const stack = new Element('hui-card-element-editor'); stack.attachShadow();
  const bubble = new BubbleEditor(outer); stack.shadowRoot.append(bubble);
  const changes = [];
  bubble.addEventListener('config-changed', event => {
    event.stopPropagation();
    stack.dispatchEvent(new Event('config-changed', {detail:{config:{type:'vertical-stack', cards:[event.detail.config]}}, bubbles:true, composed:true}));
  });
  stack.addEventListener('config-changed', event => changes.push(event.detail.config));
  const scope = scopeOriginalEditor(stack, env);
  const captured = bubble._captureStandaloneParentDialogParams();
  await captured.saveCardConfig({...popup(), name:'Changed'});
  assert.equal(changes[0].type, 'vertical-stack');
  assert.equal(changes[0].cards[0].name, 'Changed');
  scope.dispose();
});

test('new Bubble editors inside the owned native dialog reuse its safe current context', () => {
  const {outer, app, env} = setup();
  const root = new BubbleEditor(outer), scope = scopeOriginalEditor(root, env);
  const local = root._getActiveEditCardDialog();
  local.showDialog({...local._params, cardConfig:{...popup(), name:'Native parent'}});
  const nested = new BubbleEditor(outer); local.shadowRoot.append(nested);
  scope.refresh();
  assert.equal(nested._getActiveEditCardDialog(), local);
  assert.equal(nested._captureStandaloneParentDialogParams().saveCardConfig, local._params.saveCardConfig);
  assert.equal(app.shadowRoot.children.length, 2, 'native dialog does not create another hidden popup editor');
  scope.dispose();
});

test('late HA shadow roots are discovered and every instance override is removed on disposal', async () => {
  class Observer {observe() {} disconnect() {this.disconnected = true;}}
  const {outer, env} = setup({observer:Observer});
  const root = new Element('hui-card-element-editor'), scope = scopeOriginalEditor(root, env);
  const editor = new BubbleEditor(outer);
  root.attachShadow().append(editor);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.notEqual(editor._getActiveEditCardDialog(), outer);
  assert.equal(scopeOriginalEditor(root, env), scope);
  scope.dispose();
  assert.equal(editor._getActiveEditCardDialog(), outer);
});

test('unavailable native popup dialogs report a visible error and never fall back to the dashboard callback', async () => {
  const {outer, saved, env} = setup({registered:false});
  const editor = new BubbleEditor(outer), scope = scopeOriginalEditor(editor, env);
  const changes = []; editor.addEventListener('config-changed', event => changes.push(event.detail));
  assert.equal(editor._getActiveEditCardDialog(), null);
  assert.equal(editor._getActiveEditCardDialog(), null);
  assert.equal(await editor._openStandaloneCardDialog(), false);
  assert.equal(await editor._openStandaloneCardDialog(), false);
  assert.equal(changes.length, 1);
  assert.match(changes[0].error, /sichere Popup-Unterkarteneditor/);
  assert.equal(changes[0].config.type, 'custom:bubble-card');
  assert.deepEqual(saved, []);
  assert.equal(outer._params.cardConfig.type, 'custom:library-manager');
  scope.dispose();
});

test('a stale scoped dialog cannot save into a different template after the original editor disconnected', async () => {
  const {outer, env} = setup();
  const editor = new BubbleEditor(outer), scope = scopeOriginalEditor(editor, env);
  const params = editor._captureStandaloneParentDialogParams();
  editor.isConnected = false;
  await assert.rejects(() => params.saveCardConfig({...popup(), name:'Stale'}), /nicht mehr geöffnet/);
  assert.equal(editor._config.name, undefined);
  scope.dispose();
});

test('an incompatible Bubble standalone API is visibly blocked without calling its unsafe entry point', async () => {
  const {outer, saved, env} = setup();
  const editor = new BubbleEditor(outer); let invoked = false, error;
  editor._captureStandaloneParentDialogParams = undefined;
  editor._openStandaloneCardDialog = () => { invoked = true; return outer._params.saveCardConfig(popup()); };
  editor.addEventListener('config-changed', event => { error = event.detail.error; });
  const original = editor._openStandaloneCardDialog, scope = scopeOriginalEditor(editor, env);
  assert.equal(await editor._openStandaloneCardDialog(), false);
  assert.equal(invoked, false);
  assert.match(error, /Bubble-Card-Version/);
  assert.deepEqual(saved, []);
  scope.dispose();
  assert.equal(editor._openStandaloneCardDialog, original);
});
