import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).parents[1] / 'custom_components/card_library/model.py'
spec = importlib.util.spec_from_file_location('model', path)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


class ValidationTest(unittest.TestCase):
    def library(self):
        return {'templates': {'calendar': {'name': 'Kalender', 'config': {'type': 'custom:calendar'},
                 'bindings': [{'group': 'colors', 'path': ['people']}]}},
                'groups': {'colors': {'name': 'Farben', 'value': [{'color': '#ffffff'}]}}}

    def test_valid_custom_card_and_group(self):
        model.validate_library(self.library())

    def test_referenced_group_cannot_be_deleted(self):
        data = self.library()
        data['groups'].clear()
        with self.assertRaises(ValueError):
            model.validate_library(data)

    def test_conflicting_bindings(self):
        data = self.library()
        data['templates']['calendar']['bindings'].append({'group': 'colors', 'path': ['people', 0]})
        with self.assertRaises(ValueError):
            model.validate_library(data)

    def test_recursive_template_and_unsafe_path(self):
        data = self.library()
        data['templates']['calendar']['config']['type'] = 'custom:library-card'
        with self.assertRaises(ValueError):
            model.validate_library(data)
        data = self.library()
        data['templates']['calendar']['bindings'][0]['path'] = ['__proto__']
        with self.assertRaises(ValueError):
            model.validate_library(data)

    def test_library_size_limit(self):
        data = self.library()
        data['groups']['colors']['value'] = 'x' * 2_000_001
        with self.assertRaises(ValueError):
            model.validate_library(data)




class HistoryAndPeopleTest(unittest.TestCase):
    def test_migrate_legacy_and_hide_history(self):
        state = {'revision': 4, 'templates': {}, 'groups': {}}
        new = model.commit(state, {'templates': {}, 'groups': {}})
        self.assertEqual(new['revision'], 5)
        self.assertEqual(new['people'], {})
        self.assertEqual(new['history'][0]['revision'], 4)
        self.assertNotIn('history', model.public_state(new))

    def test_bounded_history_and_restore_creates_new_revision(self):
        state = {'revision': 0, 'templates': {}, 'groups': {}}
        for i in range(15):
            state = model.commit(state, {'templates': {}, 'groups': {'g': {'name': 'G', 'value': i}}})
        self.assertEqual(len(state['history']), 10)
        target = state['history'][0]
        restored = model.commit(state, target['library'])
        self.assertEqual(restored['revision'], 16)
        self.assertEqual(restored['groups'], target['library']['groups'])
        self.assertEqual(restored['history'][-1]['library']['groups']['g']['value'], 14)

    def test_people_color_binding_and_missing_reference(self):
        data = {'templates': {'calendar': {'name': 'Kalender', 'config': {'type': 'custom:calendar'},
                'bindings': [{'person': 'anna', 'field': 'color', 'path': ['color']}] }},
                'groups': {}, 'people': {'anna': {'name': 'Anna', 'color': '#abcdef'}}}
        model.validate_library(data)
        data['people'].clear()
        with self.assertRaises(ValueError):
            model.validate_library(data)

    def test_nested_library_card_and_bad_dependency(self):
        data = {'templates': {'stack': {'name': 'Stack', 'config': {'type': 'vertical-stack',
                'cards': [{'type': 'custom:library-card'}]}}}, 'groups': {}}
        with self.assertRaises(ValueError):
            model.validate_library(data)
        data['templates']['stack']['config']['cards'] = []
        data['templates']['stack']['dependencies'] = ['javascript:bad']
        with self.assertRaises(ValueError):
            model.validate_library(data)


if __name__ == '__main__':
    unittest.main()


class RobustValidationTest(unittest.TestCase):
    def library(self):
        return {'templates': {'t': {'name': 'T', 'config': {'type': 'custom:calendar', 'colors': {}},
                'bindings': [{'group': 'g', 'path': ['colors']}]}},
                'groups': {'g': {'name': 'G', 'value': {}}}, 'people': {}}

    def test_resolved_group_cannot_inject_recursive_card(self):
        data = self.library()
        data['groups']['g']['value'] = {'type': 'custom:library-card'}
        with self.assertRaises(ValueError): model.validate_library(data)

    def test_path_into_primitive_and_sparse_list_is_rejected(self):
        for config, path in [({'type': 'custom:c', 'x': 1}, ['x', 'y']),
                             ({'type': 'custom:c', 'x': []}, ['x', 'length']),
                             ({'type': 'custom:c', 'x': []}, ['x', 3]),
                             ({'type': 'custom:c'}, ['x', 10000])]:
            data = self.library()
            data['templates']['t']['config'] = config
            data['templates']['t']['bindings'][0]['path'] = path
            with self.assertRaises(ValueError): model.validate_library(data)

    def test_nonfinite_unsafe_keys_and_deep_values_rejected(self):
        for value in [float('nan'), float('inf'), {'__proto__': {}}, 10**1000]:
            data = self.library(); data['groups']['g']['value'] = value
            with self.assertRaises(ValueError): model.validate_library(data)
        data = self.library(); cursor = data['groups']['g']['value']
        for _ in range(70): cursor['child'] = {}; cursor = cursor['child']
        with self.assertRaises(ValueError): model.validate_library(data)

    def test_unicode_size_counts_utf8_not_ascii_escapes(self):
        data = self.library(); data['groups']['g']['value'] = 'ä' * 400000
        model.validate_library(data)
        data['groups']['g']['value'] = 'ä' * 1000000
        with self.assertRaises(ValueError): model.validate_library(data)

    def test_append_binding_and_dual_reference_validation(self):
        data = self.library(); data['templates']['t']['config']['x'] = []
        data['templates']['t']['bindings'][0]['path'] = ['x', 0]
        model.validate_library(data)
        data['templates']['t']['bindings'][0]['person'] = 'p'
        data['people']['p'] = {'name': 'P', 'color': '#112233'}
        with self.assertRaises(ValueError): model.validate_library(data)

class DesignFieldsTest(unittest.TestCase):
    def library(self, paths):
        return {'templates': {'t': {'name': 'Test', 'config': {'type':'custom:test','style':{'color':'red'},'entities':['sensor.a']}, 'design_paths': paths}}, 'groups':{},'people':{}}

    def test_valid_nested_and_list_design_paths(self):
        data=self.library([['style','color'],['entities',0]])
        self.assertEqual(model.validate_library(data)['templates']['t']['design_paths'],data['templates']['t']['design_paths'])

    def test_invalid_design_metadata_is_rejected(self):
        for paths in (None, [['type']], [['missing']], [['style'],['style','color']], [['entities',True]], [['__proto__']], [['entities',99]]):
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                model.validate_library(self.library(paths))

    def test_design_metadata_preserved_in_history_and_public_state(self):
        data=self.library([['style']]);state=model.commit({'templates':{},'groups':{},'people':{},'revision':0},data)
        self.assertEqual(model.public_state(state)['templates']['t']['design_paths'],[['style']])
        newer=model.commit(state,self.library([]));self.assertEqual(newer['history'][-1]['library']['templates']['t']['design_paths'],[['style']])

    def test_design_field_created_by_binding_is_valid(self):
        data=self.library([['injected']]);data['groups']={'color':{'name':'Color','value':'#abcdef'}}
        data['templates']['t']['bindings']=[{'path':['injected'],'group':'color'}]
        model.validate_library(data)

class ResolvedDepthTest(unittest.TestCase):
    def test_group_insertion_cannot_exceed_resolved_card_depth_limit(self):
        value='leaf'
        for _ in range(40): value={'nested':value}
        data={'templates':{'t':{'name':'Test','config':{'type':'markdown'},'bindings':[{'path':['nested']*32,'group':'deep'}]}},'groups':{'deep':{'name':'Deep','value':value}},'people':{}}
        with self.assertRaisesRegex(ValueError,'deeply nested'):model.validate_library(data)


class SharedYamlStructureTest(unittest.TestCase):
    def test_binding_write_changes_only_the_selected_yaml_alias_path(self):
        for copy_value in (True, False):
            with self.subTest(copy_value=copy_value):
                shared = {'style': {'color': 'original'}}
                config = {'first': shared, 'second': shared}
                model.set_at(config, ['first', 'style', 'color'], 'central', copy_value=copy_value)
                self.assertEqual(config['first']['style']['color'], 'central')
                self.assertEqual(config['second']['style']['color'], 'original')
                self.assertEqual(shared['style']['color'], 'original')

    def test_reused_subtree_is_validated_once(self):
        class CountingList(list):
            visits = 0

            def __iter__(self):
                type(self).visits += 1
                return super().__iter__()

        value = 'leaf'
        for _ in range(20):
            value = CountingList([value, value])
        model.validate_json(value)
        self.assertEqual(CountingList.visits, 20)

    def test_subtree_reused_at_deeper_path_still_checks_depth(self):
        shared = {'value': 'leaf'}
        nested = shared
        for _ in range(64):
            nested = {'nested': nested}
        with self.assertRaisesRegex(ValueError, 'deeply nested'):
            model.validate_json([shared, nested])

    def test_circular_reference_is_rejected_immediately(self):
        value = []
        value.append(value)
        with self.assertRaisesRegex(ValueError, 'circular references'):
            model.validate_json(value)

    def test_serialized_alias_expansion_is_bounded_before_copying(self):
        from unittest.mock import patch
        value = 'leaf'
        for _ in range(30):
            value = [value, value]
        data = {'templates': {'t': {'name': 'Test', 'config': {'type': 'markdown', 'aliases': value}}}, 'groups': {}}
        with patch.object(model.copy, 'deepcopy', side_effect=AssertionError('Oversized aliases must not be copied')):
            with self.assertRaisesRegex(ValueError, 'exceeds 2 MB'):
                model.validate_library(data)


class ResolvedBindingSizeTest(unittest.TestCase):
    def library(self, copies):
        return {'templates': {'t': {'name': 'Shared content', 'config': {'type': 'custom:test'},
                'bindings': [{'group': 'large', 'path': [f'field_{index}']} for index in range(copies)]}},
                'groups': {'large': {'name': 'Large', 'value': {'rows': [{'title': 'Shared row', 'color': '#abcdef'}] * 5000}}},
                'people': {}}

    def test_repeated_bindings_are_bounded_without_copying_each_group(self):
        from unittest.mock import patch
        data = self.library(20)
        original = model.set_at
        def check(value, path, bound, *, copy_value=True):
            self.assertFalse(copy_value, 'Resolved validation must not clone each shared value')
            return original(value, path, bound, copy_value=copy_value)
        with patch.object(model, 'set_at', side_effect=check):
            with self.assertRaisesRegex(ValueError, 'exceeds 2 MB'):
                model.validate_library(data)

    def test_normal_repeated_bindings_remain_valid_and_do_not_mutate_inputs(self):
        import copy
        data = self.library(2)
        before = copy.deepcopy(data)
        validated = model.validate_library(data)
        self.assertEqual(validated, before)
        self.assertEqual(data, before)
        self.assertNotIn('field_0', validated['templates']['t']['config'])
        self.assertNotIn('field_1', validated['templates']['t']['config'])


class PopupValidationTest(unittest.TestCase):
    def library(self):
        return {'templates': {'calendar': {'name': 'Kalender', 'config': {'type': 'markdown', 'content': 'x'}, 'popup': {'hash': '#kalender', 'options': {'name': 'Familie'}}}}, 'groups': {}, 'people': {}}

    def test_popup_metadata_is_preserved(self):
        data = self.library()
        self.assertEqual(model.validate_library(data)['templates']['calendar']['popup'], data['templates']['calendar']['popup'])

    def test_duplicate_hash_is_rejected(self):
        import copy
        data = self.library()
        data['templates']['second'] = copy.deepcopy(data['templates']['calendar'])
        with self.assertRaises(ValueError):
            model.validate_library(data)

    def test_invalid_popup_routes_are_rejected(self):
        for route in [None, [], {'hash': '#'}, {'hash': 'kalender'}, {'hash': '#space here'}, {'hash': '#card-library-popup-internal'}, {'hash': '#ok', 'options': None}, {'hash': '#ok', 'options': {'cards': []}}, {'hash': '#ok', 'unexpected': True}]:
            with self.subTest(route=route):
                data = self.library()
                data['templates']['calendar']['popup'] = route
                with self.assertRaises(ValueError):
                    model.validate_library(data)

    def test_shared_binding_cannot_turn_popup_content_into_another_popup(self):
        data = self.library()
        data['templates']['calendar']['config'] = {'type': 'custom:bubble-card', 'card_type': 'button'}
        data['templates']['calendar']['bindings'] = [{'group': 'kind', 'path': ['card_type']}]
        data['groups']['kind'] = {'name': 'Card type', 'value': 'button'}
        model.validate_library(data)
        data['groups']['kind']['value'] = 'pop-up'
        with self.assertRaisesRegex(ValueError, 'standalone Bubble popup with cards'):
            model.validate_library(data)

    def test_original_native_popups_route_without_metadata_and_remain_unchanged(self):
        import copy
        configurations = [
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'cards': [{'type': 'markdown', 'content': 'x'}], 'styles': 'ha-card { border: 0; }'},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native'}, {'type': 'markdown', 'content': 'x'}]},
        ]
        for config in configurations:
            with self.subTest(config=config):
                data = self.library()
                data['templates']['calendar'] = {'name': 'Native', 'config': config}
                original = copy.deepcopy(data)
                self.assertEqual(model.validate_library(data), original)
                self.assertEqual(data, original)
                data['templates']['calendar']['popup'] = {'hash': '#override', 'options': {'name': 'Explicit'}}
                self.assertEqual(model.validate_library(data), data)

    def test_native_popup_drafts_can_be_saved_without_assigning_a_route(self):
        for hash_value in [None, '']:
            with self.subTest(hash=hash_value):
                data = self.library()
                data['templates']['calendar'] = {'name': 'Draft', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': hash_value}}
                model.validate_library(data)
        del data['templates']['calendar']['config']['hash']
        model.validate_library(data)

    def test_unsupported_native_popups_remain_normal_templates_until_explicitly_assigned(self):
        for config in [
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native'},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'cards': []}, {'type': 'markdown'}]},
        ]:
            with self.subTest(config=config):
                data = self.library()
                data['templates']['calendar'] = {'name': 'Native', 'config': config}
                self.assertEqual(model.validate_library(data), data)
                data['templates']['calendar']['popup'] = {'hash': '#explicit'}
                with self.assertRaisesRegex(ValueError, 'standalone Bubble popup with cards'):
                    model.validate_library(data)

    def test_legacy_popup_headers_remain_backward_compatible_without_claiming_hashes(self):
        data = self.library()
        data['templates']['legacy'] = {'name': 'Legacy header', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#kalender'}}
        self.assertEqual(model.validate_library(data), data)
        data['templates']['legacy']['config']['hash'] = '#previously accepted legacy hash'
        self.assertEqual(model.validate_library(data), data)
        data['templates']['legacy']['popup'] = {'hash': '#explicit'}
        with self.assertRaisesRegex(ValueError, 'standalone Bubble popup with cards'):
            model.validate_library(data)

    def test_native_hashes_and_explicit_routes_share_a_duplicate_namespace(self):
        import copy
        data = self.library()
        data['templates']['native'] = {'name': 'Native', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#kalender', 'cards': []}}
        with self.assertRaisesRegex(ValueError, 'Duplicate popup hash'):
            model.validate_library(data)
        data['templates']['native']['popup'] = {'hash': '#override'}
        model.validate_library(data)
        del data['templates']['native']['popup']
        del data['templates']['calendar']
        data['templates']['second'] = copy.deepcopy(data['templates']['native'])
        with self.assertRaisesRegex(ValueError, 'Duplicate popup hash'):
            model.validate_library(data)

    def test_native_popup_hashes_and_frames_follow_shared_bindings(self):
        data = self.library()
        data['templates']['calendar'] = {'name': 'Bound', 'config': {'type': 'vertical-stack', 'cards': []}, 'bindings': [{'path': ['cards'], 'group': 'cards'}]}
        data['groups']['cards'] = {'name': 'Cards', 'value': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#bound'}, {'type': 'markdown'}]}
        model.validate_library(data)
        data['templates']['duplicate'] = {'name': 'Duplicate', 'config': {'type': 'markdown'}, 'popup': {'hash': '#bound'}}
        with self.assertRaisesRegex(ValueError, 'Duplicate popup hash'):
            model.validate_library(data)
        del data['templates']['duplicate']
        for invalid in ['#', 'invalid', '#space here', '#bound\n', '#card-library-popup-internal', 42, False, ['#bound']]:
            with self.subTest(hash=invalid):
                data['groups']['cards']['value'][0]['hash'] = invalid
                with self.assertRaises(ValueError):
                    model.validate_library(data)


class PopupLinksValidationTest(unittest.TestCase):
    def library(self):
        return {'templates': {'calendar': {'name': 'Kalender', 'config': {'type': 'vertical-stack', 'cards': [
            {'type': 'markdown', 'content': 'Central', 'entity': 'sensor.central'},
            {'type': 'markdown', 'content': 'Second'},
        ]}, 'popup_links': [
            {'hash': '#wohnzimmer', 'overrides': [{'path': ['cards', 0, 'entity'], 'value': 'sensor.wohnzimmer'}], 'options': {'name': 'Wohnzimmer', 'width_desktop': '600px'}},
            {'hash': '#flur', 'overrides': [{'path': ['cards', 0, 'entity'], 'value': 'sensor.flur'}], 'options': {'name': 'Flur'}},
        ]}}, 'groups': {}, 'people': {}}

    def test_multiple_aliases_need_no_base_route_and_preserve_original_configuration(self):
        import copy
        data = self.library()
        original = copy.deepcopy(data)
        self.assertEqual(model.validate_library(data), original)
        self.assertEqual(data, original)
        self.assertNotIn('popup', data['templates']['calendar'])
        for link in data['templates']['calendar']['popup_links']:
            resolved = model.apply_popup_overrides(data['templates']['calendar']['config'], [], link['overrides'])
            self.assertEqual(resolved['cards'][0]['entity'], 'sensor.' + link['hash'][1:])
            self.assertEqual(resolved['cards'][0]['content'], 'Central')

    def test_native_base_hash_and_multiple_aliases_remain_separate(self):
        data = self.library()
        template = data['templates']['calendar']
        template['config'] = {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#central',
                              'cards': template['config']['cards'], 'columns': 6}
        template['popup'] = {'hash': '#base', 'options': {'name': 'Central', 'styles': 'ha-card { border: 0; }'}}
        template['popup_links'][0]['overrides'].append({'path': ['hash'], 'value': '#ignored-native-local'})
        validated = model.validate_library(data)
        self.assertEqual(validated['templates']['calendar']['config']['hash'], '#central')
        self.assertEqual(validated['templates']['calendar']['popup']['hash'], '#base')
        self.assertEqual(validated['templates']['calendar']['popup_links'], template['popup_links'])
        self.assertNotIn('styles', validated['templates']['calendar']['popup_links'][0]['options'])

    def test_base_and_alias_routes_have_one_global_duplicate_namespace(self):
        import copy
        for duplicate in ['same-template-alias', 'same-template-base', 'other-alias', 'other-native', 'other-explicit']:
            with self.subTest(duplicate=duplicate):
                data = self.library()
                template = data['templates']['calendar']
                if duplicate == 'same-template-alias':
                    template['popup_links'].append({'hash': '#wohnzimmer'})
                elif duplicate == 'same-template-base':
                    template['popup'] = {'hash': '#wohnzimmer'}
                elif duplicate == 'other-alias':
                    data['templates']['other'] = copy.deepcopy(template)
                elif duplicate == 'other-native':
                    data['templates']['other'] = {'name': 'Other', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#flur', 'cards': []}}
                else:
                    data['templates']['other'] = {'name': 'Other', 'config': {'type': 'markdown'}, 'popup': {'hash': '#flur'}}
                with self.assertRaisesRegex(ValueError, 'Duplicate popup hash'):
                    model.validate_library(data)

    def test_invalid_link_metadata_and_options_are_rejected(self):
        invalid = [None, {}, [None], [[]], [{}], [{'hash': '#'}], [{'hash': '#flur\n'}],
                   [{'hash': '#card-library-popup-private'}], [{'hash': '#ok', 'template': 'other'}],
                   [{'hash': '#ok', 'options': None}], [{'hash': '#ok', 'options': []}],
                   [{'hash': '#ok', 'overrides': None}], [{'hash': '#ok', 'overrides': {}}]]
        for key in ['type', 'card_type', 'hash', 'cards']:
            invalid.append([{'hash': '#ok', 'options': {key: 'unsafe'}}])
        for links in invalid:
            with self.subTest(links=links):
                data = self.library()
                data['templates']['calendar']['popup_links'] = links
                with self.assertRaises(ValueError):
                    model.validate_library(data)

    def test_invalid_override_paths_values_and_recursive_cards_are_rejected(self):
        overrides = [None, [], {}, {'path': []}, {'path': ['type'], 'value': 'button'},
                     {'path': ['__proto__'], 'value': {}}, {'path': ['cards', True], 'value': {}},
                     {'path': ['cards', 7], 'value': {}}, {'path': ['cards', '0'], 'value': {}},
                     {'path': ['missing']}, {'path': ['cards', 0], 'value': {'type': 'custom:library-card'}},
                     {'path': ['card_mod'], 'value': {'constructor': {}}}]
        for override in overrides:
            with self.subTest(override=override):
                data = self.library()
                data['templates']['calendar']['popup_links'][0]['overrides'] = [override]
                with self.assertRaises(ValueError):
                    model.validate_library(data)

    def test_ordered_overrides_and_style_changes_do_not_change_source_or_alias_values(self):
        import copy
        data = self.library()
        style = {'style': {'ha-card $': {'color': 'red', 'background': 'transparent'}}}
        overrides = [
            {'path': ['card_mod'], 'value': style},
            {'path': ['card_mod', 'style', 'ha-card $', 'color'], 'value': 'blue'},
            {'path': ['cards', 0], 'remove': True},
            {'path': ['cards', 0, 'content'], 'value': 'Local second'},
        ]
        data['templates']['calendar']['popup_links'][0]['overrides'] = overrides
        original = copy.deepcopy(data)
        model.validate_library(data)
        resolved = model.apply_popup_overrides(data['templates']['calendar']['config'], [], overrides)
        self.assertEqual(resolved['cards'], [{'type': 'markdown', 'content': 'Local second'}])
        self.assertEqual(resolved['card_mod']['style']['ha-card $']['color'], 'blue')
        self.assertEqual(data, original)
        self.assertEqual(style['style']['ha-card $']['color'], 'red')

    def test_shared_bindings_and_shared_list_structure_cannot_be_overridden(self):
        for override in [
            {'path': ['cards', 0, 'content'], 'value': 'Local'},
            {'path': ['cards', 0], 'value': {'type': 'markdown'}},
            {'path': ['cards', 1], 'remove': True},
            {'path': ['cards'], 'value': []},
        ]:
            with self.subTest(override=override):
                data = self.library()
                template = data['templates']['calendar']
                template['bindings'] = [{'path': ['cards', 0, 'content'], 'group': 'text'}]
                data['groups']['text'] = {'name': 'Text', 'value': 'Shared content'}
                template['popup_links'][0]['overrides'] = [override]
                with self.assertRaisesRegex(ValueError, 'Shared settings|list structure'):
                    model.validate_library(data)

    def test_central_group_updates_remain_linked_while_local_siblings_are_retained(self):
        import copy
        data = self.library()
        template = data['templates']['calendar']
        template['bindings'] = [{'path': ['cards', 0, 'content'], 'group': 'text'}]
        data['groups']['text'] = {'name': 'Text', 'value': 'Shared A'}
        before = copy.deepcopy(data)
        model.validate_library(data)
        data['groups']['text']['value'] = 'Shared B'
        validated = model.validate_library(data)
        for link in template['popup_links']:
            config = copy.deepcopy(template['config'])
            model.set_at(config, template['bindings'][0]['path'], data['groups']['text']['value'])
            resolved = model.apply_popup_overrides(config, template['bindings'], link['overrides'])
            self.assertEqual(resolved['cards'][0]['content'], 'Shared B')
            self.assertEqual(resolved['cards'][0]['entity'], 'sensor.' + link['hash'][1:])
        self.assertEqual(validated['templates']['calendar'], before['templates']['calendar'])

    def test_aliases_reject_unsupported_or_nested_native_popup_frames(self):
        configs = [
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#legacy'},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#legacy', 'cards': []}]},
            {'type': 'horizontal-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#nested', 'cards': []}]},
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'cards': []}]},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native'}, {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'cards': []}]},
        ]
        for config in configs:
            with self.subTest(config=config):
                data = self.library()
                data['templates']['calendar'] = {'name': 'Legacy', 'config': config}
                model.validate_library(data)  # Old templates remain compatible.
                data['templates']['calendar']['popup_links'] = [{'hash': '#alias'}]
                with self.assertRaisesRegex(ValueError, 'standalone Bubble popup|another Bubble popup'):
                    model.validate_library(data)

    def test_valid_native_and_classic_frames_keep_original_design_and_grid(self):
        for standalone in [True, False]:
            with self.subTest(standalone=standalone):
                data = self.library()
                header = {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'styles': 'ha-card { color: red; }'}
                content = {'type': 'markdown', 'content': 'Central', 'grid_options': {'columns': 6, 'rows': 2}}
                config = {**header, 'cards': [content]} if standalone else {'type': 'vertical-stack', 'cards': [header, content], 'card_mod': {'style': 'ha-card { border: 0; }'}}
                data['templates']['calendar'] = {'name': 'Native', 'config': config, 'popup_links': [{'hash': '#variant'}]}
                self.assertEqual(model.validate_library(data), data)

    def test_local_expansion_cannot_exceed_card_size_limit(self):
        data = self.library()
        template = data['templates']['calendar']
        template['config'] = {'type': 'markdown'}
        template['bindings'] = [{'path': ['a'], 'group': 'large'}, {'path': ['b'], 'group': 'large'}]
        data['groups']['large'] = {'name': 'Large', 'value': 'x' * 610000}
        template['popup_links'] = [{'hash': '#variant', 'overrides': [{'path': ['extra'], 'value': 'x' * 800000}]}]
        with self.assertRaisesRegex(ValueError, 'exceeds 2 MB'):
            model.validate_library(data)

    def test_bound_content_is_revalidated_after_central_changes(self):
        data = self.library()
        template = data['templates']['calendar']
        template['config'] = {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'cards': []}
        template['bindings'] = [{'path': ['cards'], 'group': 'cards'}]
        template['popup_links'] = [{'hash': '#variant'}]
        data['groups']['cards'] = {'name': 'Cards', 'value': [{'type': 'markdown', 'content': 'Initial'}]}
        model.validate_library(data)
        data['groups']['cards']['value'] = [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'cards': []}]
        with self.assertRaisesRegex(ValueError, 'another Bubble popup'):
            model.validate_library(data)

    def test_links_survive_public_state_history_and_restore_without_resolved_copies(self):
        data = self.library()
        empty = {'templates': {}, 'groups': {}, 'people': {}, 'revision': 0}
        first = model.commit(empty, data)
        self.assertEqual(model.public_state(first)['templates']['calendar']['popup_links'], data['templates']['calendar']['popup_links'])
        second = model.commit(first, {'templates': {}, 'groups': {}, 'people': {}})
        self.assertEqual(second['history'][-1]['library']['templates']['calendar'], data['templates']['calendar'])
        restored = model.commit(second, second['history'][-1]['library'])
        self.assertEqual(restored['revision'], 3)
        self.assertEqual(restored['templates']['calendar'], data['templates']['calendar'])


class TemplateWorkflowValidationTest(unittest.TestCase):
    def state(self):
        return {'revision':0,'templates':{'t':{'name':'Protected','protected':True,'config':{'type':'markdown','content':'original'}}},'groups':{},'people':{}}
    def test_protection_blocks_edit_delete_and_unlock_with_changes(self):
        import copy
        state=self.state()
        for operation in ['edit','delete','unlock_and_edit']:
            candidate=model.library_only(state)
            if operation=='delete':candidate['templates'].clear()
            else:
                candidate['templates']['t']['config']['content']='changed'
                if operation=='unlock_and_edit':candidate['templates']['t']['protected']=False
            with self.subTest(operation=operation),self.assertRaises(ValueError):model.commit(state,candidate)
        self.assertEqual(state['templates']['t']['config']['content'],'original')
    def test_unlock_requires_separate_commit_then_allows_editing(self):
        state=self.state();candidate=model.library_only(state);candidate['templates']['t']['protected']=False
        unlocked=model.commit(state,candidate);candidate=model.library_only(unlocked);candidate['templates']['t']['config']['content']='changed'
        self.assertEqual(model.commit(unlocked,candidate)['templates']['t']['config']['content'],'changed')
    def test_protection_allows_independent_hash_exceptions(self):
        state=self.state();candidate=model.library_only(state);candidate['templates']['t']['popup_links']=[{'hash':'#local','overrides':[{'path':['content'],'value':'local'}]}]
        result=model.commit(state,candidate);self.assertTrue(result['templates']['t']['protected']);self.assertEqual(result['templates']['t']['config']['content'],'original')
    def test_input_schema_and_values(self):
        state=self.state();template=state['templates']['t'];template['inputs']=[{'path':['entity'],'label':'E','type':'entity','required':True,'domains':['cover']}]
        model.validate_library(model.library_only(state))
        for config in [{},{'entity':' '},{'entity':'light.x'}]:
            with self.assertRaises(ValueError):model.validate_input_values(template,config)
        model.validate_input_values(template,{'entity':'cover.x'})
    def test_metadata_rejects_nulls_and_overlapping_paths(self):
        for fields in [{'protected':None},{'category':None},{'inputs':None},{'inputs':[{'path':['type'],'label':'Bad','type':'text'}]},{'inputs':[{'path':['entity'],'label':'A','type':'text'},{'path':['entity'],'label':'B','type':'text'}]}]:
            candidate=model.library_only(self.state());candidate['templates']['t'].update(fields)
            with self.subTest(fields=fields),self.assertRaises(ValueError):model.validate_library(candidate)

class ProtectedImportTest(unittest.TestCase):
    def test_import_cannot_unlock_a_template_while_changing_unrelated_data(self):
        state={'revision':0,'templates':{'t':{'name':'T','protected':True,'config':{'type':'markdown'}}},'groups':{},'people':{}}
        candidate=model.library_only(state);candidate['templates']['t']['protected']=False;candidate['groups']['g']={'name':'New','value':1}
        with self.assertRaises(ValueError):model.commit(state,candidate)
