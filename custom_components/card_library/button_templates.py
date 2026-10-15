"""Convert button-card template definitions without executing their JavaScript."""
import copy
from .model import validate_json, validate_library, validate_library_size


def _bounded(value):
    validate_json(value)
    validate_library_size(value)
    return value


def _merge(left, right):
    result = copy.deepcopy(left)
    for key, value in right.items():
        previous = result.get(key)
        if isinstance(previous, dict) and isinstance(value, dict):
            result[key] = _merge(previous, value)
        elif isinstance(previous, list) and isinstance(value, list):
            result[key] = copy.deepcopy(previous + [item for entry in value for item in (entry if isinstance(entry, list) else [entry])])
        elif isinstance(previous, (list, dict)) and isinstance(value, (list, dict)) and type(previous) is not type(value):
            raise ValueError('Button-Card-Vererbung mischt Liste und Objekt: ' + key)
        else:
            result[key] = copy.deepcopy(value)
    return _bounded(result)


def _merge_states(previous, following):
    if not isinstance(previous, list) or not isinstance(following, list) or any(not isinstance(item, dict) for item in previous + following):
        raise ValueError('Button-Card-state muss eine Liste von Objekten sein')
    combined = []
    for old in previous:
        current = copy.deepcopy(old)
        for new in following:
            if old.get('id') and new.get('id') == old['id']:
                current = _merge(current, new)
        combined.append(current)
    combined.extend(copy.deepcopy(new) for new in following if not new.get('id') or not any(old.get('id') == new['id'] for old in previous))
    return combined


def convert_button_templates(document):
    _bounded(document)
    if set(document) != {'button_card_templates'}:
        raise ValueError('Nur den Abschnitt button_card_templates einfügen, nicht das gesamte Dashboard')
    definitions = document['button_card_templates']
    if not isinstance(definitions, dict) or not definitions:
        raise ValueError('button_card_templates benötigt benannte Vorlagen')
    for name, config in definitions.items():
        if not isinstance(name, str) or not name.strip() or len(name) > 128 or not isinstance(config, dict):
            raise ValueError('Ungültige Button-Card-Vorlage')
    cache = {}

    def expand(config, stack):
        if len(stack) > 32:
            raise ValueError('Button-Card-Vererbung ist zu tief')
        parents = config.get('template', [])
        if isinstance(parents, str):
            parents = [parents]
        if not isinstance(parents, list) or any(not isinstance(name, str) for name in parents):
            raise ValueError('Button-Card-Vererbung benötigt feste Vorlagennamen')
        result = {}
        merged_states = []
        extra_styles = []
        has_states = False
        for name in parents:
            if name in stack:
                raise ValueError('Zyklische Button-Card-Vererbung: ' + name)
            if name not in definitions:
                raise ValueError('Button-Card-Vorlage fehlt im Import: ' + name)
            if name not in cache:
                cache[name] = expand(definitions[name], stack + [name])
                _bounded(cache)
            parent = cache[name]
            result = _merge(result, parent)
            if 'state' in parent:
                merged_states = _merge_states(merged_states, parent['state']); has_states = True
            if parent.get('extra_styles') is not None:
                if not isinstance(parent['extra_styles'], str): raise ValueError('extra_styles muss CSS-Text sein')
                extra_styles.append(parent['extra_styles'])
        result = _merge(result, {key: value for key, value in config.items() if key != 'template'})
        if parents and ('state' in config or has_states):
            result['state'] = _merge_states(merged_states, config.get('state', []))
        if parents:
            if config.get('extra_styles') is not None:
                if not isinstance(config['extra_styles'], str): raise ValueError('extra_styles muss CSS-Text sein')
                extra_styles.append(config['extra_styles'])
            if extra_styles: result['extra_styles'] = '\n'.join(extra_styles)
        return _bounded(result)

    def nested(node, depth=0):
        if depth > 64:
            raise ValueError('Verschachtelte Button Cards sind zu tief')
        if isinstance(node, list):
            return [nested(value, depth + 1) for value in node]
        if not isinstance(node, dict):
            return node
        if node.get('type') == 'custom:button-card' and 'template' in node:
            node = expand(node, [])
        return {key: nested(value, depth + 1) for key, value in node.items()}

    templates = {}
    for name, config in definitions.items():
        converted = nested({'type': 'custom:button-card', **expand(config, [name])})
        if converted['type'] != 'custom:button-card':
            raise ValueError('Button-Card-Vorlagen müssen custom:button-card verwenden')
        templates[name] = {'name': name, 'config': converted, 'bindings': []}
        validate_library({'templates': templates, 'groups': {}, 'people': {}})
    return list(templates.values())
