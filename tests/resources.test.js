import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dependencyReport, scanDashboards, usages} from '../custom_components/card_library/frontend/library-tools.js';
import {walkCards, dependencies} from '../custom_components/card_library/frontend/library-core.js';
const urls = JSON.parse(readFileSync(new URL('./fixtures/resources.json', import.meta.url)));
const resources = urls.map((url,index)=>({id:String(index),url,type:'module'}));
globalThis.window={location:{href:'https://ha.example/lovelace/0'}};
globalThis.customElements={get:()=>undefined};

test('all 43 supplied resource URLs match regardless of version parameters', () => {
  assert.equal(urls.length,43);
  for(const url of urls) {
    const required = url.split('?')[0];
    const report = dependencyReport({states:{}},{type:'markdown'},[required],resources);
    assert.deepEqual(report.missingResources,[],url);
  }
});

test('resource comparison respects case-sensitive paths and origin', () => {
  const report=dependencyReport({states:{}},{type:'markdown'},[
    '/hacsfiles/bubble-card/bubble-card.js',
    '/local/Mein_Layout/lichter_karte.js',
    'https://other.example/local/Mein_Layout/Lichter_Karte.js',
    '/hacsfiles/family-calendar-card/family-calendar-card.js?v=next',
  ],resources);
  assert.deepEqual(report.missingResources,[
    '/hacsfiles/bubble-card/bubble-card.js',
    '/local/Mein_Layout/lichter_karte.js',
    'https://other.example/local/Mein_Layout/Lichter_Karte.js',
  ]);
});

test('registered resource is not treated as proof that its card has loaded', () => {
  const report=dependencyReport({states:{}},{type:'custom:family-calendar-card'},[
    '/hacsfiles/family-calendar-card/family-calendar-card.js',
  ],resources);
  assert.deepEqual(report.missingResources,[]);
  assert.deepEqual(report.missingCards,['family-calendar-card']);
});

test('discover library usages inside state-switch, tabs, auto-entities and stack wrappers', () => {
  const config={views:[{cards:[{type:'custom:state-switch',states:{
    home:{type:'custom:tabbed-card',tabs:[{card:{type:'custom:stack-in-card',cards:[{type:'custom:library-card',template:'family'}]}}]},
    away:{type:'custom:auto-entities',card:{type:'custom:library-card',template:'family'},filter:{include:[]}},
  }}]}]};
  const cards=walkCards(config);
  assert.equal(cards.filter(c=>c.config.type==='custom:library-card').length,2);
  assert.ok(cards.some(c=>c.config.type==='custom:tabbed-card'));
  assert.ok(cards.some(c=>c.config.type==='custom:auto-entities'));
  assert.equal(usages({cards},'family').length,2);
  assert.ok(dependencies(config).types.includes('state-switch'));
});

test('HA scan preserves the supplied resource list without treating helper modules as cards', async () => {
  const result=await scanDashboards({callWS:async message=> {
    if(message.type==='lovelace/dashboards/list') return [];
    if(message.type==='lovelace/resources/list') return resources;
    return {views:[{cards:[{type:'markdown',content:'Test'}]}]};
  }});
  assert.equal(result.resources.length,43);
  assert.equal(result.cards.length,1);
  assert.deepEqual(result.failures,[]);
});
