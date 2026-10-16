const {chromium} = require(process.env.LIBRARY_PLAYWRIGHT || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const buttonFile = process.env.LIBRARY_BUTTON_CARD;
if (!buttonFile) throw Error('LIBRARY_BUTTON_CARD muss auf die originale button-card.js zeigen.');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/button-card-shutter.json'), 'utf8'));
const variables = {
  entity_cover:'cover.rolllade_kuchenfenster_3',
  entity_modus:'sensor.rollladen_modus_kuchenfenster',
  entity_beschattung:'sensor.rollladen_beschattung_modus_kuchenfenster',
  entity_override_auto:'input_boolean.rollladen_modus_override_kuchenfenster',
  entity_override_besch:'input_boolean.rollladen_beschattung_modus_override_kuchenfenster',
  friendly_name:'Küchenfenster', nav_anchor:'rolllade_kuchenfenster_info'
};
const original = {type:'custom:button-card', template:'rolladen_karte', variables};
const input = 'type: custom:button-card\ntemplate: rolladen_karte\nvariables:\n' + Object.entries(variables).map(([key, value]) => '  ' + key + ': ' + value).join('\n');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.LIBRARY_CHROMIUM, args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/parse-card') {
        const parsed = spawnSync(process.env.PYTHON || 'python3', ['-c', 'import yaml,json,sys;print(json.dumps(yaml.safe_load(sys.stdin.read())))'], {input:request.postDataJSON().yaml, encoding:'utf8'});
        return route.fulfill({status:parsed.status ? 400 : 200, contentType:'application/json', body:parsed.status ? JSON.stringify({error:parsed.stderr}) : parsed.stdout});
      }
      if (url.pathname.startsWith('/card_library/')) {
        return route.fulfill({status:200, contentType:'text/javascript', body:fs.readFileSync(path.join(root, 'custom_components/card_library/frontend', path.basename(url.pathname)), 'utf8')});
      }
      return route.fulfill({status:200, contentType:'text/html', body:'<!doctype html><html><body></body></html>'});
    });
    await page.goto('http://library-test.invalid/dashboard/0');
    await page.evaluate(({fixture, original, variables}) => {
      for (const tag of ['home-assistant','home-assistant-main','partial-panel-resolver','ha-panel-lovelace']) customElements.define(tag, class extends HTMLElement { constructor() { super(); this.attachShadow({mode:'open'}); } });
      customElements.define('hui-card-element-editor', class extends HTMLElement {});
      const app = document.createElement('home-assistant'), main = document.createElement('home-assistant-main'), panel = document.createElement('ha-panel-lovelace'), hui = document.createElement('hui-root');
      const drawer = document.createElement('ha-drawer'), resolver = document.createElement('partial-panel-resolver');
      document.body.append(app); app.shadowRoot.append(main); main.shadowRoot.append(drawer); drawer.append(resolver); resolver.shadowRoot.append(panel); panel.shadowRoot.append(hui);
      hui.lovelace = {config:{views:[{}], button_card_templates:{rolladen_karte:structuredClone(fixture)}}};
      window.original = original;
      window.library = {revision:0, templates:{shutter:{name:'rolladen_karte', config:structuredClone(fixture), bindings:[]}}, groups:{}, people:{}};
      window.messages = []; window.events = [];
      const states = Object.fromEntries(Object.entries(variables).filter(([key]) => key.startsWith('entity_')).map(([key, id]) => [id, {entity_id:id, state:key === 'entity_cover' ? 'open' : key.startsWith('entity_override') ? 'off' : 'Automatik', attributes:{friendly_name:id, current_position:55}, last_changed:'2026-10-16T00:00:00Z', last_updated:'2026-10-16T00:00:00Z'}]));
      window.hass = {
        states, config:{version:'2026.10.0', unit_system:{temperature:'°C'}}, user:{is_admin:false},
        themes:{themes:{},darkMode:false}, localize:key => key, locale:{language:'de',number_format:'language'}, language:'de',
        connection:{subscribeMessage:async callback => {window.pushLibrary = callback; callback(window.library); return () => {}; }},
        callWS:async message => {window.messages.push(message); if(message.type !== 'card_library/parse_card') throw Error('Unexpected write/service: ' + message.type); return fetch('/parse-card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)}).then(response => response.json());}
      };
      app.hass = window.hass; app.provideHass = recipient => {recipient.hass = window.hass;};
      window.loadCardHelpers = async () => ({createCardElement:config => {
        const card = document.createElement(config.type.startsWith('custom:') ? config.type.slice(7) : 'hui-' + config.type + '-card');
        card.setConfig?.(config); return card;
      }});
      Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async value => {window.copied = value;}}});
    }, {fixture, original, variables});
    await page.addScriptTag({content:fs.readFileSync(buttonFile, 'utf8')});
    await page.evaluate(async version => {
      await import('/card_library/card-library.js?v=' + version);
      const editor = window.editor = document.createElement('library-card-editor');
      editor.setConfig({type:'custom:library-card', template:'', grid_options:{columns:6}});
      editor.addEventListener('config-changed', event => window.events.push(structuredClone(event.detail.config)));
      document.body.append(editor); editor.hass = window.hass;
    }, version);
    await page.locator('library-card-editor select').first().selectOption('shutter');
    await page.getByText('Vorhandene Button Card übernehmen', {exact:true}).click();
    await page.getByLabel('Bisherige Kartenkonfiguration (YAML)').fill(input);
    await page.getByText('Für diese Karte übernehmen', {exact:true}).click();
    await page.waitForFunction(() => window.editor.config.overrides?.length === 7);
    await page.getByText('Neuen YAML-Code kopieren', {exact:true}).click();
    if (process.env.LIBRARY_CONVERTER_SCREENSHOT) await page.locator('library-card-editor details').filter({has:page.getByText('Vorhandene Button Card übernehmen', {exact:true})}).screenshot({path:process.env.LIBRARY_CONVERTER_SCREENSHOT});
    const initial = await page.evaluate(async () => {
      const old = window.oldCard = document.createElement('button-card'); old.setConfig(window.original); old.hass = window.hass; document.body.append(old);
      const card = window.convertedCard = document.createElement('library-card'); card.setConfig(window.editor.config); card.hass = window.hass; document.body.append(card);
      for (let index = 0; index < 100 && (!card.child?.shadowRoot?.querySelector('#name') || !old.shadowRoot?.querySelector('#name')); index++) await new Promise(resolve => setTimeout(resolve, 20));
      await old.updateComplete; await card.child?.updateComplete;
      const display = element => ({name:element.shadowRoot.querySelector('#name')?.textContent.trim(), label:element.shadowRoot.querySelector('#label')?.textContent.trim(), border:getComputedStyle(element.shadowRoot.querySelector('ha-card')).borderTopColor});
      return {original:display(old), converted:display(card.child), reference:window.editor.config, copied:window.copied, messages:window.messages.map(message => message.type), templateCount:Object.keys(window.library.templates).length, events:window.events.length};
    });
    assert.deepEqual(initial.converted, initial.original);
    assert.equal(initial.converted.name, 'Küchenfenster • 55%');
    assert.equal(initial.converted.label, 'Vollautomatik');
    assert.equal(initial.reference.overrides.length, 7);
    assert.equal(initial.reference.type, 'custom:library-card');
    assert.equal(initial.templateCount, 1);
    assert.equal(initial.events, 2); // Template selection, then one local import.
    assert.deepEqual(initial.messages, ['card_library/parse_card']);
    assert.match(initial.copied, /custom:library-card/);
    assert.doesNotMatch(initial.copied, /custom_fields|triggers_update/);
    const copiedConfig = spawnSync(process.env.PYTHON || 'python3', ['-c', 'import yaml,json,sys;print(json.dumps(yaml.safe_load(sys.stdin.read())))'], {input:initial.copied, encoding:'utf8'});
    assert.equal(copiedConfig.status, 0, copiedConfig.stderr);
    assert.deepEqual(JSON.parse(copiedConfig.stdout), initial.reference);
    const updated = await page.evaluate(async () => {
      const next = structuredClone(window.library); next.revision++;
      next.templates.shutter.config.name = 'Zentral geändert';
      window.library = next; window.pushLibrary(next);
      for (let index = 0; index < 100 && window.convertedCard.child?.shadowRoot?.querySelector('#name')?.textContent.trim() !== 'Zentral geändert'; index++) await new Promise(resolve => setTimeout(resolve, 20));
      return {name:window.convertedCard.child.shadowRoot.querySelector('#name')?.textContent.trim(), variables:window.convertedCard.child._config.variables, overrides:window.editor.config.overrides.length};
    });
    assert.equal(updated.name, 'Zentral geändert');
    assert.deepEqual(updated.variables, variables);
    assert.equal(updated.overrides, 7);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({buttonCard:'7.0.1', initial, updated, errors}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
