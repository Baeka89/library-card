// Home Assistant components provide the controls; CSS only arranges library-owned content.
export const css = `
:host{display:block;color:var(--primary-text-color);font-family:var(--ha-font-family-body,Roboto,Noto,sans-serif);--library-line:var(--divider-color);--library-muted:var(--secondary-text-color);--library-accent:var(--primary-color)}
[data-library-ui]{box-sizing:border-box;min-width:0}
[data-library-ui][hidden]{display:none!important}
ha-card[data-library-ui]{padding:var(--ha-space-4,16px)}
ha-card[data-library-ui].embedded{padding:0;border:0;background:transparent;box-shadow:none}
.card-config[data-library-ui],.workflow-panel[data-library-ui]{display:flex;flex-direction:column;gap:var(--ha-space-4,16px);padding:16px 0}
h2[data-library-ui]{font-size:var(--ha-font-size-xl,20px);font-weight:var(--ha-font-weight-medium,500);margin:0 0 4px}
h3[data-library-ui]{font-size:var(--ha-font-size-m,16px);font-weight:var(--ha-font-weight-medium,500);margin:0}
p[data-library-ui]{margin:0;color:var(--secondary-text-color);font-size:var(--ha-font-size-s,14px);line-height:1.5;overflow-wrap:anywhere}
p[data-library-ui]:empty{display:none}
.error[data-library-ui],.danger[data-library-ui]{color:var(--error-color)}
.field[data-library-ui]{display:flex;flex-direction:column;gap:8px}
.field-inline[data-library-ui]{display:grid;grid-template-columns:minmax(160px,240px) minmax(0,1fr);align-items:center;gap:16px}
label[data-library-ui]{font-size:var(--ha-font-size-m,16px);color:var(--primary-text-color);overflow-wrap:anywhere}
ha-input[data-library-ui],ha-textfield[data-library-ui],ha-textarea[data-library-ui],ha-select[data-library-ui]{display:block;width:100%}
ha-textarea[data-library-ui]::part(wa-textarea){font-family:var(--ha-font-family-code,monospace)}
input[data-library-ui],select[data-library-ui],textarea[data-library-ui]{width:100%;padding:12px 16px;border:0;border-bottom:1px solid var(--input-idle-line-color,var(--divider-color));border-radius:var(--ha-border-radius-sm,4px) var(--ha-border-radius-sm,4px) 0 0;font:inherit;color:var(--input-ink-color,var(--primary-text-color));background:var(--input-fill-color,var(--secondary-background-color))}
textarea[data-library-ui]{min-height:96px;resize:vertical}
input[data-library-ui][type=checkbox]{width:auto;justify-self:start;accent-color:var(--primary-color)}
input[data-library-ui][type=color]{width:48px;height:40px;padding:4px;cursor:pointer}
input[data-library-ui][type=file]{font-size:var(--ha-font-size-s,14px)}
button[data-library-ui]{border:0;background:transparent;border-radius:var(--ha-border-radius-pill,20px);min-height:40px;padding:8px 16px;cursor:pointer;color:var(--primary-color);font:inherit;font-weight:var(--ha-font-weight-medium,500);white-space:normal;overflow-wrap:anywhere}
button[data-library-ui]:hover{background:var(--secondary-background-color)}
button[data-library-ui]:disabled{cursor:default;opacity:.38}
a[data-library-ui]{color:var(--primary-color);text-decoration:none;font-weight:var(--ha-font-weight-medium,500);padding:8px 0}
a[data-library-ui]:hover{text-decoration:underline}
[data-library-ui]:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
button.primary[data-library-ui]{background:var(--primary-color);color:var(--text-primary-color)}
ha-button.primary[data-library-ui]::part(base){background:var(--primary-color);color:var(--text-primary-color);border-color:var(--primary-color)}
ha-button.danger[data-library-ui]::part(base){color:var(--error-color)}
mwc-button.primary[data-library-ui]{--mdc-theme-primary:var(--primary-color)}
.row[data-library-ui],.library-actions[data-library-ui]{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.row[data-library-ui]>span[data-library-ui]{flex:1;overflow-wrap:anywhere}
fieldset[data-library-ui]{display:grid;gap:16px;margin:0;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);padding:16px;background:var(--card-background-color)}
legend[data-library-ui]{font-weight:var(--ha-font-weight-medium,500);padding:0 8px}
ha-expansion-panel[data-library-ui]{--expansion-panel-summary-padding:0 16px;--expansion-panel-content-padding:0 16px}
details[data-library-ui]{margin:0;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color)}
summary[data-library-ui]{cursor:pointer;padding:16px;font-weight:var(--ha-font-weight-medium,500);color:var(--primary-text-color)}
.library-summary[data-library-ui]{display:flex;align-items:center;gap:8px;flex:1;overflow-wrap:anywhere;font-weight:var(--ha-font-weight-medium,500)}
.section-content[data-library-ui]{padding:0 0 16px;display:flex;flex-direction:column;gap:16px}
details[data-library-ui]>.section-content[data-library-ui]{padding:0 16px 16px}
.library-actions[data-library-ui]{display:grid;grid-template-columns:1fr;align-items:start}
.workflow-tabs[data-library-ui]{display:flex;gap:0;border-bottom:1px solid var(--divider-color);background:transparent}
.workflow-tabs[data-library-ui]>[data-library-ui]{flex:1;border-radius:0;border-bottom:2px solid transparent;text-align:center}
.workflow-tabs[data-library-ui]>.nav-active[data-library-ui]{color:var(--primary-color);border-bottom-color:var(--primary-color)}
.workflow-tabs[data-library-ui]>ha-button[data-library-ui]::part(base){border-radius:0}
.save-bar[data-library-ui]{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 0 16px;border-bottom:1px solid var(--divider-color)}
.status-badge[data-library-ui],.helper[data-library-ui],.hint[data-library-ui]{font-size:var(--ha-font-size-s,14px);color:var(--secondary-text-color)}
.back-link[data-library-ui]{align-self:flex-start}
@media(max-width:520px){ha-card[data-library-ui]{padding:12px}.field-inline[data-library-ui]{grid-template-columns:minmax(0,1fr)}.workflow-tabs[data-library-ui]>[data-library-ui]{flex-basis:50%}.save-bar[data-library-ui]>.primary[data-library-ui]{width:100%}}
`;
let fieldId = 0;
export function el(tag, text, parent) {
  const nativeTag = tag === 'button' ? available('ha-button', 'mwc-button') : tag === 'details' ? available('ha-expansion-panel') : tag === 'select' ? available('ha-select') : tag === 'textarea' ? available('ha-textarea') : null;
  const isNativeSummary = tag === 'summary' && parent?.libraryTag === 'details' && parent.tagName?.toLowerCase() === 'ha-expansion-panel';
  const node = document.createElement(isNativeSummary ? 'div' : nativeTag || tag); node.libraryOwned = true; node.libraryTag = tag;
  if (nativeTag === 'ha-button') { node.appearance = 'plain'; node.setAttribute('appearance', 'plain'); }
  if (nativeTag === 'ha-expansion-panel') {
    node.outlined = true; node.setAttribute('outlined', '');
    Object.defineProperty(node, 'open', {get() {return Boolean(this.expanded);}, set(value) {this.expanded = Boolean(value);}});
    node.addEventListener('expanded-changed', event => {
      if (event.target !== node) return;
      event.stopPropagation(); node.open = event.detail.expanded;
      node.dispatchEvent(new Event('toggle'));
    });
  }
  if (isNativeSummary) { node.slot = 'header'; node.className = 'library-summary'; }
  if (nativeTag === 'ha-select') {
    node.addEventListener('selected', event => {
      if (event.target !== node) return;
      event.stopPropagation();
      const next = Object.hasOwn(event.detail || {}, 'value') ? event.detail.value ?? '' : node.libraryOptions?.[event.detail?.index]?.[0] ?? node.value;
      if (next === (node.libraryLastValue ?? node.value)) return;
      node.libraryLastValue = next; node.value = next; node.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
    });
  }
  if (nativeTag === 'ha-textarea') readonlyAlias(node);
  node.setAttribute('data-library-ui', '');
  if (text !== undefined) node.textContent = text;
  if (parent) {
    let target = parent;
    if ((parent.libraryTag || parent.tagName?.toLowerCase()) === 'details' && tag !== 'summary') {
      if (!parent.libraryContent) {
        parent.libraryContent = el('div'); parent.libraryContent.className = 'section-content';
        parent.libraryContent.libraryParent = parent; parent.append(parent.libraryContent);
      }
      target = parent.libraryContent;
    }
    node.libraryParent = target; target.append(node);
    if (tag === 'summary' && (parent.libraryTag || parent.tagName?.toLowerCase()) === 'details') {
      let ancestor = parent.libraryParent;
      while (ancestor && !ancestor.libraryDisclosureKey && !ancestor.libraryScope) ancestor = ancestor.libraryParent;
      parent.libraryDisclosureKey = (ancestor?.libraryDisclosureKey || ancestor?.libraryScope || '') + '/' + text;
      parent.setAttribute('data-library-disclosure', parent.libraryDisclosureKey);
      const owner = ancestor?.libraryOwner;
      parent.libraryOwner = owner;
      if (owner?.disclosures?.has(parent.libraryDisclosureKey)) parent.open = owner.disclosures.get(parent.libraryDisclosureKey);
    }
  }
  return node;
}
function available(...tags) { return tags.find(tag => customElements.get(tag)); }
function readonlyAlias(node) {
  // New HA input components use readonly; the existing editor API uses readOnly.
  if ('readonly' in node && !('readOnly' in node)) Object.defineProperty(node, 'readOnly', {
    get() {return this.readonly;}, set(value) {this.readonly = Boolean(value);}
  });
}
export function setSelectOptions(node, items) {
  node.libraryOptions = items;
  if (node.tagName?.toLowerCase() === 'ha-select' && 'options' in node) {
    node.options = items.map(([value, label]) => ({value, label}));
  } else {
    node.replaceChildren();
    for (const [value, label] of items) {
      const option = el(node.tagName?.toLowerCase() === 'ha-select' ? available('ha-list-item', 'mwc-list-item') || 'mwc-list-item' : 'option', label, node);
      option.value = value;
    }
  }
}
export function field(parent, label, tag = 'input', inline = true, type = 'text') {
  const box = el('div', undefined, parent); box.className = inline ? 'field field-inline' : 'field';
  const caption = el('label', label, box);
  const nativeTag = tag === 'input' ? type === 'checkbox' ? available('ha-checkbox') : type === 'file' ? null : type === 'color' ? available('ha-input') : available('ha-input', 'ha-textfield') : null;
  const input = el(nativeTag || tag, undefined, box); input.libraryTag = tag;
  if (tag === 'input') input.type = type;
  input.id = 'library-field-' + (++fieldId); caption.htmlFor = input.id;
  if (nativeTag || input.tagName?.toLowerCase().startsWith('ha-')) {
    // Put the label inside the native control so clicking it focuses the input.
    if (type === 'checkbox') {
      // Older HA checkboxes do not render a label slot. Keep one accessible
      // external label for both generations and avoid double native activation.
      caption.onclick = event => {
        event.preventDefault();
        if (input.disabled) return;
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
      };
    } else { input.label = label; caption.hidden = true; box.className = 'field'; }
    readonlyAlias(input);
  }
  input.setAttribute('aria-label', label); return input;
}
export function captureDisclosures(owner, root) {
  owner.disclosures ||= new Map();
  function visit(node) {
    if (node.libraryDisclosureKey) owner.disclosures.set(node.libraryDisclosureKey, Boolean(node.open));
    for (const child of node.children || []) if (child.libraryOwned) visit(child);
  }
  visit(root);
}

export function mountOriginalEditor(host, editor) {
  // Light-DOM editors may include global CSS; keep it out of library chrome.
  const frame = document.createElement('div');
  const root = frame.attachShadow({mode:'open'});
  root.append(editor); host.append(frame);
  return frame;
}

export function whenOpen(section, task, repeat = false) {
  let started = false, wasVisible = false;
  const failed = error => {
    started = false;
    if (section.isConnected) el('p', error.message || String(error), section).className = 'error';
  };
  const start = () => {
    const visible = section.open && visibleInSections(section);
    const opening = visible && !wasVisible; wasVisible = visible;
    if (!opening || !section.isConnected || (started && !repeat)) return;
    started = true;
    try { Promise.resolve(task()).catch(failed); } catch(error) { failed(error); }
  };
  // Restored child panels can be expanded while their parent remains closed.
  // Defer their expensive work until the whole disclosure chain is visible.
  section.addEventListener('toggle', start);
  for (let parent = section.libraryParent || section.parentElement; parent; parent = parent.libraryParent || parent.parentElement) {
    if ((parent.libraryTag || parent.tagName?.toLowerCase()) === 'details') parent.addEventListener('toggle', start);
  }
  start();
}

export function visibleInSections(node) {
  for (let parent = node.libraryParent || node.parentElement; parent; parent = parent.libraryParent || parent.parentElement) {
    if ((parent.libraryTag || parent.tagName?.toLowerCase()) === 'details' && !parent.open) return false;
  }
  return true;
}

export async function confirmAction(owner, message) {
  if (!available('ha-dialog')) return window.confirm(message);
  const state = owner.state, library = state?.library, draft = owner.draft;
  const localize = key => owner._hass?.localize?.('ui.common.' + key);
  const title = localize('confirm') || 'Bestätigen';
  const signature = draft && JSON.stringify(draft);
  const accepted = await new Promise(resolve => {
    const dialog = el('ha-dialog'); dialog.heading = title; dialog.headerTitle = title; dialog.type = 'alert';
    el('p', message, dialog);
    let settled = false;
    const finish = value => { if (settled) return; settled = true; dialog.open = false; dialog.remove(); resolve(value); };
    const modern = 'headerTitle' in Object.getPrototypeOf(dialog) || 'width' in dialog;
    const footer = modern ? el('div', undefined, dialog) : dialog;
    if (modern) { footer.slot = 'footer'; footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px'; }
    for (const [label, value] of [[localize('cancel') || 'Abbrechen', false], [title, true]]) {
      const action = el('button', label, footer); action.type = 'button';
      if (!modern) action.slot = value ? 'primaryAction' : 'secondaryAction';
      if (value) { action.appearance = 'filled'; action.setAttribute('appearance', 'filled'); action.raised = true; }
      action.onclick = () => finish(value);
    }
    dialog.addEventListener('closed', () => finish(false));
    (document.querySelector('home-assistant') || document.body).append(dialog); dialog.open = true;
  });
  if (accepted && (owner._detached || owner.state !== state || state?.library !== library || owner.draft !== draft || draft && JSON.stringify(draft) !== signature)) {
    owner.notice = 'Die Bibliothek wurde inzwischen geändert. Neu prüfen und erneut versuchen.';
    if (!owner._detached) owner.render();
    return false;
  }
  return accepted;
}
