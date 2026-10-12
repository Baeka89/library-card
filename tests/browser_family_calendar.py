"""Test the supplied real Family Calendar Card in Chromium against mocked HA APIs.
Run: python tests/browser_family_calendar.py --card /path/to/family-calendar-card.js
Requires Playwright and Chromium; makes no external requests.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--card', required=True, type=Path)
parser.add_argument('--chromium', default='/usr/bin/chromium')
args = parser.parse_args()
configs = [json.loads((root / f'examples/family-calendar/{name}.json').read_text()) for name in ('week', 'agenda')]
library = json.loads((root / 'examples/family-calendar/family-calendar-library.json').read_text())['library']

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox', '--disable-crash-reporter'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def route(request):
        path = request.request.url.split('http://ha.test', 1)[-1].split('?')[0]
        if path == '/':
            request.fulfill(body='<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}</style></head><body></body></html>', content_type='text/html; charset=utf-8')
        elif path == '/vendor.js':
            request.fulfill(path=str(args.card), content_type='text/javascript; charset=utf-8')
        elif path.startswith('/card_library/'):
            local = root / 'custom_components/card_library/frontend' / Path(path).name
            request.fulfill(path=str(local), content_type='text/javascript; charset=utf-8')
        else:
            request.fulfill(status=404, body='No external requests in this test')
    page.route('**/*', route)
    page.goto('http://ha.test/')
    page.add_script_tag(url='http://ha.test/vendor.js')
    page.evaluate('''({configs, library}) => {
      window.inputConfigs = configs;
      window.libraryState = {...library, revision:0};
      window.mockSubscriptions = [];
      const states = Object.fromEntries(configs[0].entities.map(entity => [entity, {entity_id:entity, state:'off', attributes:{friendly_name: configs[0].calendar_names[entity] || entity, supported_features:3}}]));
      states['weather.weather_fusion_ai_vettweiss']={state:'sunny',attributes:{temperature:20,temperature_unit:'°C'}};
      states['sensor.time']={state:'12:00',attributes:{}};
      window.hass = {states, language:'de', locale:{language:'de',time_format:'24',number_format:'comma_decimal',first_weekday:'monday'},
        user:{is_admin:true}, themes:{darkMode:false}, config:{time_zone:'Europe/Berlin',unit_system:{temperature:'°C'}}, localize:key=>key,
        connection:{subscribeMessage:async(cb,msg)=>{
          if(msg.type==='card_library/subscribe') { window.mockSubscriptions.push(cb); queueMicrotask(()=>cb(structuredClone(window.libraryState))); }
          return ()=>{};
        }},
        callApi:async()=>[], callService:async()=>{},
        callWS:async msg=>{
          if(msg.type==='card_library/save') { window.libraryState={...structuredClone(msg.library),revision:msg.revision+1}; window.mockSubscriptions.forEach(cb=>cb(structuredClone(window.libraryState))); return structuredClone(window.libraryState); }
          if(msg.type==='lovelace/dashboards/list') return [];
          if(msg.type==='lovelace/config') return {views:[]};
          if(msg.type==='lovelace/resources/list') return [];
          if(msg.type==='weather/get_forecasts') return {};
          if(msg.type==='calendar/events') {
            const start=new Date(); start.setHours(12,0,0,0); const end=new Date(start); end.setHours(13);
            return [{uid:'mock-'+msg.entity_id,summary:'Testtermin '+(states[msg.entity_id]?.attributes.friendly_name || msg.entity_id),start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}}];
          }
          return [];
        }
      };
      window.loadCardHelpers=async()=>({createCardElement:config=>{
        const card=document.createElement(config.type.replace('custom:',''));
        card.setConfig(structuredClone(config)); return card;
      }});
    }''', {'configs': configs, 'library': library})
    page.add_script_tag(url='http://ha.test/card_library/card-library.js', type='module')
    page.wait_for_function("!!customElements.get('library-card') && !!customElements.get('library-manager')")
    page.evaluate('''() => {
      const manager=document.createElement('library-manager'); manager.setConfig({type:'custom:library-manager'}); document.body.append(manager); manager.hass=hass; window.manager=manager;
      for(const template of ['family-week','family-agenda']) {
        const wrapper=document.createElement('library-card'); wrapper.setConfig({type:'custom:library-card',template}); document.body.append(wrapper); wrapper.hass=hass;
      }
    }''')
    page.wait_for_function("[...document.querySelectorAll('library-card')].every(c=>c.child?.tagName==='FAMILY-CALENDAR-CARD')")
    result = page.evaluate('''() => [...document.querySelectorAll('library-card')].map(wrapper=>({view:wrapper.child._config.default_view, color:wrapper.child._config.colors['calendar.person_d'],rendered:!!wrapper.child.innerHTML}))''')
    assert [item['view'] for item in result] == ['week-compact','agenda'], result
    assert all(item['color'] == '#e2006e' and item['rendered'] for item in result), result
    print('PASS: both original views render using the real supplied card')
    page.evaluate("manager.selected='family-week'; manager.render()")
    page.wait_for_function("manager.editor?.tagName==='FAMILY-CALENDAR-CARD-EDITOR' && manager.editor.querySelector('input,select,button')")
    width_input=page.locator('family-calendar-card-editor input[data-field="compact_width"]')
    width_input.evaluate("element => { let parent=element.parentElement; while(parent) { if(parent.tagName==='DETAILS') parent.open=true; parent=parent.parentElement; } }")
    width_input.check()
    assert page.evaluate("manager.draft.templates['family-week'].config.compact_width") is True
    print('PASS: real native graphical editor is embedded and its config-changed event is handled')
    page.evaluate("manager.mode='groups'; manager.selected='colors'; manager.render()")
    color_input=page.locator('library-manager').get_by_label('calendar.person_d',exact=True)
    color_input.fill('#123456')
    color_input.dispatch_event('change')
    page.get_by_role('button', name='Zentrale Änderungen speichern', exact=True).click()
    page.wait_for_function("[...document.querySelectorAll('library-card')].every(c=>c.child?._config.colors['calendar.person_d']==='#123456')")
    assert page.evaluate("[...document.querySelectorAll('library-card')].map(c=>c.child._config.default_view)") == ['week-compact','agenda']
    print('PASS: central color change updates both real cards and preserves their separate layouts')
    page.evaluate("manager.draft.groups.family_event_rules.value[0].background_color='#abcdef'; manager.edit(); manager.mode='preview'; manager.render()")
    page.wait_for_function("manager.shadowRoot.querySelectorAll('family-calendar-card').length >= 4")
    print('PASS: saved and draft versions of both real cards render in the comparison view')
    assert page.evaluate("[...manager.shadowRoot.querySelectorAll('legend')].some(n=>n.textContent==='Gespeichert') && [...manager.shadowRoot.querySelectorAll('legend')].some(n=>n.textContent==='Entwurf')")
    assert page.evaluate("""() => {
      const changed={...hass,states:{...hass.states}};manager.hass=changed;
      const result=[...manager.shadowRoot.querySelectorAll('[data-library-preview]')].every(host=>host.previewChild?.hass===changed);
      manager.hass=hass;return result;
    }""")
    print('PASS: comparison labels remain visible and real preview cards receive subsequent hass updates')

    assert not errors, errors
    print('PASS: no uncaught browser errors')
    page.evaluate("manager.style.display='none'; document.body.style.display='flex'; document.querySelectorAll('library-card').forEach(c=>c.style.width='50%')")
    page.screenshot(path=str(root/'examples/family-calendar/browser-preview.png'), full_page=True)
    page.evaluate('''() => {
      window.libraryState={revision:10,templates:{},groups:{},people:{}};
      window.mockSubscriptions.forEach(cb=>cb(structuredClone(window.libraryState)));
      const editor=document.createElement('library-card-editor');
      editor.setConfig({type:'custom:library-card',template:''}); editor.hass=hass; document.body.append(editor); window.emptyEditor=editor;
    }''')
    page.get_by_role('tab',name='Konfiguration',exact=True).click()
    page.locator('library-card-editor input[type=file]').set_input_files(str(root/'examples/family-calendar/family-calendar-library.json'))
    page.get_by_role('button',name='Import als Entwurf übernehmen',exact=True).click()
    page.get_by_role('button',name='Zentrale Änderungen speichern',exact=True).click()
    page.wait_for_function("!emptyEditor.manager.dirty && Object.keys(window.libraryState.templates).length===2")
    assert page.evaluate("Object.keys(window.libraryState.templates).length") == 2
    assert not errors, errors
    print('PASS: starting with no templates, import is accessible directly from the graphical template selector and saves both templates')
    page.locator('library-card-editor').get_by_role('button', name='Zurück zu Vorlagen', exact=True).click()
    page.locator('library-card-editor library-manager').get_by_text('Vorlage hinzufügen',exact=True).click()
    page.get_by_role('button', name='Neue Karte', exact=True).click()
    chooser=page.locator('library-card-editor library-manager fieldset').filter(has=page.locator('legend',has_text='Karte hinzufügen'))
    chooser.get_by_text('Installierte Custom Cards',exact=True).click()
    chooser.locator('select').filter(has=page.locator('option[value="family-calendar-card"]')).select_option('family-calendar-card')
    chooser.get_by_role('button',name='Registrierte Karte hinzufügen',exact=True).click()
    page.locator('library-card-editor library-manager').get_by_text('Kartenvorschau',exact=True).click()
    try:
        page.wait_for_function("emptyEditor.manager.editor?.tagName==='FAMILY-CALENDAR-CARD-EDITOR' && !!emptyEditor.manager.previewHost?.querySelector('family-calendar-card')",timeout=5000)
    except Exception:
        print(page.evaluate("({notice:emptyEditor.manager.notice,selected:emptyEditor.manager.selected, config:emptyEditor.manager.draft.templates[emptyEditor.manager.selected],html:emptyEditor.manager.previewHost?.innerHTML,editor:emptyEditor.manager.editor?.tagName})"))
        print('BROWSER ERRORS:',errors)
        raise
    assert page.evaluate("Array.isArray(emptyEditor.manager.draft.templates[emptyEditor.manager.selected].config.entities)")
    page.locator('library-card-editor library-manager').get_by_role('button',name='Zentrale Änderungen speichern',exact=True).click()
    page.wait_for_function('!emptyEditor.manager.saving && !emptyEditor.manager.dirty')
    page.evaluate('''() => {
      const card=document.createElement('library-card'); card.hass=hass; document.body.append(card);window.reusedCard=card;
      emptyEditor.addEventListener('config-changed',event=>card.setConfig(event.detail.config));
    }''')
    page.get_by_role('button',name='Diese Vorlage verwenden',exact=True).click()
    page.wait_for_function("reusedCard.child?.tagName==='FAMILY-CALENDAR-CARD'")
    assert page.evaluate('!emptyEditor.manage')
    assert not errors, errors
    print('PASS: create a real calendar from its registered type, save it as a template, use it and render it as a dashboard card')
    page.get_by_role('tab',name='Konfiguration',exact=True).click()
    page.evaluate("emptyEditor.manager.selected=emptyEditor.config.template;emptyEditor.manager.path=['hide_header'];emptyEditor.manager.render()")
    page.get_by_role('button',name='Auswahl als Design markieren',exact=True).click()
    page.locator('library-card-editor library-manager').get_by_role('button',name='Zentrale Änderungen speichern',exact=True).click()
    page.wait_for_function('!emptyEditor.manager.saving && !emptyEditor.manager.dirty')
    page.get_by_role('tab',name='Vorlagen einsetzen',exact=True).click()
    page.locator('library-card-editor').get_by_text('Übernahme aus der Vorlage',exact=True).click()
    page.get_by_role('button',name='Nur markiertes Design übernehmen',exact=True).click()
    page.wait_for_function("emptyEditor.config.overrides.some(o=>o.path[0]==='entities')")
    original_entity=page.evaluate('reusedCard.child._config.entities[0]')
    page.evaluate("""() => {
      const template=libraryState.templates[emptyEditor.config.template];
      window.originalHeader=template.config.hide_header;
      template.config.hide_header=!template.config.hide_header;
      template.config.entities[0]='calendar.person_d';
      libraryState.revision++;mockSubscriptions.forEach(cb=>cb(structuredClone(libraryState)));
    }""")
    page.wait_for_function('reusedCard.child._config.hide_header!==originalHeader')
    assert page.evaluate('reusedCard.child._config.entities[0]') == original_entity
    print('PASS: graphical design marking and design-only reuse propagate design while keeping calendar entities local')
    page.evaluate("emptyEditor.localPath=['entities',0];emptyEditor.render()")
    page.get_by_role('button',name='Feld wieder aus Vorlage übernehmen',exact=True).click()
    page.wait_for_function("reusedCard.child._config.entities[0]==='calendar.person_d'")
    print('PASS: one selected calendar entity can be relinked without resetting other local information')
    page.locator('library-card-editor').get_by_text('Übernahme aus der Vorlage',exact=True).click()
    page.get_by_role('button',name='Alles aus Vorlage übernehmen',exact=True).click()
    assert page.evaluate('emptyEditor.config.overrides.length') == 0
    assert not errors, errors
    print('PASS: full inheritance can be restored after design-only and partial entity reuse')
    page.evaluate("emptyEditor.setConfig({...emptyEditor.config,overrides:[{path:['entities','broken'],value:'calendar.person_d'}]})")
    page.locator('library-card-editor').get_by_text('Übernahme aus der Vorlage',exact=True).click()
    page.get_by_role('button',name='Lokale Anpassungen zurücksetzen',exact=True).click()
    assert page.evaluate('emptyEditor.config.overrides.length') == 0
    page.wait_for_function("reusedCard.child?.tagName==='FAMILY-CALENDAR-CARD'")
    assert not errors, errors
    print('PASS: invalid local configuration can be repaired through the graphical reset control')
    page.evaluate('''() => {
      const previous=structuredClone(window.libraryState);window.mockSubscriptions.forEach(cb=>cb({available:false}));window.beforeInactive=previous;
    }''')
    page.wait_for_function('reusedCard.child===null')
    page.evaluate('window.mockSubscriptions.forEach(cb=>cb(structuredClone(window.beforeInactive)))')
    page.wait_for_function("reusedCard.child?.tagName==='FAMILY-CALENDAR-CARD'")
    print('PASS: deactivate and reactivate the library without leaving the dashboard card stuck on its loading/error view')
    page.evaluate('''() => {
      const original=window.loadCardHelpers;
      window.loadCardHelpers=async()=>{
        const helpers=await original();return {createCardElement:config=>{
          if(config.type!=='custom:delayed-test-card')return helpers.createCardElement(config);
          const element=document.createElement('delayed-test-card');
          if(customElements.get('delayed-test-card'))element.setConfig(config);
          else customElements.whenDefined('delayed-test-card').then(()=>{
            customElements.upgrade(element);element.dispatchEvent(new CustomEvent('ll-upgrade',{bubbles:true,composed:true}));element.setConfig(config);
          });return element;
        }};
      };
      window.libraryState.templates.lazy={name:'Lazy',config:{type:'custom:delayed-test-card',title:'Delayed card'},bindings:[]};
      window.mockSubscriptions.forEach(cb=>cb(structuredClone(window.libraryState)));
      const wrapper=document.createElement('library-card');wrapper.setConfig({type:'custom:library-card',template:'lazy'});wrapper.hass=hass;document.body.append(wrapper);window.lazyWrapper=wrapper;
    }''')
    page.wait_for_function("lazyWrapper.child?.tagName==='DELAYED-TEST-CARD'")
    page.evaluate('''() => {
      customElements.define('delayed-test-card',class extends HTMLElement {
        constructor(){super();this._hass=null;}
        set hass(value){this._hass=value;}
        setConfig(config){this.config=config;this.textContent=config.title;}
      });
    }''')
    page.wait_for_function("lazyWrapper.child._hass===hass && lazyWrapper.child.textContent==='Delayed card'")
    assert not errors, errors
    print('PASS: a card loaded later through the HA ll-upgrade lifecycle receives its configuration and hass correctly')
    browser.close()
