"""Persistent preload metadata is optional and strict in both template scopes."""
from pathlib import Path
import importlib.util
import unittest

spec=importlib.util.spec_from_file_location('preload_model',Path(__file__).resolve().parents[1]/'custom_components/card_library/model.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)

class PreloadTest(unittest.TestCase):
    def library(self):
        return {'templates':{'menu':{'name':'Menu','preload':True,'config':{'type':'custom:bubble-card','card_type':'pop-up','hash':'#menu','cards':[]},'bindings':[], 'popup_links':[{'hash':'#a'},{'hash':'#b','preload':False}]}},'groups':{},'people':{}}
    def test_optional_metadata_and_explicit_false_are_preserved(self):
        result=model.validate_library(self.library())
        self.assertTrue(result['templates']['menu']['preload'])
        self.assertNotIn('preload',result['templates']['menu']['popup_links'][0])
        self.assertFalse(result['templates']['menu']['popup_links'][1]['preload'])
    def test_non_boolean_template_and_alias_values_are_rejected(self):
        for value in (None,0,1,'true',[],{}):
            for alias in (False,True):
                with self.subTest(value=value,alias=alias):
                    library=self.library();target=library['templates']['menu']['popup_links'][0] if alias else library['templates']['menu'];target['preload']=value
                    with self.assertRaises(ValueError):model.validate_library(library)
