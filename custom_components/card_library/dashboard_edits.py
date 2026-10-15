"""Narrow, optimistic edits through the native Lovelace config API."""
import copy
import hashlib
import json
from .model import (validate_json, get_at, set_at, apply_popup_overrides,
                    validate_card, validate_input_values, validate_popup_options, validate_library_size,
                    validate_popup_content)


def fingerprint(config):
    validate_json(config)
    digest = hashlib.sha256(); size = 0
    for piece in json.JSONEncoder(sort_keys=True,ensure_ascii=False,allow_nan=False,separators=(',',':')).iterencode(config):
        encoded = piece.encode('utf-8'); size += len(encoded)
        if size > 8_000_000: raise ValueError('Dashboard exceeds 8 MB')
        digest.update(encoded)
    return digest.hexdigest()


def get_dashboard(hass, path):
    data = hass.data.get('lovelace')
    dashboards = data.get('dashboards', {}) if isinstance(data,dict) else getattr(data,'dashboards',{})
    dashboard = dashboards.get(path) if path else dashboards.get('lovelace') or dashboards.get(None)
    if dashboard is None: raise ValueError('Dashboard is not available')
    return dashboard


def resolve_reference(library, reference):
    identifier = reference.get('template')
    if not isinstance(identifier,str) or identifier not in library['templates']: raise ValueError('Template is missing')
    template = library['templates'][identifier]
    config = copy.deepcopy(template['config'])
    for binding in template.get('bindings', []):
        value = library['people'][binding['person']][binding['field']] if 'person' in binding else library['groups'][binding['group']]['value']
        set_at(config,binding['path'],value)
    config = apply_popup_overrides(config,template.get('bindings',[]),reference.get('overrides',[]))
    validate_card(config); validate_json(config); validate_library_size(config); validate_input_values(template,config)
    return config


def popup_route(library, template):
    """Read route fields through bindings without resolving unrelated cards."""
    missing = object()

    def read(path):
        for binding in template.get('bindings', []):
            prefix = binding['path']
            if path[:len(prefix)] == prefix:
                value = library['people'][binding['person']][binding['field']] if 'person' in binding else library['groups'][binding['group']]['value']
                return get_at(value, path[len(prefix):], missing)
        return get_at(template['config'], path, missing)

    native_hash = missing
    supported = False
    if read(['type']) == 'custom:bubble-card' and read(['card_type']) == 'pop-up':
        native_hash = read(['hash'])
        supported = isinstance(read(['cards']), list)
    elif read(['type']) == 'vertical-stack' and isinstance(read(['cards']), list) and read(['cards', 0, 'type']) == 'custom:bubble-card' and read(['cards', 0, 'card_type']) == 'pop-up':
        native_hash = read(['cards', 0, 'hash'])
        supported = read(['cards', 0, 'cards']) is missing
    if 'popup' in template:
        return template['popup']['hash']
    return native_hash if supported and native_hash is not missing and native_hash not in (None, '') else None


def validate_popup_reference(library, reference):
    config = resolve_reference(library, reference)
    validate_popup_content(config)
    validate_popup_options(reference.get('popup', {}))


def action_reference(value, library):
    if value.get('action') == 'fire-dom-event' and isinstance(value.get('card_library'),dict) and value['card_library'].get('action') == 'popup':
        reference = value['card_library']; validate_popup_reference(library,reference); return reference['template']
    if value.get('action') == 'navigate' and isinstance(value.get('navigation_path'),str) and value['navigation_path'].startswith('#'):
        for identifier, template in library['templates'].items():
            popup_hash = value['navigation_path']
            if popup_hash == popup_route(library, template):
                validate_popup_reference(library, {'template': identifier})
                return identifier
            for link in template.get('popup_links', []):
                if popup_hash == link['hash']:
                    validate_popup_reference(library, {'template': identifier, 'overrides': link.get('overrides', [])})
                    return identifier
    raise ValueError('Not a supported library popup action')


def validate_placement(value, library):
    if value.get('type') == 'custom:library-card':
        resolve_reference(library,value); return value['template']
    if value.get('type') == 'button' and isinstance(value.get('tap_action'),dict):
        return action_reference(value['tap_action'],library)
    raise ValueError('Only library references or library popup buttons can be inserted')


def patch_dashboard(config, path, value, operation, library):
    validate_json(value)
    if not isinstance(path,list) or len(path)>32 or len(path)<3 or path[0] != 'views' or isinstance(path[1],bool) or not isinstance(path[1],int) or path[1]<0:
        raise ValueError('Invalid dashboard placement')
    if any(isinstance(key,bool) or not isinstance(key,(str,int)) or isinstance(key,str) and (not key or key in {'__proto__','constructor','prototype'}) or isinstance(key,int) and key<0 for key in path):
        raise ValueError('Invalid dashboard path')
    node = get_at(config,path)
    candidate = copy.deepcopy(config)
    if operation == 'replace':
        if not isinstance(node,dict): raise ValueError('Original card/action is no longer at this location')
        if node.get('type') == 'custom:library-card':
            if value.get('type') != 'custom:library-card' or validate_placement(value,library) != node.get('template'): raise ValueError('Template reference cannot change')
        else:
            if node.get('action') != value.get('action') or action_reference(node,library) != action_reference(value,library): raise ValueError('Popup reference cannot change')
        set_at(candidate,path,value)
    elif operation == 'append':
        valid_target = len(path)==3 and path[-1]=='cards' or len(path)==5 and path[2]=='sections' and isinstance(path[3],int) and path[-1]=='cards'
        parent = get_at(config,path[:-1])
        if not valid_target or not isinstance(parent,dict): raise ValueError('Choose a view or section card list as destination')
        if node is None and 'cards' not in parent:
            set_at(candidate,path,[]);node=[]
        if not isinstance(node,list): raise ValueError('Choose a card list as destination')
        if len(path)==3 and (parent.get('type')=='panel' or parent.get('panel') is True) and node: raise ValueError('Panel view already contains its card')
        validate_placement(value,library)
        get_at(candidate,path).append(copy.deepcopy(value))
    else: raise ValueError('Invalid dashboard operation')
    fingerprint(candidate)
    return candidate
