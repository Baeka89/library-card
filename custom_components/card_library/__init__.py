"""Persistent, revisioned shared card library with websocket push updates."""
from pathlib import Path
from datetime import datetime
import asyncio
import logging
import re

from homeassistant.components import websocket_api
from homeassistant.components.websocket_api import decorators as ws_decorators

if hasattr(ws_decorators, "probatio"):
    import probatio as vol
else:
    import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.storage import Store as HAStore
from homeassistant.core import callback

from .model import commit, public_state, validate_library
from .button_templates import convert_button_templates
from .dashboard_edits import fingerprint, get_dashboard, patch_dashboard

DOMAIN = "card_library"
EVENT = "card_library_updated"
_LOGGER = logging.getLogger(__name__)


class CardLibraryStore(HAStore):
    """Expose write failures that HA's Store normally only logs."""

    async def async_save(self, data):
        self._library_write_error = None
        self._library_written_data = None
        if getattr(self, "_read_only", False):
            raise PermissionError("Card Library storage is read-only")
        if getattr(self.hass, "is_stopping", False):
            # HA Store would merely buffer this payload for final_write and
            # return. Reject before buffering an unacknowledged new revision.
            raise RuntimeError("Home Assistant is stopping; Card Library was not saved")
        await super().async_save(data)
        if self._library_write_error is not None:
            raise self._library_write_error
        if self._library_written_data is not data:
            raise RuntimeError("Card Library storage did not complete this write")

    async def _async_write_data(self, data):
        # Store catches WriteError/SerializationError around this hook and
        # returns normally; record the failure before it is swallowed so
        # failed writes never acknowledge a new library revision.
        try:
            await super()._async_write_data(data)
        except Exception as error:
            self._library_write_error = error
            raise
        # HA wraps the original payload in its storage metadata; retain its
        # identity so another completed write cannot acknowledge this save.
        self._library_written_data = data.get("data", data)


def normalize_state(saved):
    """Validate persisted cards/history in a worker without touching HA state."""
    if saved is None:
        return {"revision": 0, "templates": {}, "groups": {}, "people": {}, "history": []}
    if not isinstance(saved, dict) or isinstance(saved.get("revision"), bool) or not isinstance(saved.get("revision"), int) or saved["revision"] < 0:
        raise ValueError("Invalid stored revision")
    library = validate_library({key: saved[key] for key in ("templates", "groups")} | {"people": saved.get("people", {})})
    history = saved.get("history", [])
    if not isinstance(history, list):
        raise ValueError("Invalid stored history")
    normalized_history = []
    previous_revision = -1
    for snapshot in history[-10:]:
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("revision"), int) or isinstance(snapshot["revision"], bool) or not isinstance(snapshot.get("saved_at"), str):
            raise ValueError("Invalid stored history item")
        if not previous_revision < snapshot["revision"] < saved["revision"]:
            raise ValueError("Stored history revisions must be unique, increasing and older than current state")
        previous_revision = snapshot["revision"]
        saved_at = datetime.fromisoformat(snapshot["saved_at"]).isoformat()
        # Unchecked extra fields must not poison saves or websocket replies.
        normalized_history.append({"revision": snapshot["revision"], "saved_at": saved_at,
                                   "library": validate_library(snapshot["library"])})
    return {**library, "revision": saved["revision"], "history": normalized_history}


async def async_setup_entry(hass, entry):
    existing = hass.data.get(DOMAIN)
    if existing:
        existing["active"] = True
        hass.bus.async_fire(EVENT, public_state(existing["state"]))
        return True
    store = CardLibraryStore(hass, 1, DOMAIN, atomic_writes=True)
    saved = await store.async_load()
    try:
        state = await hass.async_add_executor_job(normalize_state, saved)
    except (ValueError, TypeError, KeyError, RecursionError) as error:
        _LOGGER.error("Card Library storage could not be validated: %s", error)
        return False
    # Only expose active state after resource registration has succeeded.
    await hass.http.async_register_static_paths([
        StaticPathConfig("/card_library", str(Path(__file__).parent / "frontend"), False)
    ])
    hass.data[DOMAIN] = {"store": store, "lock": asyncio.Lock(), "state": state, "active": True}
    for command in (get_library, save_library, subscribe_library, get_history, restore_library, parse_card, parse_templates, dashboard_get, dashboard_write):
        websocket_api.async_register_command(hass, command)
    return True


async def async_unload_entry(hass, entry):
    data = hass.data.get(DOMAIN)
    if data:
        async with data["lock"]:
            data["active"] = False
            hass.bus.async_fire(EVENT, {"available": False})
    return True


def active_data(hass, connection, msg):
    data = hass.data.get(DOMAIN)
    if not data or not data.get("active", True):
        connection.send_error(msg["id"], "not_available", "Card Library integration is not active.")
        return None
    return data


async def persist(hass, connection, msg, data, state):
    try:
        await data["store"].async_save(state)
    except Exception:
        _LOGGER.exception("Card Library could not be saved")
        connection.send_error(msg["id"], "storage_error", "Library could not be saved. Previous version is still active.")
        return
    data["state"] = state
    hass.bus.async_fire(EVENT, public_state(state))
    connection.send_result(msg["id"], public_state(state))


def validate_revision(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise vol.Invalid("Revision must be a non-negative integer")
    return value


@websocket_api.websocket_command({"type": "card_library/get"})
@websocket_api.async_response
async def get_library(hass, connection, msg):
    if data := active_data(hass, connection, msg):
        connection.send_result(msg["id"], public_state(data["state"]))


@websocket_api.websocket_command({
    "type": "card_library/save",
    vol.Required("revision"): validate_revision,
    vol.Required("library"): dict,
})
@websocket_api.require_admin
@websocket_api.async_response
async def save_library(hass, connection, msg):
    data = active_data(hass, connection, msg)
    if data is None:
        return
    async with data["lock"]:
        if not data.get("active", True):
            connection.send_error(msg["id"], "not_available", "Integration was unloaded.")
            return
        if msg["revision"] != data["state"]["revision"]:
            connection.send_error(msg["id"], "conflict", "Library changed. Reload before saving.")
            return
        try:
            state = await hass.async_add_executor_job(commit, data["state"], msg["library"])
        except (ValueError, TypeError, RecursionError) as error:
            connection.send_error(msg["id"], "invalid_library", str(error))
            return
        await persist(hass, connection, msg, data, state)


@websocket_api.websocket_command({"type": "card_library/subscribe"})
@websocket_api.async_response
async def subscribe_library(hass, connection, msg):
    data = active_data(hass, connection, msg)
    if data is None:
        return
    @callback
    def changed(event):
        connection.send_event(msg["id"], event.data)

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT, changed)
    connection.send_result(msg["id"])
    connection.send_event(msg["id"], public_state(data["state"]))


@websocket_api.websocket_command({"type": "card_library/history"})
@websocket_api.require_admin
@websocket_api.async_response
async def get_history(hass, connection, msg):
    if data := active_data(hass, connection, msg):
        connection.send_result(msg["id"], data["state"].get("history", []))


@websocket_api.websocket_command({
    "type": "card_library/restore",
    vol.Required("revision"): validate_revision,
    vol.Required("target_revision"): validate_revision,
})
@websocket_api.require_admin
@websocket_api.async_response
async def restore_library(hass, connection, msg):
    data = active_data(hass, connection, msg)
    if data is None:
        return
    async with data["lock"]:
        if not data.get("active", True):
            connection.send_error(msg["id"], "not_available", "Integration was unloaded.")
            return
        current = data["state"]
        if current["revision"] != msg["revision"]:
            connection.send_error(msg["id"], "conflict", "Library changed. Reload before restoring.")
            return
        target = next((s for s in current.get("history", []) if s["revision"] == msg["target_revision"]), None)
        if target is None:
            connection.send_error(msg["id"], "not_found", "Version is no longer available.")
            return
        try:
            state = await hass.async_add_executor_job(commit, current, target["library"])
        except (ValueError, TypeError, KeyError, RecursionError) as error:
            connection.send_error(msg["id"], "invalid_library", str(error))
            return
        await persist(hass, connection, msg, data, state)


def parse_card_yaml(source):
    import yaml
    if len(source.encode("utf-8")) > 2_000_000:
        raise ValueError("Karten-YAML überschreitet 2 MB")
    config = yaml.safe_load(source)
    if isinstance(config, dict) and 'button_card_templates' in config:
        templates = convert_button_templates(config)
        if len(templates) != 1:
            raise ValueError('Mehrere Button-Card-Vorlagen in der zentralen Bibliothek importieren')
        return templates[0]['config']
    # HA header/footer YAML is a placement envelope rather than a card.
    if isinstance(config, dict) and "type" not in config and "card" in config:
        if set(config) - {"card", "max_width"}:
            raise ValueError("Fuß-/Kopfzeilen-YAML unterstützt card und max_width; für andere Layouts die einzelne Kartenkonfiguration einfügen")
        config = {"type": "custom:library-container-card", **config}
    library = validate_library({"templates": {"import": {"name": "Karte", "config": config}}, "groups": {}, "people": {}})
    return library["templates"]["import"]["config"]


@websocket_api.websocket_command({"type": "card_library/parse_card", vol.Required("yaml"): str})
# Pure parsing: authenticated dashboard editors may use this without library-write permissions.
@websocket_api.async_response
async def parse_card(hass, connection, msg):
    if active_data(hass, connection, msg) is None:
        return
    try:
        import yaml
        config = await hass.async_add_executor_job(parse_card_yaml, msg["yaml"])
    except (ValueError, TypeError, RecursionError, yaml.YAMLError) as error:
        connection.send_error(msg["id"], "invalid_card_yaml", str(error))
        return
    connection.send_result(msg["id"], config)


def parse_templates_yaml(source):
    import yaml
    if len(source.encode('utf-8')) > 2_000_000:
        raise ValueError('Karten-YAML überschreitet 2 MB')
    document = yaml.safe_load(source)
    if isinstance(document, dict) and 'button_card_templates' in document:
        return convert_button_templates(document)
    return [{'name': 'Karte', 'config': parse_card_yaml(source), 'bindings': []}]


@websocket_api.websocket_command({'type': 'card_library/parse_templates', vol.Required('yaml'): str})
@websocket_api.async_response
async def parse_templates(hass, connection, msg):
    if active_data(hass, connection, msg) is None:
        return
    try:
        import yaml
        templates = await hass.async_add_executor_job(parse_templates_yaml, msg['yaml'])
    except (ValueError, TypeError, RecursionError, yaml.YAMLError) as error:
        connection.send_error(msg['id'], 'invalid_card_yaml', str(error))
        return
    connection.send_result(msg['id'], templates)


@websocket_api.websocket_command({'type':'card_library/dashboard_get', vol.Required('dashboard'): str})
@websocket_api.require_admin
@websocket_api.async_response
async def dashboard_get(hass, connection, msg):
    data = active_data(hass,connection,msg)
    if data is None: return
    try:
        dashboard = get_dashboard(hass,msg['dashboard'])
        config = await dashboard.async_load(dashboard.mode=='yaml')
        if not data.get('active', True):
            connection.send_error(msg['id'], 'not_available', 'Integration was unloaded.')
            return
        result = {'config':config,'fingerprint':fingerprint(config),'mode':dashboard.mode,'library_revision':data['state']['revision']}
    except Exception as error:
        connection.send_error(msg['id'],'dashboard_error',str(error)); return
    connection.send_result(msg['id'],result)


@websocket_api.websocket_command({'type':'card_library/dashboard_write', vol.Required('dashboard'):str,
    vol.Required('fingerprint'):str, vol.Required('path'):list, vol.Required('value'):dict,
    vol.Required('operation'):str, vol.Required('library_revision'):validate_revision, vol.Required('source'):dict})
@websocket_api.require_admin
@websocket_api.async_response
async def dashboard_write(hass,connection,msg):
    data = active_data(hass,connection,msg)
    if data is None: return
    lock = data.setdefault('dashboard_locks',{}).setdefault(msg['dashboard'],asyncio.Lock())
    async with lock, data['lock']:
        try:
            if not re.fullmatch('[0-9a-f]{64}',msg['fingerprint']): raise ValueError('Invalid dashboard fingerprint')
            dashboard = get_dashboard(hass,msg['dashboard'])
            if dashboard.mode != 'storage': raise ValueError('YAML/generated dashboards cannot be saved here; use the exported configuration')
            config = await dashboard.async_load(False)
            if not data.get('active',True): raise ValueError('Integration was unloaded')
            if msg['library_revision'] != data['state']['revision']: raise ValueError('Library changed; reload before saving')
            if fingerprint(config) != msg['fingerprint']: raise ValueError('Dashboard changed; reload before saving')
            if msg['operation'] == 'append':
                source = msg['source']
                if not isinstance(source.get('dashboard'),str) or not isinstance(source.get('fingerprint'),str): raise ValueError('Duplicate source is missing')
                origin = get_dashboard(hass,source['dashboard'])
                origin_config = await origin.async_load(origin.mode=='yaml')
                if fingerprint(origin_config) != source['fingerprint']: raise ValueError('Duplicate source changed; reload')
                config = await dashboard.async_load(False)
                if fingerprint(config) != msg['fingerprint'] or not data.get('active',True) or msg['library_revision'] != data['state']['revision']:
                    raise ValueError('Dashboard/library changed; reload')
            candidate = patch_dashboard(config,msg['path'],msg['value'],msg['operation'],data['state'])
            await dashboard.async_save(candidate)
        except Exception as error:
            connection.send_error(msg['id'],'dashboard_conflict',str(error)); return
        connection.send_result(msg['id'],{'fingerprint':fingerprint(candidate),'config':candidate,'mode':'storage'})
