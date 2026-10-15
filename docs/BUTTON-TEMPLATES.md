# Button-Card-Vorlagen / Button Card templates

## Deutsch

Ab v0.5.2 kann ein vollständiger Abschnitt `button_card_templates:` unter
**Konfiguration → Vorlage hinzufügen → Karte aus YAML** eingefügt werden.
**YAML als Karte übernehmen** wandelt alle benannten Einträge in Bibliotheksvorlagen
vom Typ `custom:button-card` um. Danach **Zentrale Änderungen speichern**.
Button Card muss weiterhin separat installiert und als Ressource geladen sein.

Beim Einsetzen der Vorlage erscheint **Entitäten und Variablen dieser Verwendung**.
Variablen wie `entity_cover` bekommen nach Möglichkeit native Entitätsauswahlen;
weitere Variablen können als Text, Zahl oder Checkbox angepasst werden.
Für das Rollladen-Beispiel werden die fünf Entitäten, Anzeigename und Popup-Hash
hier örtlich eingetragen. In der zentralen Vorlage dürfen die Entitäten leer bleiben.
Der Popup-Hash `nav_anchor` wird bei diesem Beispiel ohne führendes `#` eingetragen.

Nur geänderte Variablen werden als örtliche Ausnahmen gespeichert. Änderungen
an Design und JavaScript der Bibliotheksvorlage erreichen weiterhin alle
Verknüpfungen. **Wert aus Vorlage übernehmen** hebt eine einzelne Ausnahme auf.
Zentrale Gruppen-/Personenbindungen bleiben verbindlich.

Die JavaScript-Ausdrücke `[[[ ... ]]]`, Styles, Aktionen und `custom_fields` bleiben
unverändert. Die Integration führt JavaScript beim Import nicht aus. Die Auswertung
übernimmt weiterhin Button Card. Bei `custom_fields.card` wertet Button Card
normalerweise die äußeren Variablen aus; `do_not_eval` behält seine ursprüngliche Wirkung.

Statische Vererbung über `template:` wird beim Import aufgelöst. Alle referenzierten
Vorlagen müssen im eingefügten Abschnitt enthalten sein. Fehlende oder zyklische
Verweise und dynamische Vorlagennamen werden mit einer Fehlermeldung abgewiesen.
Der Import ist eine Übernahme: spätere Änderungen an den ursprünglichen Dashboard-
Templates ändern die Bibliothek nicht. Zentrale Änderungen danach in der Bibliothek
vornehmen. Elternvorlagen werden als importierter Stand in die jeweilige Karte integriert.

## English

From v0.5.2, paste a complete `button_card_templates:` section into the library's
YAML import workspace. Importing converts each named entry into a library template
of type `custom:button-card`. Save central changes afterward. Install Button Card
and its frontend resource separately.

When inserting a template, the entity/variable section exposes its primitive
variables. Entity variables use native entity pickers when available. Only changed
variables become local exceptions; central design and JavaScript remain linked.
Restore a variable's template value to remove its exception. Mandatory shared
bindings cannot be overridden locally.

JavaScript expressions, styles, actions and custom fields are preserved. JavaScript
is evaluated by Button Card, not by the import service. Static inheritance is
inlined from definitions included in the pasted section. Missing/cyclic references
and dynamic template names are rejected. The import is a snapshot of the original
Dashboard templates; manage subsequent central changes in the library.

```yaml
button_card_templates:
  rolladen_karte:
    variables:
      entity_cover: ''
      entity_modus: ''
      entity_beschattung: ''
      entity_override_auto: ''
      entity_override_besch: ''
      friendly_name: Fenster
      nav_anchor: rolllade_info
    entity: '[[[ return variables.entity_cover; ]]]'
    name: '[[[ return variables.friendly_name; ]]]'
    tap_action:
      action: navigate
      navigation_path: '[[[ return "#" + variables.nav_anchor; ]]]'
```

Das Beispiel oben ist bewusst kurz. Die vollständige Rollladenkarte einschließlich
Styles und Unterkarten kann genauso eingefügt werden. / The example is abbreviated;
the full shutter card, including styles and child cards, can be pasted the same way.
