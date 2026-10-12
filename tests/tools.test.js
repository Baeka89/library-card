import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanDashboards, usages, dependencyReport} from '../custom_components/card_library/frontend/library-tools.js';

test('all centrally saved alias hashes count as template usages for deletion protection', () => {
  globalThis.window = {location:{href:'https://ha.example/dashboard/0'}};
  const library = {templates:{t:{name:'Template',config:{type:'markdown'},popup:{hash:'#base'},popup_links:[{hash:'#one'},{hash:'#two',overrides:[{path:['content'],value:'Local'}]}]}},groups:{},people:{}};
  const paths = ['#base','#one','/dashboard-other/1#two','https://outside.example/#two','#other'];
  const cards = paths.map((navigation_path,index)=>({path:['views',0,'cards',index],config:{type:'button',tap_action:{action:'navigate',navigation_path}}}));
  assert.equal(usages({cards},'t',library).length,3);
  assert.deepEqual(usages({cards},'t',library).map(card=>card.path.at(-2)),[0,1,2]);
  assert.deepEqual(usages({cards},'t',library).map(card=>card.reference.popup_hash),['#base','#one','#two']);
});

test('native popup hashes protect templates used only by a dashboard button', () => {
  globalThis.window = {location:{href:'https://ha.example/dashboard/0'}};
  const button = {config:{type:'button',tap_action:{action:'navigate',navigation_path:'#native'}},path:['views',0,'cards',0],url_path:'dashboard'};
  const lib = {templates:{popup:{name:'Popup',config:{type:'custom:bubble-card',card_type:'pop-up',hash:'#native',cards:[{type:'markdown',content:'Saved'}]}}},groups:{},people:{}};
  assert.equal(usages({cards:[button]},'popup',lib).length, 1);
  lib.templates.popup.config = {type:'vertical-stack',cards:[{type:'custom:bubble-card',card_type:'pop-up',hash:'#native'},{type:'markdown',content:'Stack'}]};
  assert.equal(usages({cards:[button]},'popup',lib).length, 1);
});

test('dashboard scan includes default, sections and readable YAML dashboards, reports failures', async () => {
  const calls=[];
  const hass = {callWS:async msg => {
    calls.push(msg);
    if(msg.type==='lovelace/dashboards/list') return [{url_path:'calendar',title:'Kalender',mode:'yaml'},{url_path:'private',title:'Privat'}];
    if(msg.type==='lovelace/resources/list') return [{url:'/hacsfiles/calendar.js?v=1'}];
    if(msg.url_path==='private') throw Error('Zugriff verweigert');
    return {views:[{title:'Familie',sections:[{cards:[{type:'custom:library-card',template:'family'}]}]}]};
  }};
  const result=await scanDashboards(hass);
  assert.equal(usages(result,'family').length,2);
  assert.equal(result.failures.length,1);
  assert.match(result.failures[0],/Privat/);
  assert.equal(result.scanned.length,2);
  assert.equal(calls.filter(c=>c.type==='lovelace/config'&&!c.url_path).length,1);
});

test('dependency report handles nested cards, entity lists and cache-busting URLs', () => {
  globalThis.window={location:{href:'https://ha.example/lovelace/0'}};
  globalThis.customElements={get:type=>type==='calendar' ? {} : undefined};
  const report=dependencyReport({states:{'calendar.anna':{}}},
    {type:'custom:calendar',calendars:['calendar.anna','calendar.ben'],cards:[{type:'custom:missing'}]},
    ['/hacsfiles/calendar.js','/hacsfiles/absent.js'],[{url:'/hacsfiles/calendar.js?v=2'}]);
  assert.deepEqual(report.missingCards,['missing']);
  assert.deepEqual(report.missingEntities,['calendar.ben']);
  assert.deepEqual(report.missingResources,['/hacsfiles/absent.js']);
});

test('scan handles malformed dashboard and resource API responses without crashing',async()=>{
  const result=await scanDashboards({callWS:async msg=>{
    if(msg.type==='lovelace/dashboards/list')return {};
    if(msg.type==='lovelace/resources/list')return {items:[]};
    return {views:[]};
  }});
  assert.equal(result.failures.length,2);assert.equal(result.resourcesAvailable,false);assert.deepEqual(result.resources,[]);
});

test('semantic resource query parameters are retained while version parameters are ignored',()=>{
  globalThis.window={location:{href:'https://ha.example/lovelace/0'}};globalThis.customElements={get:()=>undefined};
  const report=dependencyReport({states:{}},{type:'markdown'},['/card.js?mode=a&v=9','/card.js?mode=b'],[{url:'/card.js?v=1&mode=a'}]);
  assert.deepEqual(report.missingResources,['/card.js?mode=b']);
});

test('library references in custom wrapper fields are counted for deletion checks',async()=>{
  const result=await scanDashboards({callWS:async msg=>{
    if(msg.type==='lovelace/dashboards/list')return [];
    if(msg.type==='lovelace/resources/list')return [];
    return {views:[{cards:[{type:'custom:unknown-wrapper',content:{type:'custom:library-card',template:'calendar'}}]}]};
  }});
  assert.equal(usages(result,'calendar').length,1);
});

test('popup actions and saved hash routes count actual uses without duplicate ancestor stacks', async () => {
  globalThis.window = {location:{href:'https://ha.example/lovelace/0'}};
  const local = [{path:['title'],value:'Local'}];
  const config = {views:[{cards:[{type:'horizontal-stack',cards:[
    {type:'button',tap_action:{action:'fire-dom-event',card_library:{action:'popup',template:'calendar',overrides:local}},hold_action:{action:'navigate',navigation_path:'#kalender'}},
    {type:'custom:mushroom-chips-card',chips:[{type:'action',tap_action:{action:'navigate',navigation_path:'/dashboard-main/0#kalender'}}]},
    {type:'button',tap_action:{action:'navigate',navigation_path:'#unknown'}},
    {type:'button',tap_action:{action:'navigate',navigation_path:'https://other.example/#kalender'}},
    {type:'button',tap_action:{action:'fire-dom-event',card_library:{action:'popup',template:'other'}}},
  ]}]}]};
  const inventory = await scanDashboards({callWS:async message => {
    if (message.type === 'lovelace/dashboards/list' || message.type === 'lovelace/resources/list') return [];
    return config;
  }});
  const library = {templates:{calendar:{popup:{hash:'#kalender'}}}};
  const found = usages(inventory, 'calendar', library);
  assert.equal(found.length, 3);
  assert.deepEqual(found[0].reference.overrides, local);
  assert.deepEqual(found[0].path, ['views',0,'cards',0,'cards',0,'tap_action']);
  assert.equal(usages(inventory, 'calendar').length, 1);
  assert.equal(usages(inventory, 'missing', library).length, 0);
  assert.equal(usages(inventory, 'calendar', {templates:{calendar:{popup:{hash:'#unused'}}}}).length, 1);
});

test('popup usage matches browser-normalized YAML navigation hashes without matching another origin', () => {
  globalThis.window = {location:{href:'https://ha.example/lovelace/0'}};
  const cards = ['#kalender\n','\t#kalender','/dashboard-main/0#kalender\r\n','https://other.example/#kalender\n','#unknown\n'].map((navigation_path,index) => ({path:['views',0,'cards',index],config:{type:'button',tap_action:{action:'navigate',navigation_path}}}));
  const found = usages({cards},'calendar',{templates:{calendar:{popup:{hash:'#kalender'}}}});
  assert.equal(found.length, 3);
  assert.deepEqual(found.map(card => card.path.at(-2)), [0,1,2]);
});
