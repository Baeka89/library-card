// Reference: https://github.com/Baeka89/family-calendar-card/blob/main/src/editor/family-calendar-card-editor.js
// Shared library chrome, aligned with the Family Calendar editor's layout.
// Only owned elements are styled; embedded card editors retain their own UI.
export const css = `
:host{display:block;--library-line:var(--divider-color,rgba(127,127,127,.35));--library-muted:var(--secondary-text-color,#666);--library-accent:var(--primary-color,#3f51b5)}
[data-library-ui]{box-sizing:border-box;min-width:0}
ha-card[data-library-ui]{padding:16px;border-radius:8px;box-shadow:none}
ha-card[data-library-ui].embedded{padding:0;border:0;background:transparent}
.card-config[data-library-ui],.workflow-panel[data-library-ui]{display:flex;flex-direction:column;gap:12px;padding:8px 0}
h2[data-library-ui]{font-size:20px;font-weight:600;margin:0 0 4px}
h3[data-library-ui]{font-size:1rem;font-weight:600;margin:0}
p[data-library-ui]{margin:0;color:var(--library-muted);font-size:.85rem;line-height:1.5;overflow-wrap:anywhere}
p[data-library-ui]:empty{display:none}
.error[data-library-ui],.danger[data-library-ui]{color:var(--error-color,#db4437)}
.field[data-library-ui]{display:flex;flex-direction:column;gap:4px}
.field-inline[data-library-ui]{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);align-items:center;gap:8px}
label[data-library-ui]{font-weight:500;color:var(--primary-text-color);overflow-wrap:anywhere}
input[data-library-ui],select[data-library-ui],textarea[data-library-ui]{width:100%;padding:8px;border:1px solid var(--library-line);border-radius:6px;font:inherit;color:var(--primary-text-color);background:var(--card-background-color)}
textarea[data-library-ui]{min-height:70px;resize:vertical}
input[data-library-ui][type=checkbox]{width:auto;justify-self:start}
input[data-library-ui][type=color]{width:26px;height:26px;padding:0;cursor:pointer}
input[data-library-ui][type=color]::-webkit-color-swatch-wrapper{padding:0}
input[data-library-ui][type=color]::-webkit-color-swatch{border:0;border-radius:5px}
button[data-library-ui]{border:1px solid var(--library-line);background:var(--card-background-color);border-radius:6px;padding:6px 10px;cursor:pointer;color:var(--primary-text-color);font:inherit;white-space:normal;overflow-wrap:anywhere}
button[data-library-ui]:hover{background:color-mix(in srgb,var(--card-background-color) 94%,var(--primary-text-color) 6%)}
button[data-library-ui]:disabled{cursor:default;opacity:.45}
[data-library-ui]:focus-visible{outline:2px solid var(--library-accent);outline-offset:2px}
.primary[data-library-ui]{background:var(--library-accent);color:var(--text-primary-color,#fff);border-color:transparent}
.row[data-library-ui],.library-actions[data-library-ui]{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.row[data-library-ui]>span[data-library-ui]{flex:1;overflow-wrap:anywhere}
fieldset[data-library-ui]{display:grid;gap:8px;margin:0;border:1px solid var(--library-line);border-radius:8px;padding:10px;background:var(--card-background-color)}
legend[data-library-ui]{font-weight:600;padding:0 4px}
details[data-library-ui]{margin:0;border:1px solid var(--library-line);border-radius:6px;background:color-mix(in srgb,var(--card-background-color) 96%,var(--primary-text-color) 4%)}
details[data-library-ui] details[data-library-ui]{background:var(--card-background-color)}
summary[data-library-ui]{cursor:pointer;padding:10px;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px;color:var(--primary-text-color)}
details[data-library-ui] details[data-library-ui]>summary[data-library-ui]{padding:8px 10px}
summary[data-library-ui]::before{content:'›';font-size:1.2rem;line-height:1;transition:transform 120ms ease;color:var(--library-muted)}
details[data-library-ui][open]>summary[data-library-ui]::before{transform:rotate(90deg)}
summary[data-library-ui]::-webkit-details-marker{display:none}
.section-content[data-library-ui]{border-top:1px solid var(--library-line);padding:10px;display:flex;flex-direction:column;gap:10px}
.library-actions[data-library-ui]{display:grid;grid-template-columns:1fr;align-items:start}
.workflow-tabs[data-library-ui]{display:flex;flex-wrap:wrap;gap:4px;border:1px solid var(--library-line);border-radius:6px;padding:4px;background:var(--card-background-color)}
.workflow-tabs[data-library-ui]>button[data-library-ui]{flex:1;border:0;font-weight:600}
.nav-active[data-library-ui]{color:var(--library-accent);background:color-mix(in srgb,var(--card-background-color) 88%,var(--library-accent) 12%)}
.save-bar[data-library-ui]{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--library-line)}
.status-badge[data-library-ui]{font-size:.85rem;color:var(--library-muted)}
.back-link[data-library-ui]{align-self:flex-start;color:var(--library-accent);background:transparent;border:0;padding:4px 0}
.helper[data-library-ui],.hint[data-library-ui]{color:var(--library-muted);font-size:.85rem}
@media(max-width:520px){ha-card[data-library-ui]{padding:12px}.field-inline[data-library-ui]{grid-template-columns:minmax(0,1fr)}.workflow-tabs[data-library-ui]>button[data-library-ui]{flex-basis:100%;text-align:left}.save-bar[data-library-ui]>.primary[data-library-ui]{width:100%}}
`;
let fieldId = 0;
export function el(tag, text, parent) {
  const node = document.createElement(tag); node.libraryOwned = true;
  node.setAttribute('data-library-ui', '');
  if (text !== undefined) node.textContent = text;
  if (parent) {
    let target = parent;
    if (parent.tagName?.toLowerCase() === 'details' && tag !== 'summary') {
      if (!parent.libraryContent) {
        parent.libraryContent = el('div'); parent.libraryContent.className = 'section-content';
        parent.libraryContent.libraryParent = parent; parent.append(parent.libraryContent);
      }
      target = parent.libraryContent;
    }
    node.libraryParent = target; target.append(node);
    if (tag === 'summary' && parent.tagName?.toLowerCase() === 'details') {
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
export function field(parent, label, tag = 'input', inline = true) {
  const box = el('div', undefined, parent); box.className = inline ? 'field field-inline' : 'field';
  const caption = el('label', label, box), input = el(tag, undefined, box);
  input.id = 'library-field-' + (++fieldId); caption.htmlFor = input.id;
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
  let started = false, wasOpen = false;
  const failed = error => {
    started = false;
    if (section.isConnected) el('p', error.message || String(error), section).className = 'error';
  };
  const start = () => {
    const opening = section.open && !wasOpen; wasOpen = section.open;
    if (!opening || !section.isConnected || (started && !repeat)) return;
    started = true;
    try { Promise.resolve(task()).catch(failed); } catch(error) { failed(error); }
  };
  section.addEventListener('toggle', start); start();
}

export function visibleInSections(node) {
  for (let parent = node.libraryParent || node.parentElement; parent; parent = parent.libraryParent || parent.parentElement) {
    if (parent.tagName?.toLowerCase() === 'details' && !parent.open) return false;
  }
  return true;
}
