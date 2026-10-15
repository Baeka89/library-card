"""Verify the production schemas with real voluptuous and probatio validators.
Optional dependencies: pip install voluptuous probatio
"""
import importlib.util
import sys
import types
from unittest.mock import patch
import voluptuous
import probatio
from test_backend import stubs, module, root, require_admin

for validator in (voluptuous, probatio):
    base = validator.Schema({validator.Required('id'): int, validator.Required('type'): str})
    def websocket_command(schema):
        def decorate(function):
            function.schema = base.extend(schema)
            return function
        return decorate
    ws = module('homeassistant.components.websocket_api', websocket_command=websocket_command,
                async_response=lambda fn: fn, require_admin=require_admin,
                decorators=types.SimpleNamespace(**({'probatio': probatio} if validator is probatio else {})))
    name = 'schema_test_' + validator.__name__
    spec = importlib.util.spec_from_file_location(name, root / '__init__.py', submodule_search_locations=[str(root)])
    backend = importlib.util.module_from_spec(spec)
    bindings = {**stubs, name: backend, 'homeassistant.components.websocket_api': ws,
                'homeassistant.components': module('homeassistant.components', websocket_api=ws),
                'voluptuous': voluptuous, 'probatio': probatio}
    with patch.dict(sys.modules, bindings): spec.loader.exec_module(backend)
    assert backend.vol is validator
    handlers = [backend.get_library, backend.save_library, backend.subscribe_library, backend.get_history, backend.restore_library, backend.parse_card, backend.parse_templates, backend.dashboard_get, backend.dashboard_write]
    payloads = [
        {'id': 1, 'type': 'card_library/get'},
        {'id': 2, 'type': 'card_library/save', 'revision': 0, 'library': {}},
        {'id': 3, 'type': 'card_library/subscribe'},
        {'id': 4, 'type': 'card_library/history'},
        {'id': 5, 'type': 'card_library/restore', 'revision': 1, 'target_revision': 0},
        {'id': 6, 'type': 'card_library/parse_card', 'yaml': 'type: markdown'},
        {'id': 7, 'type': 'card_library/parse_templates', 'yaml': 'button_card_templates: {}'},
        {'id':8,'type':'card_library/dashboard_get','dashboard':''},
        {'id':9,'type':'card_library/dashboard_write','dashboard':'','fingerprint':'a'*64,'path':['views',0,'cards',0],'value':{},'operation':'replace','library_revision':0,'source':{}},
    ]
    for handler, payload in zip(handlers, payloads):
        assert handler.schema(payload) == payload
        malformed = dict(payload); malformed.pop('id')
        try: handler.schema(malformed)
        except validator.Invalid: pass
        else: raise AssertionError('Missing id accepted')
    for field in ('revision', 'target_revision'):
        for invalid in (True, -1, 0.5, '1'):
            payload = {**payloads[4], field: invalid}
            try: backend.restore_library.schema(payload)
            except validator.Invalid: pass
            else: raise AssertionError('Invalid revision accepted')
    try: backend.save_library.schema({**payloads[1], 'library': []})
    except validator.Invalid: pass
    else: raise AssertionError('Invalid library accepted')
    print(f'PASS: all nine websocket command schemas validated with {validator.__name__}, including malformed requests')
