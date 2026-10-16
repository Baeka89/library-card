"""Validation and versioned persistence, independent of Home Assistant."""
import copy
import json
import re
import math
from datetime import datetime, timezone

FORBIDDEN = {"__proto__", "constructor", "prototype"}


def has_text(value):
    return isinstance(value, str) and any(not (char.isspace() or char == "\ufeff") for char in value)


def library_only(state):
    return {key: copy.deepcopy(state.get(key, {})) for key in ("templates", "groups", "people")}


def validate_json(value, depth=0):
    # YAML aliases can reuse entire subtrees. Validate each subtree once while
    # retaining its height, so a reuse at a deeper path still checks the limit.
    heights = {}
    ancestors = set()

    def visit(node, node_depth):
        if node_depth > 64:
            raise ValueError("Configuration is too deeply nested")
        if node is None or isinstance(node, (str, bool)):
            return 0
        if isinstance(node, int) and abs(node) <= 1.7976931348623157e308 or isinstance(node, float) and math.isfinite(node):
            return 0
        if not isinstance(node, (dict, list)):
            raise ValueError("Configuration must contain JSON values")
        identity = id(node)
        if identity in ancestors:
            raise ValueError("Configuration must not contain circular references")
        if identity in heights:
            height = heights[identity]
            if node_depth + height > 64:
                raise ValueError("Configuration is too deeply nested")
            return height
        if isinstance(node, list):
            if len(node) > 10000:
                raise ValueError("List is too large")
            children = node
        else:
            if any(not isinstance(key, str) or key in FORBIDDEN for key in node):
                raise ValueError("Unsafe configuration key")
            children = node.values()
        ancestors.add(identity)
        try:
            height = max((visit(child, node_depth + 1) + 1 for child in children), default=0)
        finally:
            ancestors.remove(identity)
        heights[identity] = height
        return height

    visit(value, depth)


def validate_library_size(value):
    """Stop serializing as soon as aliases or ordinary values exceed the limit."""
    encoder = json.JSONEncoder(ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    size = 0
    for chunk in encoder.iterencode(value):
        size += len(chunk.encode("utf-8"))
        if size > 2_000_000:
            raise ValueError("Library exceeds 2 MB")


def validate_path(path):
    if not isinstance(path, list) or not path or len(path) > 32 or path[0] == "type":
        raise ValueError("Invalid binding path")
    if any(isinstance(p, bool) or not isinstance(p, (str, int)) or
           isinstance(p, str) and (not p or p in FORBIDDEN) or
           isinstance(p, int) and not 0 <= p < 10000 for p in path):
        raise ValueError("Unsafe binding path")


def set_at(value, path, new_value, *, copy_value=True):
    cursor = value
    for i, key in enumerate(path):
        is_list = isinstance(cursor, list)
        if not isinstance(cursor, (dict, list)) or (is_list and
                (not isinstance(key, int) or key > len(cursor))) or (not is_list and not isinstance(key, str)):
            raise ValueError("Binding path does not match configuration")
        if is_list and key == len(cursor):
            cursor.append(None if i == len(path) - 1 else ([] if isinstance(path[i + 1], int) else {}))
        elif not is_list and key not in cursor and i != len(path) - 1:
            cursor[key] = [] if isinstance(path[i + 1], int) else {}
        if i == len(path) - 1:
            cursor[key] = copy.deepcopy(new_value) if copy_value else new_value
        else:
            if isinstance(cursor[key], (dict, list)):
                # YAML aliases can share a descendant between unrelated paths.
                # Detach this branch before writing through it so a binding or
                # dashboard edit affects only the selected occurrence.
                cursor[key] = cursor[key].copy()
            cursor = cursor[key]


def validate_card(node):
    if isinstance(node, dict):
        if node.get("type") == "custom:library-container-card":
            card = node.get("card")
            if not isinstance(card, dict) or not has_text(card.get("type")):
                raise ValueError("Fuß-/Kopfzeile benötigt eine Karte mit type")
            width = node.get("max_width")
            if width is not None and (isinstance(width, bool) or not isinstance(width, (int, float)) or width <= 0):
                raise ValueError("max_width muss eine positive Zahl sein")
        if node.get("type") in ("custom:library-card", "custom:library-manager"):
            raise ValueError("Library cards cannot be inside templates")
        for child in node.values():
            validate_card(child)
    elif isinstance(node, list):
        for child in node:
            validate_card(child)


def popup_template_info(config):
    """Recognize native Bubble standalone and classic stack popup configurations."""
    if config.get("type") == "custom:bubble-card" and config.get("card_type") == "pop-up":
        return {"path": [], "hash": config.get("hash"), "supported": isinstance(config.get("cards"), list)}
    cards = config.get("cards")
    if config.get("type") == "vertical-stack" and isinstance(cards, list) and cards:
        header = cards[0]
        if isinstance(header, dict) and header.get("type") == "custom:bubble-card" and header.get("card_type") == "pop-up":
            return {"path": ["cards", 0], "hash": header.get("hash"), "supported": "cards" not in header}
    return None


def validate_popup_hash(popup_hash):
    if not isinstance(popup_hash, str) or not re.fullmatch(r"#[A-Za-z0-9_-]{1,100}", popup_hash) or popup_hash.startswith("#card-library-popup-"):
        raise ValueError("Invalid popup hash")


def validate_popup_options(options):
    if not isinstance(options, dict) or set(options) & {"type", "card_type", "hash", "cards"}:
        raise ValueError("Invalid popup options")


def paths_overlap(first, second):
    return first[:len(second)] == second or second[:len(first)] == first


def get_at(value, path, default=None):
    for key in path:
        if isinstance(value, dict) and isinstance(key, str) and key in value:
            value = value[key]
        elif isinstance(value, list) and isinstance(key, int) and not isinstance(key, bool) and 0 <= key < len(value):
            value = value[key]
        else:
            return default
    return value


def apply_popup_overrides(resolved, bindings, overrides):
    """Apply the existing ordered local-override DSL without changing shared data."""
    if not isinstance(overrides, list):
        raise ValueError("Popup overrides must be a list")
    if not overrides:
        return resolved
    result = copy.deepcopy(resolved)
    for override in overrides:
        if not isinstance(override, dict):
            raise ValueError("Invalid popup override")
        path = override.get("path")
        validate_path(path)
        if any(paths_overlap(binding["path"], path) for binding in bindings):
            raise ValueError("Shared settings cannot be overridden locally")
        removing = override.get("remove") is True
        parent_path = path[:-1]
        if removing and isinstance(get_at(result, parent_path), list) and any(paths_overlap(binding["path"], parent_path) for binding in bindings):
            raise ValueError("This list structure is managed centrally")
        if not removing and "value" not in override:
            raise ValueError("Popup override needs a value")
        cursor = result
        for index, key in enumerate(path):
            is_list = isinstance(cursor, list)
            if removing and not isinstance(cursor, (dict, list)):
                break
            if not isinstance(cursor, (dict, list)) or (is_list and not isinstance(key, int)) or (not is_list and not isinstance(key, str)):
                raise ValueError("Override path does not match configuration")
            exists = key < len(cursor) if is_list else key in cursor
            if removing and not exists:
                break
            if is_list and key > len(cursor):
                raise ValueError("Override path does not match configuration")
            if index == len(path) - 1:
                if removing:
                    if is_list:
                        cursor.pop(key)
                    else:
                        del cursor[key]
                elif is_list and key == len(cursor):
                    cursor.append(override["value"])
                else:
                    cursor[key] = override["value"]
                break
            if not exists:
                child = [] if isinstance(path[index + 1], int) else {}
                if is_list:
                    cursor.append(child)
                else:
                    cursor[key] = child
            elif isinstance(cursor[key], (dict, list)):
                # YAML aliases and earlier override values can share containers.
                # Detach only this path before applying a later nested operation.
                cursor[key] = cursor[key].copy()
            cursor = cursor[key]
    validate_json(result)
    validate_library_size(result)
    validate_card(result)
    return result


def validate_popup_content(config):
    """Allow one supported native frame, but never a popup inside popup content."""
    native = popup_template_info(config)
    if native and not native["supported"]:
        raise ValueError("Popup requires a standalone Bubble popup with cards or a vertical-stack popup header without its own cards")
    allowed = native["path"] if native else None

    def visit(node, path):
        if isinstance(node, dict):
            if node.get("type") == "custom:bubble-card" and node.get("card_type") == "pop-up" and path != allowed:
                raise ValueError("Popup content cannot contain another Bubble popup")
            for key, child in node.items():
                visit(child, [*path, key])
        elif isinstance(node, list):
            for index, child in enumerate(node):
                visit(child, [*path, index])

    visit(config, [])


def validate_inputs(item):
    category = item.get('category', '')
    if not isinstance(category, str) or len(category) > 100:
        raise ValueError('Invalid template category')
    if not isinstance(item.get('protected', False), bool):
        raise ValueError('Invalid template protection')
    inputs = item.get('inputs', [])
    if not isinstance(inputs, list) or len(inputs) > 100:
        raise ValueError('Invalid input definitions')
    paths = []
    for field in inputs:
        if not isinstance(field, dict) or set(field) - {'path','label','type','required','options','domains'}:
            raise ValueError('Invalid input definition')
        path = field.get('path'); validate_path(path)
        if not has_text(field.get('label')) or len(field['label']) > 200 or field.get('type') not in ('entity','text','number','boolean','select'):
            raise ValueError('Invalid input label/type')
        if not isinstance(field.get('required', False), bool):
            raise ValueError('Invalid required flag')
        if any(paths_overlap(path, previous) for previous in paths):
            raise ValueError('Overlapping input definitions')
        if any(paths_overlap(path, binding['path']) for binding in item.get('bindings', [])):
            raise ValueError('Input field is managed centrally')
        if 'options' in field and (field['type'] != 'select' or not isinstance(field['options'], list) or not field['options'] or any(not has_text(option) for option in field['options']) or len(set(field['options'])) != len(field['options'])):
            raise ValueError('Invalid input options')
        if field['type'] == 'select' and not field.get('options'):
            raise ValueError('Select input needs options')
        if 'domains' in field and (field['type'] != 'entity' or not isinstance(field['domains'], list) or any(not isinstance(domain, str) or not re.fullmatch(r'[a-z_]+',domain) for domain in field['domains'])):
            raise ValueError('Invalid input domains')
        paths.append(path)


def validate_input_values(template, config):
    for field in template.get('inputs', []):
        value = get_at(config, field['path'])
        empty = value is None or isinstance(value,str) and not has_text(value)
        if empty and field.get('required'):
            raise ValueError('Required input missing: ' + field['label'])
        if empty:
            continue
        kind = field['type']
        valid = (kind == 'text' and isinstance(value,str) or
                 kind == 'number' and not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value) or
                 kind == 'boolean' and isinstance(value,bool) or
                 kind == 'select' and isinstance(value,str) and value in field['options'] or
                 kind == 'entity' and isinstance(value,str) and re.fullmatch(r'[a-z_]+\.[a-z0-9_]+',value) and (not field.get('domains') or value.split('.')[0] in field['domains']))
        if not valid:
            raise ValueError('Invalid input value: ' + field['label'])


def validate_protection(current, candidate):
    for identifier, template in current.get('templates', {}).items():
        if not template.get('protected'):
            continue
        replacement = candidate['templates'].get(identifier)
        if replacement is None:
            raise ValueError('Protected template cannot be deleted')
        old = {key:value for key,value in template.items() if key != 'popup_links'}
        new = {key:value for key,value in replacement.items() if key != 'popup_links'}
        if new == old:
            continue
        if new == {**old,'protected':False} and replacement.get('popup_links') == template.get('popup_links'):
            unlocked = library_only(current); unlocked['templates'][identifier]['protected'] = False
            if library_only(candidate) == unlocked:
                continue
        raise ValueError('Unlock the protected template in a separate save before editing')


def validate_library(value):
    if not isinstance(value, dict) or set(value) not in ({"templates", "groups"}, {"templates", "groups", "people"}):
        raise ValueError("Expected templates, groups and people")
    validate_json(value)
    validate_library_size({**value, "people": value.get("people", {})})
    value = copy.deepcopy(value)
    value.setdefault("people", {})
    for kind in ("templates", "groups", "people"):
        if not isinstance(value[kind], dict):
            raise ValueError(f"{kind} must be an object")
        for key, item in value[kind].items():
            if not isinstance(key, str) or not key or len(key) > 128 or key in FORBIDDEN:
                raise ValueError("Invalid identifier")
            if not isinstance(item, dict) or not has_text(item.get("name")):
                raise ValueError("Every item needs a name")
    for item in value["people"].values():
        if not isinstance(item.get("color"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", item["color"]):
            raise ValueError("Person needs a six-digit hex color")
    for item in value["groups"].values():
        if "value" not in item:
            raise ValueError("Shared settings need a value")
    popup_hashes = set()
    for item in value["templates"].values():
        if "preload" in item and not isinstance(item["preload"], bool):
            raise ValueError("Popup preload must be a boolean")
        config = item.get("config")
        if not isinstance(config, dict) or not has_text(config.get("type")):
            raise ValueError("Template needs a card type")
        validate_card(config)
        if "popup" in item:
            route = item["popup"]
            if not isinstance(route, dict) or set(route) - {"hash", "options"}:
                raise ValueError("Invalid popup route")
            validate_popup_hash(route.get("hash"))
            validate_popup_options(route.get("options", {}))
        resolved = copy.deepcopy(config)
        bindings = item.get("bindings", [])
        if not isinstance(bindings, list):
            raise ValueError("Bindings must be a list")
        paths = []
        for binding in bindings:
            if not isinstance(binding, dict):
                raise ValueError("Invalid binding")
            if "person" in binding:
                if not isinstance(binding["person"], str) or binding["person"] not in value["people"] or binding.get("field") not in ("name", "color"):
                    raise ValueError("Missing person or invalid person field")
                if "group" in binding:
                    raise ValueError("Binding cannot reference both a person and group")
            elif not isinstance(binding.get("group"), str) or binding.get("group") not in value["groups"]:
                raise ValueError("Missing shared settings")
            path = binding.get("path")
            validate_path(path)
            for other in paths:
                if path[:len(other)] == other or other[:len(path)] == path:
                    raise ValueError("Overlapping shared settings")
            paths.append(path)
            bound_value = value["people"][binding["person"]][binding["field"]] if "person" in binding else value["groups"][binding["group"]]["value"]
            # This resolved configuration is only inspected, never persisted.
            # Non-overlapping binding paths cannot modify another bound value;
            # borrow values until the expanded size has been checked instead
            # of duplicating a large shared group for every binding.
            set_at(resolved, path, bound_value, copy_value=False)
        validate_json(resolved)
        validate_library_size(resolved)
        validate_card(resolved)
        native = popup_template_info(resolved)
        # Legacy standalone popup headers remain normal templates. Only a
        # complete native format acquires an automatic central hash route.
        popup_hash = item["popup"]["hash"] if "popup" in item else native["hash"] if native and native["supported"] else None
        if "popup" in item or popup_hash is not None and popup_hash != "":
            validate_popup_hash(popup_hash)
            if native and not native["supported"]:
                raise ValueError("Popup requires a standalone Bubble popup with cards or a vertical-stack popup header without its own cards")
            if popup_hash in popup_hashes:
                raise ValueError("Duplicate popup hash")
            popup_hashes.add(popup_hash)
        popup_links = item.get("popup_links", [])
        if not isinstance(popup_links, list):
            raise ValueError("Popup links must be a list")
        for link in popup_links:
            if not isinstance(link, dict) or set(link) - {"hash", "overrides", "options", "preload"}:
                raise ValueError("Invalid popup link")
            if "preload" in link and not isinstance(link["preload"], bool):
                raise ValueError("Popup preload must be a boolean")
            link_hash = link.get("hash")
            validate_popup_hash(link_hash)
            validate_popup_options(link.get("options", {}))
            if link_hash in popup_hashes:
                raise ValueError("Duplicate popup hash")
            popup_hashes.add(link_hash)
            linked_config = apply_popup_overrides(resolved, bindings, link.get("overrides", []))
            validate_popup_content(linked_config)
        design_paths = item.get("design_paths", [])
        if not isinstance(design_paths, list):
            raise ValueError("Design paths must be a list")
        selected = []
        for path in design_paths:
            validate_path(path)
            cursor = resolved
            for key in path:
                if isinstance(cursor, dict) and isinstance(key, str) and key in cursor:
                    cursor = cursor[key]
                elif isinstance(cursor, list) and isinstance(key, int) and not isinstance(key, bool) and key < len(cursor):
                    cursor = cursor[key]
                else:
                    raise ValueError("Design path does not exist")
            if any(path[:len(other)] == other or other[:len(path)] == path for other in selected):
                raise ValueError("Overlapping design paths")
            selected.append(path)
        validate_inputs(item)
        dependencies = item.get("dependencies", [])
        if not isinstance(dependencies, list) or any(not isinstance(d, str) or not d.startswith(("https://", "http://", "/")) for d in dependencies):
            raise ValueError("Dependencies must be resource URLs")
    return value


def commit(current, library):
    validated = validate_library(library)
    validate_protection(current, validated)
    snapshot = {"revision": current["revision"], "saved_at": datetime.now(timezone.utc).isoformat(),
                "library": library_only(current)}
    history = [*current.get("history", []), snapshot][-10:]
    return {**validated, "revision": current["revision"] + 1, "history": history}


def public_state(state):
    return {**library_only(state), "revision": state["revision"]}
