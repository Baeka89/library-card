"""Exercise backend handlers using a minimal HA adapter, without an HA installation."""
import asyncio
import copy
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import patch


def module(name, **attrs):
    obj = types.ModuleType(name)
    obj.__dict__.update(attrs)
    return obj


def identity(*args, **kwargs):
    return lambda function: function


def require_admin(function):
    async def wrapped(hass, connection, msg):
        if not connection.admin:
            connection.send_error(msg['id'], 'unauthorized', 'Admin required')
            return
        return await function(hass, connection, msg)
    return wrapped


class StorageWriteError(Exception):
    """Match HA Store's caught-and-logged write failure contract."""


class HomeAssistantStoreStub:
    def __init__(self, *args, **kwargs):
        self.hass = args[0] if args else None
        self.saved = None
        self.deferred = None
        self.fail = False

    async def async_save(self, state):
        if getattr(self.hass, 'is_stopping', False):
            self.deferred = copy.deepcopy(state)
            return
        try:
            await self._async_write_data(state)
        except StorageWriteError:
            # The original HA Store logs these failures and returns normally.
            return

    async def _async_write_data(self, state):
        if getattr(self, 'before_write', None):
            self.before_write.set()
            await self.release_write.wait()
        if self.fail:
            raise StorageWriteError('Disk full')
        self.saved = copy.deepcopy(state)


ws = module('homeassistant.components.websocket_api', websocket_command=identity,
            async_response=lambda fn: fn, require_admin=require_admin, decorators=types.SimpleNamespace())
stubs = {'voluptuous': module('voluptuous', Required=lambda key: key, All=lambda *args: int, Range=lambda **kwargs: int),
         'homeassistant': module('homeassistant'), 'homeassistant.components': module('homeassistant.components', websocket_api=ws),
         'homeassistant.components.websocket_api': ws,
         'homeassistant.components.http': module('homeassistant.components.http', StaticPathConfig=object),
         'homeassistant.helpers': module('homeassistant.helpers'),
         'homeassistant.helpers.storage': module('homeassistant.helpers.storage', Store=HomeAssistantStoreStub),
         'homeassistant.core': module('homeassistant.core', callback=lambda fn: fn)}
root = pathlib.Path(__file__).parents[1] / 'custom_components/card_library'
spec = importlib.util.spec_from_file_location('backend_under_test', root / '__init__.py', submodule_search_locations=[str(root)])
backend = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {**stubs, 'backend_under_test': backend}):
    spec.loader.exec_module(backend)


class Connection:
    def __init__(self, admin=True):
        self.admin = admin
        self.results = []
        self.errors = []
        self.events = []
        self.subscriptions = {}

    def send_result(self, identifier, result=None):
        self.results.append((identifier, result))

    def send_event(self, identifier, event):
        self.events.append((identifier, event))

    def send_error(self, identifier, code, message):
        self.errors.append((identifier, code, message))


class Store:
    def __init__(self):
        self.saved = None
        self.fail = False

    async def async_load(self):
        return copy.deepcopy(self.saved)

    async def async_save(self, state):
        await asyncio.sleep(0)
        if self.fail:
            raise OSError('Disk full')
        self.saved = copy.deepcopy(state)


class BackendFixture(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.store = Store()
        self.state = {'revision': 0, 'templates': {}, 'groups': {}, 'people': {}}
        self.hass = types.SimpleNamespace(data={'card_library': {'state': self.state, 'store': self.store, 'lock': asyncio.Lock()}},
                                         bus=types.SimpleNamespace(async_fire=lambda name, data: self.events.append((name, data))))

    def msg(self, revision=0, value='red'):
        return {'id': 1, 'revision': revision, 'library': {'templates': {}, 'groups': {'g': {'name': 'Colors', 'value': value}}, 'people': {}}}

class BackendTest(BackendFixture):
    async def test_concurrent_saves_reject_stale_revision(self):
        first, second = Connection(), Connection()
        await asyncio.gather(backend.save_library(self.hass, first, self.msg()), backend.save_library(self.hass, second, self.msg()))
        self.assertEqual(len(first.results) + len(second.results), 1)
        self.assertEqual(len(first.errors) + len(second.errors), 1)
        self.assertEqual(self.store.saved['revision'], 1)
        self.assertEqual(len(self.events), 1)
        self.assertNotIn('history', self.events[0][1])

    async def test_restore_and_stale_restore(self):
        connection = Connection()
        await backend.save_library(self.hass, connection, self.msg())
        await backend.save_library(self.hass, connection, self.msg(1, 'blue'))
        await backend.restore_library(self.hass, connection, {'id': 3, 'revision': 2, 'target_revision': 1})
        self.assertEqual(connection.results[-1][1]['groups']['g']['value'], 'red')
        self.assertEqual(connection.results[-1][1]['revision'], 3)
        await backend.restore_library(self.hass, connection, {'id': 4, 'revision': 2, 'target_revision': 1})
        self.assertEqual(connection.errors[-1][1], 'conflict')

    async def test_invalid_save_does_not_mutate_store(self):
        connection = Connection()
        message = self.msg()
        message['library']['groups'] = []
        await backend.save_library(self.hass, connection, message)
        self.assertEqual(connection.errors[0][1], 'invalid_library')
        self.assertIsNone(self.store.saved)
        self.assertEqual(self.hass.data['card_library']['state']['revision'], 0)

    async def test_storage_failure_keeps_old_state(self):
        self.store.fail = True
        connection = Connection()
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.errors[0][1], 'storage_error')
        self.assertEqual(self.hass.data['card_library']['state']['revision'], 0)
        self.assertFalse(self.events)

    async def test_ha_swallowed_write_failure_is_reported_without_activating_revision(self):
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.store.fail = True
        self.hass.data[backend.DOMAIN]['store'] = self.store
        connection = Connection()
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.errors[0][1], 'storage_error')
        self.assertFalse(connection.results)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 0)
        self.assertIsNone(self.store.saved)
        self.assertFalse(self.events)
        self.store.fail = False
        await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.results[-1][1]['revision'], 1)
        self.assertEqual(self.store.saved['revision'], 1)
        self.assertEqual(len(self.events), 1)

    async def test_ha_swallowed_restore_write_failure_preserves_current_library(self):
        connection = Connection()
        await backend.save_library(self.hass, connection, self.msg())
        await backend.save_library(self.hass, connection, self.msg(1, 'blue'))
        current = copy.deepcopy(self.hass.data[backend.DOMAIN]['state'])
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.store.fail = True
        self.hass.data[backend.DOMAIN]['store'] = self.store
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.restore_library(self.hass, connection, {'id': 3, 'revision': 2, 'target_revision': 1})
        self.assertEqual(connection.errors[-1][1], 'storage_error')
        self.assertEqual(self.hass.data[backend.DOMAIN]['state'], current)
        self.assertEqual(len(self.events), 2)

    async def test_read_only_ha_store_does_not_acknowledge_unsaved_revision(self):
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.store._read_only = True
        self.hass.data[backend.DOMAIN]['store'] = self.store
        connection = Connection()
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.errors[0][1], 'storage_error')
        self.assertFalse(connection.results)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 0)
        self.assertIsNone(self.store.saved)
        self.assertFalse(self.events)

    async def test_shutdown_rejects_save_before_buffering_and_allows_a_later_retry(self):
        self.hass.is_stopping = True
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.hass.data[backend.DOMAIN]['store'] = self.store
        connection = Connection()
        with self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.errors[0][1], 'storage_error')
        self.assertFalse(connection.results)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 0)
        self.assertIsNone(self.store.saved)
        self.assertIsNone(self.store.deferred, 'A rejected revision must not be flushed at final_write')
        self.assertFalse(self.events)
        self.hass.is_stopping = False
        await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.results[-1][1]['revision'], 1)
        self.assertEqual(self.store.saved['revision'], 1)
        self.assertEqual(len(self.events), 1)

    async def test_shutdown_during_running_write_acknowledges_only_after_durable_completion(self):
        self.hass.is_stopping = False
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.store.before_write = asyncio.Event()
        self.store.release_write = asyncio.Event()
        self.hass.data[backend.DOMAIN]['store'] = self.store
        connection = Connection()
        pending = asyncio.create_task(backend.save_library(self.hass, connection, self.msg()))
        await self.store.before_write.wait()
        self.assertFalse(connection.results)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 0)
        self.hass.is_stopping = True
        self.store.release_write.set()
        await pending
        self.assertFalse(connection.errors)
        self.assertEqual(connection.results[-1][1]['revision'], 1)
        self.assertEqual(self.store.saved['revision'], 1)
        self.assertIsNone(self.store.deferred)
        self.assertEqual(len(self.events), 1)

    async def test_parent_store_return_without_completed_write_cannot_activate_revision(self):
        self.store = backend.CardLibraryStore(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.hass.data[backend.DOMAIN]['store'] = self.store
        async def return_without_writing(store, state):
            return None
        connection = Connection()
        with patch.object(HomeAssistantStoreStub, 'async_save', new=return_without_writing), self.assertLogs(backend._LOGGER, level='ERROR'):
            await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual(connection.errors[0][1], 'storage_error')
        self.assertFalse(connection.results)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 0)
        self.assertIsNone(self.store.saved)
        self.assertFalse(self.events)


class BackendLifecycleTest(BackendFixture):
    async def test_unload_blocks_reads_and_writes_without_deleting_data(self):
        await backend.async_unload_entry(self.hass, None)
        connection = Connection()
        await backend.get_library(self.hass, connection, {'id': 1})
        await backend.save_library(self.hass, connection, self.msg())
        self.assertEqual([error[1] for error in connection.errors], ['not_available', 'not_available'])
        self.assertEqual(self.events[-1][1], {'available': False})
        self.assertEqual(self.hass.data['card_library']['state']['revision'], 0)

    async def test_reenable_restores_active_state_without_duplicate_resources(self):
        await backend.async_unload_entry(self.hass, None)
        self.assertTrue(await backend.async_setup_entry(self.hass, None))
        connection = Connection()
        await backend.get_library(self.hass, connection, {'id': 1})
        self.assertEqual(connection.results[0][1]['revision'], 0)

    async def test_invalid_restoration_is_rejected_without_mutating_state(self):
        self.hass.data['card_library']['state']['history'] = [{'revision': 0, 'library': {'groups': []}}]
        connection = Connection()
        await backend.restore_library(self.hass, connection, {'id': 1, 'revision': 0, 'target_revision': 0})
        self.assertEqual(connection.errors[0][1], 'invalid_library')
        self.assertEqual(self.hass.data['card_library']['state']['revision'], 0)

    async def test_nonadmin_cannot_save_restore_or_read_history(self):
        connection = Connection(admin=False)
        await backend.save_library(self.hass, connection, self.msg())
        await backend.restore_library(self.hass, connection, {'id': 2, 'revision': 0, 'target_revision': 0})
        await backend.get_history(self.hass, connection, {'id': 3})
        self.assertEqual(len(connection.errors), 3)
        self.assertIsNone(self.store.saved)


class BackendPopupLinksTest(BackendFixture):
    def library(self):
        return {'templates': {'t': {'name': 'Kalender', 'config': {'type': 'markdown', 'entity': 'sensor.central'},
                'popup': {'hash': '#central'}, 'popup_links': [
                    {'hash': '#wohnzimmer', 'overrides': [{'path': ['entity'], 'value': 'sensor.wohnzimmer'}], 'options': {'name': 'Wohnzimmer'}},
                    {'hash': '#flur', 'overrides': [{'path': ['entity'], 'value': 'sensor.flur'}]},
                ]}}, 'groups': {}, 'people': {}}

    async def test_aliases_persist_broadcast_and_restore_without_local_card_copies(self):
        connection = Connection()
        library = self.library()
        await backend.save_library(self.hass, connection, {'id': 1, 'revision': 0, 'library': library})
        self.assertFalse(connection.errors)
        self.assertEqual(self.store.saved['templates'], library['templates'])
        self.assertEqual(connection.results[-1][1]['templates'], library['templates'])
        self.assertEqual(self.events[-1][1]['templates'], library['templates'])
        await backend.save_library(self.hass, connection, {'id': 2, 'revision': 1, 'library': {'templates': {}, 'groups': {}, 'people': {}}})
        self.assertEqual(self.store.saved['history'][-1]['library']['templates'], library['templates'])
        await backend.restore_library(self.hass, connection, {'id': 3, 'revision': 2, 'target_revision': 1})
        self.assertFalse(connection.errors)
        self.assertEqual(self.store.saved['templates'], library['templates'])
        self.assertEqual(self.store.saved['revision'], 3)
        self.assertEqual(self.events[-1][1]['templates'], library['templates'])

    async def test_invalid_duplicate_alias_does_not_publish_or_replace_existing_library(self):
        connection = Connection()
        library = self.library()
        await backend.save_library(self.hass, connection, {'id': 1, 'revision': 0, 'library': library})
        current = copy.deepcopy(self.hass.data[backend.DOMAIN]['state'])
        library['templates']['t']['popup_links'][0]['hash'] = '#central'
        await backend.save_library(self.hass, connection, {'id': 2, 'revision': 1, 'library': library})
        self.assertEqual(connection.errors[-1][1], 'invalid_library')
        self.assertEqual(self.hass.data[backend.DOMAIN]['state'], current)
        self.assertEqual(self.store.saved, current)
        self.assertEqual(len(self.events), 1)
        self.assertEqual(len(connection.results), 1)

    async def test_loading_saved_aliases_preserves_options_and_override_metadata(self):
        self.hass.data.clear()
        library = self.library()
        self.store.saved = {**copy.deepcopy(library), 'revision': 7}
        registrations = []
        async def register(paths):
            registrations.extend(paths)
        self.hass.http = types.SimpleNamespace(async_register_static_paths=register)
        with patch.object(backend, 'CardLibraryStore', return_value=self.store), patch.object(backend, 'StaticPathConfig', side_effect=lambda *args: args), patch.object(backend.websocket_api, 'async_register_command', create=True):
            self.assertTrue(await backend.async_setup_entry(self.hass, None))
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['templates'], library['templates'])
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 7)
        self.assertEqual(self.store.saved, {**library, 'revision': 7}, 'Setup must not rewrite existing storage')


class BackendSetupAndSubscriptionTest(BackendFixture):
    async def test_invalid_stored_state_does_not_register_resources_or_overwrite_data(self):
        self.hass.data.clear()
        self.store.saved = {'revision': 0, 'templates': {}, 'groups': {'g': {'name': 'Invalid'}}}
        with patch.object(backend, 'CardLibraryStore', return_value=self.store):
            with self.assertLogs(backend._LOGGER, level='ERROR'):
                self.assertFalse(await backend.async_setup_entry(self.hass, None))
        self.assertNotIn('card_library', self.hass.data)
        self.assertEqual(self.store.saved['groups']['g']['name'], 'Invalid')

    async def test_resource_registration_failure_does_not_publish_half_initialized_state(self):
        self.hass.data.clear()
        async def register(paths): raise OSError('HTTP not ready')
        self.hass.http = types.SimpleNamespace(async_register_static_paths=register)
        with patch.object(backend, 'CardLibraryStore', return_value=self.store), patch.object(backend, 'StaticPathConfig', side_effect=lambda *args: args):
            with self.assertRaises(OSError): await backend.async_setup_entry(self.hass, None)
        self.assertNotIn('card_library', self.hass.data)

    async def test_legacy_saved_library_is_normalized_at_setup(self):
        self.hass.data.clear()
        self.store.saved = {'revision': 4, 'templates': {}, 'groups': {}}
        registrations = []
        async def register(paths): registrations.extend(paths)
        self.hass.http = types.SimpleNamespace(async_register_static_paths=register)
        with patch.object(backend, 'CardLibraryStore', return_value=self.store) as store_factory, patch.object(backend, 'StaticPathConfig', side_effect=lambda *args: args), patch.object(backend.websocket_api, 'async_register_command', create=True) as commands:
            self.assertTrue(await backend.async_setup_entry(self.hass, None))
        store_factory.assert_called_once_with(self.hass, 1, backend.DOMAIN, atomic_writes=True)
        self.assertEqual(commands.call_count, 6)
        self.assertEqual(len(registrations), 1)
        self.assertEqual(self.hass.data['card_library']['state']['people'], {})

    async def test_subscription_sends_initial_state_and_uses_unsubscribe_cleanup(self):
        listeners = {}
        def listen(name, function):
            listeners[name] = function
            def unsubscribe(): listeners.pop(name, None)
            return unsubscribe
        self.hass.bus.async_listen = listen
        connection = Connection()
        await backend.subscribe_library(self.hass, connection, {'id': 5})
        self.assertEqual(connection.events[0][1]['revision'], 0)
        listeners[backend.EVENT](types.SimpleNamespace(data={'available': False}))
        self.assertEqual(connection.events[-1][1], {'available': False})
        connection.subscriptions[5]()
        self.assertFalse(listeners)


class StoredHistoryIntegrityTest(BackendFixture):
    async def test_invalid_history_order_or_revision_does_not_overwrite_storage(self):
        for revisions in ([-1], [4], [2, 2], [3, 1]):
            with self.subTest(revisions=revisions):
                self.hass.data.clear()
                self.store.saved={'revision':4,'templates':{},'groups':{},'people':{},'history':[
                    {'revision':revision,'saved_at':'2026-10-07T00:00:00Z','library':{'templates':{},'groups':{},'people':{}}} for revision in revisions]}
                before=copy.deepcopy(self.store.saved)
                with patch.object(backend,'CardLibraryStore',return_value=self.store),self.assertLogs(backend._LOGGER,level='ERROR'):
                    self.assertFalse(await backend.async_setup_entry(self.hass,None))
                self.assertNotIn('card_library',self.hass.data)
                self.assertEqual(self.store.saved,before)

    async def test_invalid_history_timestamp_does_not_overwrite_storage(self):
        for timestamp in ('', 'not a date', '\ud800', '2026-99-99T00:00:00Z'):
            with self.subTest(timestamp=timestamp):
                self.hass.data.clear()
                self.store.saved = {'revision': 1, 'templates': {}, 'groups': {}, 'history': [
                    {'revision': 0, 'saved_at': timestamp, 'library': {'templates': {}, 'groups': {}}}]}
                before = copy.deepcopy(self.store.saved)
                with patch.object(backend, 'CardLibraryStore', return_value=self.store), self.assertLogs(backend._LOGGER, level='ERROR'):
                    self.assertFalse(await backend.async_setup_entry(self.hass, None))
                self.assertNotIn(backend.DOMAIN, self.hass.data)
                self.assertEqual(self.store.saved, before)

    async def test_history_extra_fields_are_removed_and_timestamps_normalized_in_memory(self):
        self.hass.data.clear()
        self.store.saved = {'revision': 1, 'templates': {}, 'groups': {}, 'history': [
            {'revision': 0, 'saved_at': '2026-10-07T00:00:00Z', 'library': {'templates': {}, 'groups': {}}, 'extra': float('nan')}]}
        async def register(paths):
            return None
        self.hass.http = types.SimpleNamespace(async_register_static_paths=register)
        with patch.object(backend, 'CardLibraryStore', return_value=self.store), patch.object(backend, 'StaticPathConfig', side_effect=lambda *args: args), patch.object(backend.websocket_api, 'async_register_command', create=True):
            self.assertTrue(await backend.async_setup_entry(self.hass, None))
        history = self.hass.data[backend.DOMAIN]['state']['history']
        self.assertEqual(set(history[0]), {'revision', 'saved_at', 'library'})
        self.assertEqual(history[0]['saved_at'], '2026-10-07T00:00:00+00:00')
        self.assertIn('extra', self.store.saved['history'][0], 'Loading must not overwrite the original storage')


class CardYamlTest(BackendFixture):
    def test_yaml_preserves_card_entities_and_settings(self):
        config=backend.parse_card_yaml('type: custom:energy-flow-card-plus\ntitle: Mein Energiefluss\nentities:\n  solar:\n    entity: sensor.solar\n    color: "#abcdef"\n')
        self.assertEqual(config['title'],'Mein Energiefluss')
        self.assertEqual(config['entities']['solar']['entity'],'sensor.solar')
        self.assertEqual(config['entities']['solar']['color'],'#abcdef')

    def test_invalid_or_noncard_yaml_is_rejected(self):
        import yaml
        for source in ('', '[]', 'title: Missing type', 'type: [broken', 'type: custom:library-card', 'type: !include secrets.yaml', 'type: markdown\na: &a [*a]'):
            with self.subTest(source=source), self.assertRaises((ValueError,TypeError,RecursionError,yaml.YAMLError)):
                backend.parse_card_yaml(source)

    def test_regular_yaml_aliases_preserve_card_configuration(self):
        config = backend.parse_card_yaml('type: horizontal-stack\ncards:\n  - &card {type: markdown, content: Shared}\n  - *card\n')
        self.assertEqual(config['cards'], [{'type': 'markdown', 'content': 'Shared'}] * 2)

    def test_yaml_alias_expansion_is_rejected_at_the_library_size_limit(self):
        source = 'type: markdown\nalias_0: &alias_0 [leaf, leaf]\n'
        for depth in range(1, 30):
            source += f'alias_{depth}: &alias_{depth} [*alias_{depth - 1}, *alias_{depth - 1}]\n'
        with self.assertRaisesRegex(ValueError, 'exceeds 2 MB'):
            backend.parse_card_yaml(source)

    async def test_yaml_endpoint_does_not_write_and_allows_authenticated_local_editors(self):
        async def executor(function,*args):return function(*args)
        self.hass.async_add_executor_job=executor
        connection=Connection()
        await backend.parse_card(self.hass,connection,{'id':6,'yaml':'type: markdown\ncontent: Hallo'})
        self.assertEqual(connection.results[-1][1]['content'],'Hallo')
        self.assertIsNone(self.store.saved)
        connection=Connection(admin=False)
        await backend.parse_card(self.hass,connection,{'id':6,'yaml':'type: markdown'})
        self.assertEqual(connection.results[-1][1]['type'],'markdown')
        self.assertIsNone(self.store.saved)

class StackYamlTest(unittest.TestCase):
    def test_whole_horizontal_stack_retains_nested_ha_and_custom_cards(self):
        config=backend.parse_card_yaml('type: horizontal-stack\ncards:\n  - type: entities\n    entities: [calendar.person_a]\n  - type: custom:family-calendar-card\n    title: Familie\n    entities: [calendar.person_b]\n    colors:\n      calendar.person_b: "#abcdef"\n')
        self.assertEqual(config['type'],'horizontal-stack')
        self.assertEqual(len(config['cards']),2)
        self.assertEqual(config['cards'][0]['entities'],['calendar.person_a'])
        self.assertEqual(config['cards'][1]['colors']['calendar.person_b'],'#abcdef')

class FooterYamlTest(unittest.TestCase):
    def test_user_footer_yaml_preserves_width_stack_actions_and_templates(self):
        import yaml
        source=(pathlib.Path(__file__).parents[1]/'examples/footer/mushroom-footer.yaml').read_text()
        original=yaml.safe_load(source)
        config=backend.parse_card_yaml(source)
        self.assertEqual(config, {'type':'custom:library-container-card', **original})
        self.assertEqual(config['max_width'],1030)
        self.assertEqual(len(config['card']['cards'][0]['chips']),5)
        self.assertIn('mdi:numeric-{{ count }}',config['card']['cards'][0]['chips'][4]['icon'])

    def test_footer_invalid_card_width_and_unknown_envelope_are_rejected(self):
        for source in ('card: {}','card: []','card: {type: markdown}\nmax_width: -1','card: {type: markdown}\nmax_width: true','card: {type: markdown}\nmax_width: wide','card: {type: markdown}\nunsupported: true'):
            with self.subTest(source=source),self.assertRaises(ValueError):
                backend.parse_card_yaml(source)
