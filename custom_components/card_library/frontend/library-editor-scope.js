// Bubble's standalone popup editor otherwise discovers HA's outer dashboard
// dialog and retains its dashboard save callback. Keep its original editor and
// native child dialogs, but give each embedded editing surface its own scope.
// The compatibility hook is confined to the actual editor instances we own.
const SCOPES = new WeakMap();
const OWNED_DIALOG = Symbol('library-editor-dialog');
const SCOPED_DIALOG_TAG = 'library-popup-card-dialog';

const nameOf = node => (node?.localName || node?.tagName || '').toLowerCase();
const configOf = editor => editor?._config || editor?.value || editor?.config;

function visitTree(node, visit, roots) {
  if (!node) return;
  visit(node);
  if (node.shadowRoot) {
    roots.add(node.shadowRoot);
    visitTree(node.shadowRoot, visit, roots);
  }
  for (const child of node.children || []) visitTree(child, visit, roots);
}

function safeAncestorDialog(editor, scope) {
  let node = editor;
  while (node) {
    if (node[OWNED_DIALOG] === scope) return node;
    node = node.parentNode || node.getRootNode?.()?.host;
  }
  return null;
}

function report(editor, error) {
  const config = configOf(editor);
  if (!config) return;
  editor.dispatchEvent(new CustomEvent('config-changed', {
    detail: {config: structuredClone(config), error: error.message || String(error)},
    bubbles: true, composed: true
  }));
}

function createDialog(binding, scope) {
  const env = scope.env;
  const registered = env.customElements?.get('hui-dialog-edit-card');
  if (!registered) return null;
  // Inherit HA's implementation without overriding its renderer or methods.
  // A distinct tag keeps Bubble editors outside the library from discovering
  // this private dialog through HA's global hui-dialog-edit-card selector.
  let ScopedDialog = env.customElements.get(SCOPED_DIALOG_TAG);
  if (!ScopedDialog) {
    if (!env.customElements.define) return null;
    ScopedDialog = class extends registered {};
    env.customElements.define(SCOPED_DIALOG_TAG, ScopedDialog);
  }
  if (!(ScopedDialog.prototype instanceof registered)) return null;
  const dialog = env.document.createElement(SCOPED_DIALOG_TAG);
  if (typeof dialog.showDialog !== 'function' || typeof dialog.closeDialog !== 'function') return null;
  const app = env.document.querySelector?.('home-assistant');
  const parent = app?.shadowRoot || env.document.body;
  if (!parent?.append) return null;
  dialog[OWNED_DIALOG] = scope;
  dialog.hass = binding.editor.hass || binding.editor._hass || scope.editor.hass;
  parent.append(dialog);
  scope.dialogs.add(dialog);
  binding.dialog = dialog;
  Promise.resolve().then(() => scope.refresh());
  return dialog;
}

function seedDialog(dialog, binding, scope) {
  const editor = binding.editor;
  const config = configOf(editor);
  if (!config) return null;
  dialog.hass = editor.hass || editor._hass || scope.editor.hass;
  // Only the parameters are seeded. Setting _cardConfig or calling showDialog
  // here would render an extra, hidden card editor and its preview immediately.
  if (!dialog._open) {
    const lovelace = editor.lovelace || scope.editor.lovelace || {views: []};
    dialog._params = {
      cardConfig: structuredClone(config),
      lovelaceConfig: lovelace.config || lovelace,
      saveCardConfig: async value => {
        if (scope.disposed || !editor.isConnected || !scope.editor.isConnected) {
          throw Error('Die bearbeitete Vorlage ist nicht mehr geöffnet. Popup schließen und erneut öffnen.');
        }
        const next = structuredClone(value);
        editor.setConfig?.(next);
        editor.dispatchEvent(new CustomEvent('config-changed', {
          detail: {config: next}, bubbles: true, composed: true
        }));
      }
    };
  }
  return dialog;
}

function bindBubble(editor, scope) {
  if (scope.bindings.has(editor)) return;
  // Versions without standalone popup dialogs do not need this adapter. A
  // changed standalone API is blocked visibly instead of using the dashboard.
  if (typeof editor._openStandaloneCardDialog !== 'function') return;
  const binding = {
    editor, ownGetter: Object.getOwnPropertyDescriptor(editor, '_getActiveEditCardDialog'),
    originalGetter: editor._getActiveEditCardDialog,
    ownOpen: Object.getOwnPropertyDescriptor(editor, '_openStandaloneCardDialog'),
    originalOpen: editor._openStandaloneCardDialog, dialog: null, reported: false
  };
  const supported = typeof binding.originalGetter === 'function'
    && typeof editor._captureStandaloneParentDialogParams === 'function';
  binding.getter = () => {
    if (scope.disposed) return null;
    const containing = safeAncestorDialog(editor, scope);
    if (containing) return containing;
    const dialog = supported ? binding.dialog || createDialog(binding, scope) : null;
    if (dialog) {
      binding.reported = false;
      return seedDialog(dialog, binding, scope);
    }
    return null;
  };
  binding.open = function(...args) {
    if (!supported || !binding.getter()) {
      if (!binding.reported) {
        binding.reported = true;
        report(editor, Error('Der sichere Popup-Unterkarteneditor ist nicht verfügbar. Den HA-Karteneditor einmal öffnen und erneut versuchen; bei unverändertem Fehler die Bubble-Card-Version prüfen.'));
      }
      return Promise.resolve(false);
    }
    return binding.originalOpen.apply(this, args);
  };
  Object.defineProperty(editor, '_getActiveEditCardDialog', {
    configurable: true, writable: true, value: binding.getter
  });
  Object.defineProperty(editor, '_openStandaloneCardDialog', {
    configurable: true, writable: true, value: binding.open
  });
  scope.bindings.set(editor, binding);
}

function restoreBinding(binding) {
  const editor = binding.editor;
  if (editor._getActiveEditCardDialog === binding.getter) {
    if (binding.ownGetter) Object.defineProperty(editor, '_getActiveEditCardDialog', binding.ownGetter);
    else delete editor._getActiveEditCardDialog;
  }
  if (editor._openStandaloneCardDialog === binding.open) {
    if (binding.ownOpen) Object.defineProperty(editor, '_openStandaloneCardDialog', binding.ownOpen);
    else delete editor._openStandaloneCardDialog;
  }
}

export function scopeOriginalEditor(editor, env = globalThis) {
  const existing = SCOPES.get(editor);
  if (existing && !existing.disposed) {
    existing.refresh();
    return existing;
  }
  const scope = {editor, env, bindings: new Map(), dialogs: new Set(), observers: new Map(), disposed: false};
  let scheduled = false, timer;
  const schedule = () => {
    if (scheduled || scope.disposed) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; scope.refresh(); });
  };
  scope.refresh = () => {
    if (scope.disposed) return;
    const roots = new Set([editor]), seen = new Set();
    const inspect = node => {
      if (nameOf(node) !== 'bubble-card-editor') return;
      seen.add(node); bindBubble(node, scope);
    };
    visitTree(editor, inspect, roots);
    for (const dialog of scope.dialogs) visitTree(dialog, inspect, roots);
    for (const [node, binding] of scope.bindings) {
      if (seen.has(node)) continue;
      restoreBinding(binding); scope.bindings.delete(node);
    }
    if (env.MutationObserver) {
      for (const root of roots) {
        if (scope.observers.has(root)) continue;
        const observer = new env.MutationObserver(schedule);
        observer.observe(root, {childList: true, subtree: true});
        scope.observers.set(root, observer);
      }
      for (const [root, observer] of scope.observers) {
        if (roots.has(root)) continue;
        observer.disconnect(); scope.observers.delete(root);
      }
    }
    for (const binding of scope.bindings.values()) {
      if (binding.dialog) binding.dialog.hass = binding.editor.hass || binding.editor._hass || editor.hass;
    }
  };
  scope.dispose = () => {
    if (scope.disposed) return;
    scope.disposed = true; clearTimeout(timer);
    for (const observer of scope.observers.values()) observer.disconnect();
    for (const binding of scope.bindings.values()) restoreBinding(binding);
    for (const dialog of scope.dialogs) dialog.remove?.();
    scope.observers.clear(); scope.bindings.clear(); scope.dialogs.clear();
    SCOPES.delete(editor);
  };
  // Native HA hosts create shadow roots asynchronously. Observing their light
  // DOM alone cannot see a newly attached shadow root, so discover it while the
  // editing surface is connected. No foreign element prototype is modified.
  const discover = () => {
    if (scope.disposed) return;
    if (!editor.isConnected && ![...scope.dialogs].some(dialog => dialog._open)) {
      scope.dispose(); return;
    }
    scope.refresh();
    timer = setTimeout(discover, 250);
  };
  SCOPES.set(editor, scope);
  scope.refresh();
  if (env.MutationObserver) timer = setTimeout(discover, 250);
  return scope;
}

export function refreshEditorScope(editor) {
  SCOPES.get(editor)?.refresh();
}
