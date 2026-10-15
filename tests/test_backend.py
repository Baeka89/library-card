"""Exercise backend handlers using a minimal HA adapter, without an HA installation."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import copy
import importlib.util
import pathlib
import sys
import threading
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


async def run_test_executor(function, *args):
    """Run HA worker jobs on real threads without socket-dependent loop wakeups.

    This fixture polls completion because managed test sandboxes may deny the
    event loop's cross-thread Unix-socket send. Production uses HA's executor.
    """
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(function, *args)
        while not future.done():
            await asyncio.sleep(0.001)
        return future.result()


class BackendFixture(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.store = Store()
        self.state = {'revision': 0, 'templates': {}, 'groups': {}, 'people': {}}
        self.hass = types.SimpleNamespace(data={'card_library': {'state': self.state, 'store': self.store, 'lock': asyncio.Lock()}},
                                         bus=types.SimpleNamespace(async_fire=lambda name, data: self.events.append((name, data))),
                                         async_add_executor_job=run_test_executor)

    def msg(self, revision=0, value='red'):
        return {'id': 1, 'revision': revision, 'library': {'templates': {}, 'groups': {'g': {'name': 'Colors', 'value': value}}, 'people': {}}}

class BackendTest(BackendFixture):
    async def test_validation_and_history_restore_run_outside_the_ha_event_loop(self):
        event_loop_thread = threading.get_ident()
        original = backend.commit
        workers = []
        def worker_commit(*args):
            workers.append(threading.get_ident())
            self.assertNotEqual(workers[-1], event_loop_thread)
            return original(*args)
        connection = Connection()
        with patch.object(backend, 'commit', side_effect=worker_commit):
            await backend.save_library(self.hass, connection, self.msg())
            await backend.restore_library(self.hass, connection, {'id': 2, 'revision': 1, 'target_revision': 0})
        self.assertFalse(connection.errors)
        self.assertEqual(len(workers), 2)
        self.assertEqual(self.hass.data[backend.DOMAIN]['state']['revision'], 2)

    async def test_reads_see_a_complete_old_revision_while_worker_prepares_a_save(self):
        entered, release = threading.Event(), threading.Event()
        original = backend.commit
        def paused_commit(*args):
            candidate = original(*args)
            entered.set()
            if not release.wait(2):
                raise AssertionError('Validation worker was not released')
            return candidate
        writer, reader = Connection(), Connection()
        with patch.object(backend, 'commit', side_effect=paused_commit):
            pending = asyncio.create_task(backend.save_library(self.hass, writer, self.msg()))
            try:
                self.assertTrue(await run_test_executor(entered.wait, 2))
                await backend.get_library(self.hass, reader, {'id': 2})
                self.assertEqual(reader.results[-1][1], {'revision': 0, 'templates': {}, 'groups': {}, 'people': {}})
                self.assertEqual(self.state, {'revision': 0, 'templates': {}, 'groups': {}, 'people': {}})
                self.assertFalse(writer.results)
                self.assertIsNone(self.store.saved)
            finally:
                release.set()
                await pending
        self.assertFalse(writer.errors)
        self.assertEqual(writer.results[-1][1]['revision'], 1)

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
        self.assertEqual(commands.call_count, 9)
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

class ButtonTemplateImportTest(BackendFixture):
    def test_convert_named_template_preserves_javascript_and_empty_entity_variables(self):
        source = '''button_card_templates:
  rolladen_karte:
    variables: {entity_cover: '', entity_modus: '', friendly_name: Fenster}
    entity: '[[[ return variables.entity_cover; ]]]'
    styles: {card: [{border: '[[[ return variables.entity_modus; ]]]'}]}
    custom_fields:
      buttons:
        card:
          type: horizontal-stack
          cards:
            - type: custom:button-card
              tap_action:
                action: call-service
                service: cover.open_cover
                target: {entity_id: '[[[ return variables.entity_cover; ]]]'}
'''
        entry = backend.parse_templates_yaml(source)[0]
        self.assertEqual(entry['name'], 'rolladen_karte')
        self.assertEqual(entry['config']['type'], 'custom:button-card')
        self.assertEqual(entry['config']['variables']['entity_cover'], '')
        self.assertEqual(entry['config']['entity'], '[[[ return variables.entity_cover; ]]]')
        self.assertEqual(entry['config']['custom_fields']['buttons']['card']['cards'][0]['tap_action']['target']['entity_id'], '[[[ return variables.entity_cover; ]]]')
        self.assertEqual(backend.parse_card_yaml(source), entry['config'])

    def test_batch_static_inheritance_merges_styles_variables_and_states_by_id(self):
        entries = backend.parse_templates_yaml('''button_card_templates:
  base:
    variables: {entity_cover: '', friendly_name: Fenster}
    styles: {card: [{padding: 12px}]}
    state: [{id: active, value: 'on', color: red}]
  child:
    template: base
    variables: {friendly_name: Küche}
    styles: {card: [{border: none}]}
    state: [{id: active, color: blue}, {value: 'off'}]
''')
        child = entries[1]['config']
        self.assertNotIn('template', child)
        self.assertEqual(child['variables'], {'entity_cover': '', 'friendly_name': 'Küche'})
        self.assertEqual(child['styles']['card'], [{'padding': '12px'}, {'border': 'none'}])
        self.assertEqual(child['state'], [{'id': 'active', 'value': 'on', 'color': 'blue'}, {'value': 'off'}])

    def test_missing_cyclic_and_dynamic_parents_rejected(self):
        for source in ["button_card_templates: {a: {template: missing}}", "button_card_templates: {a: {template: b}, b: {template: a}}", "button_card_templates: {a: {template: '[[[ return variables.x; ]]]'}}", "button_card_templates: {}", "button_card_templates: {a: {type: markdown}}", "button_card_templates: {a: {}}\nviews: []"]:
            with self.subTest(source=source), self.assertRaises((ValueError, TypeError)):
                backend.parse_templates_yaml(source)

    def test_nested_template_dependencies_are_inlined(self):
        entries = backend.parse_templates_yaml('''button_card_templates:
  inner: {show_state: false, icon: 'mdi:stop'}
  outer:
    custom_fields:
      stop:
        card: {type: 'custom:button-card', template: inner}
''')
        child = entries[1]['config']['custom_fields']['stop']['card']
        self.assertNotIn('template', child)
        self.assertEqual(child['icon'], 'mdi:stop')

    def test_regular_cards_still_use_the_existing_parser(self):
        self.assertEqual(backend.parse_templates_yaml('type: markdown\ncontent: hello')[0]['config'], {'type': 'markdown', 'content': 'hello'})
        with self.assertRaises(ValueError):
            backend.parse_card_yaml('button_card_templates: {a: {}, b: {}}')

    async def test_batch_parser_is_read_only_and_accepts_non_admins(self):
        async def executor(function, *args): return function(*args)
        self.hass.async_add_executor_job = executor
        connection = Connection(admin=False)
        await backend.parse_templates(self.hass, connection, {'id':7,'yaml':"button_card_templates: {a: {variables: {entity_cover: ''}}}"})
        self.assertFalse(connection.errors)
        self.assertEqual(connection.results[0][1][0]['config']['type'], 'custom:button-card')
        self.assertIsNone(self.store.saved)


class ButtonTemplateBoundsTest(unittest.TestCase):
    def test_alias_expansion_is_bounded_before_copying(self):
        source = "button_card_templates:\n  a:\n    variables:\n      value: &a0 ['" + 'x' * 1024 + "']\n"
        for depth in range(1, 14):
            source += f"      a{depth}: &a{depth} [*a{depth-1}, *a{depth-1}]\n"
        with self.assertRaisesRegex(ValueError, 'exceeds 2 MB'):
            backend.parse_templates_yaml(source)

    def test_parent_extra_styles_are_retained_in_order(self):
        entries = backend.parse_templates_yaml("button_card_templates:\n  base: {extra_styles: 'a {}'}\n  other: {extra_styles: 'b {}'}\n  child: {template: [base, other], extra_styles: 'c {}'}")
        self.assertEqual(entries[-1]['config']['extra_styles'], 'a {}\nb {}\nc {}')

class DashboardEditingTest(BackendFixture):
    def setUp(self):
        super().setUp()
        self.state['templates']={'t':{'name':'Template','config':{'type':'entities','entities':['sensor.original']},'inputs':[]}}
        self.dashboard=types.SimpleNamespace(mode='storage',config={'views':[{'cards':[{'type':'custom:library-card','template':'t'}]}]})
        self.saved=[]
        async def load(force):return self.dashboard.config
        async def save(config):self.dashboard.config=config;self.saved.append(copy.deepcopy(config))
        self.dashboard.async_load=load;self.dashboard.async_save=save
        self.hass.data['lovelace']=types.SimpleNamespace(dashboards={None:self.dashboard,'other':self.dashboard})
    def write(self,operation='replace',**changes):
        message={'id':1,'dashboard':'','fingerprint':backend.fingerprint(self.dashboard.config),'path':['views',0,'cards',0],'value':{'type':'custom:library-card','template':'t','overrides':[{'path':['entities'], 'value':['sensor.local']}]},'operation':operation,'library_revision':0,'source':{}}
        return message|changes
    async def test_local_edit_preserves_placement_and_other_cards(self):
        self.dashboard.config['views'][0]['cards'][0]['grid_options']={'columns':6}
        self.dashboard.config['views'][0]['cards'].append({'type':'markdown','content':'unchanged'})
        message=self.write();message['value']['grid_options']={'columns':6};connection=Connection()
        await backend.dashboard_write(self.hass,connection,message)
        self.assertFalse(connection.errors);self.assertEqual(self.saved[0]['views'][0]['cards'][0]['grid_options'],{'columns':6});self.assertEqual(self.saved[0]['views'][0]['cards'][1],{'type':'markdown','content':'unchanged'})
        self.assertEqual(self.state['templates']['t']['config']['entities'],['sensor.original'])
    async def test_stale_dashboard_or_library_rejects_without_writing(self):
        for field,value in [('fingerprint','a'*64),('library_revision',3)]:
            connection=Connection();await backend.dashboard_write(self.hass,connection,self.write(**{field:value}));self.assertTrue(connection.errors);self.assertFalse(self.saved)
    async def test_yaml_and_non_admin_cannot_write(self):
        self.dashboard.mode='yaml';connection=Connection();await backend.dashboard_write(self.hass,connection,self.write());self.assertTrue(connection.errors)
        self.dashboard.mode='storage';connection=Connection(admin=False);await backend.dashboard_write(self.hass,connection,self.write());self.assertTrue(connection.errors);self.assertFalse(self.saved)
    async def test_duplicate_appends_link_without_replacing_source(self):
        origin=copy.deepcopy(self.dashboard.config);connection=Connection()
        message=self.write('append',path=['views',0,'cards'],source={'dashboard':'','fingerprint':backend.fingerprint(origin)})
        await backend.dashboard_write(self.hass,connection,message);self.assertFalse(connection.errors);self.assertEqual(self.dashboard.config['views'][0]['cards'][0],origin['views'][0]['cards'][0]);self.assertEqual(len(self.dashboard.config['views'][0]['cards']),2)
    async def test_changed_duplicate_source_is_rejected(self):
        connection=Connection();await backend.dashboard_write(self.hass,connection,self.write('append',path=['views',0,'cards'],source={'dashboard':'other','fingerprint':'a'*64}));self.assertTrue(connection.errors);self.assertFalse(self.saved)
    async def test_required_inputs_and_invalid_paths_are_rejected(self):
        self.state['templates']['t']['inputs']=[{'path':['entity'],'label':'Entity','type':'entity','required':True}]
        for changes in [{},{'path':['views',-1,'cards',0]},{'path':['views',0,'cards',0,'__proto__']}]:
            connection=Connection();await backend.dashboard_write(self.hass,connection,self.write(**changes));self.assertTrue(connection.errors);self.assertFalse(self.saved)
    async def test_dashboard_snapshot_exposes_mode_and_rejects_non_admins(self):
        connection=Connection();await backend.dashboard_get(self.hass,connection,{'id':1,'dashboard':''});self.assertEqual(connection.results[-1][1]['mode'],'storage');self.assertEqual(len(connection.results[-1][1]['fingerprint']),64)
        denied=Connection(admin=False);await backend.dashboard_get(self.hass,denied,{'id':1,'dashboard':''});self.assertTrue(denied.errors)
    async def test_type_or_template_switch_cannot_replace_reference(self):
        self.state['templates']['other']={'name':'Other','config':{'type':'markdown'}}
        for value in [{'type':'custom:library-card','template':'other'},{'type':'button','tap_action':{'action':'fire-dom-event','card_library':{'action':'popup','template':'t'}}}]:
            connection=Connection();await backend.dashboard_write(self.hass,connection,self.write(value=value));self.assertTrue(connection.errors);self.assertFalse(self.saved)

    async def test_destination_changed_while_reading_duplicate_source_is_rejected(self):
        origin_config=copy.deepcopy(self.dashboard.config)
        async def origin_load(force):
            self.dashboard.config={'views':[{'cards':[{'type':'markdown','content':'concurrent change'}]}]}
            return origin_config
        origin=types.SimpleNamespace(mode='storage',async_load=origin_load)
        self.hass.data['lovelace'].dashboards['source']=origin
        message=self.write('append',path=['views',0,'cards'],source={'dashboard':'source','fingerprint':backend.fingerprint(origin_config)})
        connection=Connection();await backend.dashboard_write(self.hass,connection,message)
        self.assertTrue(connection.errors);self.assertFalse(self.saved);self.assertEqual(self.dashboard.config['views'][0]['cards'][0]['content'],'concurrent change')

    async def test_duplicate_can_target_empty_views_and_refuses_full_panel_views(self):
        from_config={'views':[{'title':'Empty'}]}
        self.dashboard.config=from_config
        connection=Connection();await backend.dashboard_write(self.hass,connection,self.write('append',path=['views',0,'cards'],source={'dashboard':'','fingerprint':backend.fingerprint(from_config)}))
        self.assertFalse(connection.errors);self.assertEqual(self.dashboard.config['views'][0]['cards'][0]['template'],'t')
        self.dashboard.config['views'][0]['type']='panel';before=copy.deepcopy(self.dashboard.config)
        blocked=Connection();await backend.dashboard_write(self.hass,blocked,self.write('append',path=['views',0,'cards'],source={'dashboard':'','fingerprint':backend.fingerprint(before)}));self.assertTrue(blocked.errors);self.assertEqual(self.dashboard.config,before)

    async def test_popup_hash_uses_the_shared_hash_instead_of_the_stale_config_value(self):
        self.state['templates']['t'] = {'name': 'Popup', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#old', 'cards': []},
                                        'bindings': [{'group': 'route', 'path': ['hash']}]}
        self.state['groups']['route'] = {'name': 'Route', 'value': '#current'}
        self.dashboard.config['views'][0]['cards'][0] = {'type': 'button', 'tap_action': {'action': 'navigate', 'navigation_path': '#current'}}
        connection = Connection()
        await backend.dashboard_write(self.hass, connection, self.write(path=['views', 0, 'cards', 0, 'tap_action'], value={'action': 'navigate', 'navigation_path': '#current'}))
        self.assertFalse(connection.errors)
        self.assertEqual(len(self.saved), 1)

    async def test_explicit_popup_route_replaces_the_native_hash(self):
        self.state['templates']['t'] = {'name': 'Popup', 'config': {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#native', 'cards': []},
                                        'popup': {'hash': '#explicit'}}
        button = {'type': 'button', 'tap_action': {'action': 'navigate', 'navigation_path': '#native'}}
        connection = Connection()
        await backend.dashboard_write(self.hass, connection, self.write('append', path=['views', 0, 'cards'], value=button,
            source={'dashboard': '', 'fingerprint': backend.fingerprint(self.dashboard.config)}))
        self.assertTrue(connection.errors)
        self.assertFalse(self.saved)

    async def test_popup_alias_inputs_are_validated_with_its_local_values(self):
        self.state['templates']['t'] = {'name': 'Popup', 'config': {'type': 'markdown'}, 'popup': {'hash': '#base'},
            'inputs': [{'path': ['entity'], 'label': 'Entity', 'type': 'entity', 'required': True}],
            'popup_links': [{'hash': '#filled', 'overrides': [{'path': ['entity'], 'value': 'sensor.local'}]}]}
        source = {'dashboard': '', 'fingerprint': backend.fingerprint(self.dashboard.config)}
        invalid = Connection()
        await backend.dashboard_write(self.hass, invalid, self.write('append', path=['views', 0, 'cards'],
            value={'type': 'button', 'tap_action': {'action': 'navigate', 'navigation_path': '#base'}}, source=source))
        self.assertTrue(invalid.errors)
        self.assertFalse(self.saved)
        valid = Connection()
        await backend.dashboard_write(self.hass, valid, self.write('append', path=['views', 0, 'cards'],
            value={'type': 'button', 'tap_action': {'action': 'navigate', 'navigation_path': '#filled'}}, source=source))
        self.assertFalse(valid.errors)
        self.assertEqual(len(self.saved), 1)

    async def test_fire_dom_event_popup_rejects_nested_bubble_popups(self):
        self.state['templates']['t']['config'] = {'type': 'horizontal-stack', 'cards': [
            {'type': 'custom:bubble-card', 'card_type': 'pop-up', 'hash': '#nested', 'cards': []}]}
        connection = Connection()
        await backend.dashboard_write(self.hass, connection, self.write('append', path=['views', 0, 'cards'],
            value={'type': 'button', 'tap_action': {'action': 'fire-dom-event', 'card_library': {'action': 'popup', 'template': 't'}}},
            source={'dashboard': '', 'fingerprint': backend.fingerprint(self.dashboard.config)}))
        self.assertTrue(connection.errors)
        self.assertFalse(self.saved)

    async def test_dashboard_snapshot_cannot_finish_after_the_integration_is_unloaded(self):
        async def unloaded_load(force):
            await backend.async_unload_entry(self.hass, None)
            return self.dashboard.config
        self.dashboard.async_load = unloaded_load
        connection = Connection()
        await backend.dashboard_get(self.hass, connection, {'id': 1, 'dashboard': ''})
        self.assertTrue(connection.errors)
        self.assertFalse(connection.results)
