"""Compare browser/backend acceptance across a deterministic invalid-input matrix."""
import copy
import json
import pathlib
import subprocess
import unittest
from test_model import model

ROOT = pathlib.Path(__file__).parents[1]

class ValidationParityTest(unittest.TestCase):
    def test_browser_and_backend_accept_the_same_library_inputs(self):
        base = {'templates': {'t': {'name': 'Card', 'config': {'type': 'markdown', 'content': 'Text', 'items': ['sensor.a']}, 'bindings': [], 'dependencies': [], 'design_paths': []}}, 'groups': {'g': {'name': 'Group', 'value': 'value'}}, 'people': {'p': {'name': 'Person', 'color': '#112233'}}}
        cases = [base]
        values = [None, False, True, 0, -1, '', ' ', [], {}, 'valid', ['x'], {'x': 1}]
        paths = [['templates'], ['groups'], ['people'], ['templates', 't'], ['templates', 't', 'name'], ['templates', 't', 'config'], ['templates', 't', 'config', 'type'], ['templates', 't', 'bindings'], ['templates', 't', 'dependencies'], ['templates', 't', 'design_paths'], ['templates', 't', 'popup'], ['templates', 't', 'popup_links'], ['groups', 'g'], ['groups', 'g', 'value'], ['people', 'p'], ['people', 'p', 'color']]
        for path in paths:
            for value in values:
                data = copy.deepcopy(base)
                cursor = data
                for part in path[:-1]: cursor = cursor[part]
                cursor[path[-1]] = value
                cases.append(data)
        for path in [[], ['type'], ['items', 0], ['items', '0'], ['content', 0], ['missing'], ['__proto__'], [True], [99999]]:
            data = copy.deepcopy(base)
            data['templates']['t']['design_paths'] = [path]
            cases.append(data)
            for ref in [{'group': 'g'}, {'person': 'p', 'field': 'color'}, {'group':'missing'}, {'person':'p','group':'g','field':'color'}]:
                data = copy.deepcopy(base)
                data['templates']['t']['bindings'] = [{'path': path, **ref}]
                cases.append(data)
        for text in ['\u0085', '\ufeff', '\u001c', '\u0085\ufeff', '😀', '\ud800', '\udfff']:
            for field in ['name', 'type']:
                data = copy.deepcopy(base)
                if field == 'name': data['templates']['t']['name'] = text
                else: data['templates']['t']['config']['type'] = text
                cases.append(data)
        for identifier in ['😀' * 70, '😀' * 128, '😀' * 129, '\ud800', 'toString']:
            data = copy.deepcopy(base)
            data['templates'] = {identifier: data['templates']['t']}
            cases.append(data)
        for width in [None, True, False, 0, -1, 1030, 500.5, '1030']:
            for card in [{'type':'horizontal-stack','cards':[]}, {}, [], None]:
                data = copy.deepcopy(base)
                data['templates']['t']['config'] = {'type':'custom:library-container-card','max_width':width,'card':card}
                cases.append(data)
        for text in ['\ufeff', '\u0085', '\u001c', ' \ufeff\n', 'markdown']:
            data = copy.deepcopy(base)
            data['templates']['t']['config'] = {'type': 'custom:library-container-card', 'card': {'type': text}}
            cases.append(data)
        for color in ['#abcdef\n', ['#abcdef'], '#abcdef']:
            data = copy.deepcopy(base)
            data['people']['p']['color'] = color
            cases.append(data)
        for route in [{'hash': '#kalender'}, {'hash': '#kalender', 'options': {'styles': 'ha-card { border: 0; }'}}, {'hash': '#kalender', 'options': None}, {'hash': '#kalender', 'options': []}, {'hash': '#kalender', 'options': {'type': 'markdown'}}, {'hash': '#space here'}, {'hash': '#kalender\n'}, {'hash': '#card-library-popup-internal'}]:
            data = copy.deepcopy(base)
            data['templates']['t']['popup'] = route
            cases.append(data)
        for initial_kind in ['button', 'pop-up']:
            for kind in ['button', 'pop-up']:
                data = copy.deepcopy(base)
                data['templates']['t']['config'] = {'type': 'custom:bubble-card', 'card_type': initial_kind}
                data['templates']['t']['bindings'] = [{'group': 'g', 'path': ['card_type']}]
                data['templates']['t']['popup'] = {'hash': '#bound-popup'}
                data['groups']['g']['value'] = kind
                cases.append(data)
        for hash_value in [None, '', '#native', '#', '#native\n', '#card-library-popup-internal', False, ['#native']]:
            for standalone in [True, False]:
                for supported in [True, False]:
                    header = {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': hash_value}
                    if standalone and supported or not standalone and not supported:
                        header['cards'] = []
                    config = header if standalone else {'type': 'vertical-stack', 'cards': [header, {'type': 'markdown', 'content': 'x'}]}
                    for explicit in [False, True]:
                        data = copy.deepcopy(base)
                        data['templates']['t']['config'] = config
                        if explicit:
                            data['templates']['t']['popup'] = {'hash': '#explicit', 'options': {'name': 'Override'}}
                        cases.append(data)
        for binding_path, bound_value, config in [
            (['cards'], [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#bound'}, {'type': 'markdown'}], {'type': 'vertical-stack', 'cards': []}),
            (['cards', 0], {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#bound'}, {'type': 'vertical-stack', 'cards': [{'type': 'markdown'}, {'type': 'markdown'}]}),
            (['cards', 0, 'hash'], '#bound', {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up'}, {'type': 'markdown'}]}),
            (['cards', 0, 'cards'], [], {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#bound'}, {'type': 'markdown'}]}),
            (['cards'], [], {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#bound'}),
            (['hash'], '#bound', {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'cards': []}),
        ]:
            for duplicate in [False, True]:
                data = copy.deepcopy(base)
                data['templates']['t']['config'] = config
                data['templates']['t']['bindings'] = [{'path': binding_path, 'group': 'g'}]
                data['groups']['g']['value'] = bound_value
                if duplicate:
                    data['templates']['duplicate'] = {'name': 'Duplicate', 'config': {'type': 'markdown'}, 'popup': {'hash': '#bound'}}
                cases.append(data)
        for count in [2, 30]:
            data = copy.deepcopy(base)
            data['groups']['g']['value'] = [{'content': 'Repeated shared calendar data'} for _ in range(5000)]
            data['templates']['t']['bindings'] = [{'group': 'g', 'path': ['group_' + str(index)]} for index in range(count)]
            cases.append(data)
        links = [[], [{'hash': '#a'}, {'hash': '#b', 'options': {'name': 'Variant', 'styles': 'ha-card { color: blue; }'}, 'overrides': [{'path': ['content'], 'value': 'Local'}]}],
                 [None], [[]], [{}], [{'hash': '#'}], [{'hash': '#a\n'}], [{'hash': '#a', 'unknown': True}],
                 [{'hash': '#a', 'options': None}], [{'hash': '#a', 'options': []}], [{'hash': '#a', 'overrides': None}],
                 [{'hash': '#a', 'overrides': {}}], [{'hash': '#a'}, {'hash': '#a'}], [{'hash': '#card-library-popup-private'}]]
        for field in ['type', 'card_type', 'hash', 'cards']:
            links.append([{'hash': '#a', 'options': {field: 'unsafe'}}])
        for override in [None, [], {}, {'path': []}, {'path': ['type'], 'value': 'button'}, {'path': ['__proto__'], 'value': {}},
                         {'path': ['items', True], 'value': 'x'}, {'path': ['items', 3], 'value': 'x'}, {'path': ['items', '0'], 'value': 'x'},
                         {'path': ['new']}, {'path': ['new'], 'value': None}, {'path': ['missing', 'child'], 'remove': True},
                         {'path': ['content', 'child'], 'remove': True}, {'path': ['content', 'child'], 'value': 'x'},
                         {'path': ['items', 0], 'remove': True}, {'path': ['items', 1], 'value': 'sensor.append'},
                         {'path': ['new'], 'value': {'type': 'custom:library-card'}},
                         {'path': ['card_mod'], 'value': {'style': {'ha-card $': 'ha-card { border: 0; }'}}}]:
            links.append([{'hash': '#a', 'overrides': [override]}])
        for popup_links in links:
            data = copy.deepcopy(base)
            data['templates']['t']['popup_links'] = popup_links
            cases.append(data)
        for other in [
            {'name': 'Other', 'config': {'type': 'markdown'}, 'popup': {'hash': '#a'}},
            {'name': 'Other', 'config': {'type': 'markdown'}, 'popup_links': [{'hash': '#a'}]},
            {'name': 'Other', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#a', 'cards': []}},
        ]:
            data = copy.deepcopy(base)
            data['templates']['t']['popup_links'] = [{'hash': '#a'}]
            data['templates']['other'] = other
            cases.append(data)
        for config in [
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#base', 'cards': []},
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#legacy'},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#base'}, {'type': 'markdown'}]},
            {'type': 'vertical-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#legacy', 'cards': []}]},
            {'type': 'horizontal-stack', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#nested', 'cards': []}]},
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#base', 'cards': [{'type': 'custom:bubble-card', 'card_type': 'pop-up', 'cards': []}]},
        ]:
            for overrides in [[], [{'path': ['hash'], 'value': '#local-config'}], [{'path': ['cards'], 'value': []}],
                              [{'path': ['card_type'], 'value': 'button'}], [{'path': ['cards', 0], 'remove': True}]]:
                data = copy.deepcopy(base)
                data['templates']['t']['config'] = config
                data['templates']['t']['popup_links'] = [{'hash': '#a', 'overrides': overrides}]
                cases.append(data)
        for path, value in [(['items', 0], 'local'), (['items'], []), (['items', 1], 'local'), (['content'], 'local')]:
            for remove in [False, True]:
                data = copy.deepcopy(base)
                data['templates']['t']['bindings'] = [{'group': 'g', 'path': ['items', 0]}]
                override = {'path': path, 'remove': True} if remove else {'path': path, 'value': value}
                data['templates']['t']['popup_links'] = [{'hash': '#a', 'overrides': [override]}]
                cases.append(data)
        script = "import {importLibrary} from './custom_components/card_library/frontend/library-core.js';let input='';for await(const chunk of process.stdin)input+=chunk;console.log(JSON.stringify(JSON.parse(input).map(library=>{try{importLibrary({format:'ha-card-library',version:2,library});return true;}catch{return false;}})));"
        result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(cases), capture_output=True, text=True, cwd=ROOT, check=True)
        frontend = json.loads(result.stdout)
        for index, (data, accepted) in enumerate(zip(cases, frontend)):
            try:
                model.validate_library(data)
                backend = True
            except (ValueError, TypeError, KeyError, RecursionError):
                backend = False
            with self.subTest(index=index):
                self.assertEqual(accepted, backend, json.dumps(data))

    def test_generated_local_yaml_roundtrips_with_real_parser(self):
        import yaml
        cases = [
            {'type': 'markdown', 'content': 'true', 'empty': {}, 'list': [], 'values': [None, True, False, 12, 1.5]},
            {'type': 'horizontal-stack', 'cards': [{'type': 'custom:calendar', 'card_mod': {'style': {'.': 'ha-card {\n  background: transparent;\n}\n', 'hui-card $': {'.': 'div { color: red; }'}}}, 'template': '{{ states("sensor.example") }}', 'entity': 'sensor.example'}]},
            {'type': 'markdown', 'content': '😀\n\n', 'ambiguous': ['on', '2026-10-08', 'null', 'a: b', '#abcdef', '001', "'quoted'"], 'selector': {'a.b $': {'x:y': 'none'}}},
        ]
        script = "import {configurationYaml} from './custom_components/card_library/frontend/library-tools.js';let input='';for await(const chunk of process.stdin)input+=chunk;console.log(JSON.stringify(JSON.parse(input).map(config=>configurationYaml(config))));"
        result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(cases), capture_output=True, text=True, cwd=ROOT, check=True)
        for original, generated in zip(cases, json.loads(result.stdout), strict=True):
            with self.subTest(config=original):
                self.assertEqual(yaml.safe_load(generated), original)
