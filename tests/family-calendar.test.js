import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clone, importLibrary, resolveTemplate, changedTemplates} from '../custom_components/card_library/frontend/library-core.js';
const read = name => JSON.parse(readFileSync(new URL('../examples/family-calendar/'+name,import.meta.url)));
const originalWeek=read('week.json'), originalAgenda=read('agenda.json');
const state=importLibrary(read('family-calendar-library.json'));

test('importable library reproduces both complete user configurations without changing settings',()=>{
  assert.deepEqual(resolveTemplate(state,'family-week'),originalWeek);
  assert.deepEqual(resolveTemplate(state,'family-agenda'),originalAgenda);
});
test('calendar color update changes both real configurations and leaves all other settings intact',()=>{
  const changed=clone(state);
  changed.groups.colors.value['calendar.person_d']='#123456';
  for(const [id,original] of [['family-week',originalWeek],['family-agenda',originalAgenda]]) {
    const expected=clone(original); expected.colors['calendar.person_d']='#123456';
    assert.deepEqual(resolveTemplate(changed,id),expected);
  }
  assert.deepEqual(changedTemplates(state,changed),['family-week','family-agenda']);
});
test('shared family rule colors and icons propagate while agenda retains its two-day option',()=>{
  const changed=clone(state);
  changed.groups.family_event_rules.value[0].background_color='#abcdef';
  changed.groups.event_styles.value[0].style.icon='mdi:swim';
  for(const id of ['family-week','family-agenda']) {
    const config=resolveTemplate(changed,id);
    assert.equal(config.family_event_rules[0].background_color,'#abcdef');
    assert.equal(config.event_styles[0].style.icon,'mdi:swim');
  }
  assert.equal(resolveTemplate(changed,'family-agenda').rolling_days_agenda,2);
  assert.equal(resolveTemplate(changed,'family-week').default_view,'week-compact');
  assert.equal(resolveTemplate(changed,'family-agenda').default_view,'agenda');
});
