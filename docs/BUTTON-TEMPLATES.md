# Button-Card-Vorlagen / Button Card templates

[Deutsch](#deutsch) | [English](#english)

<a id="deutsch"></a>
## Deutsch

### 1. Zentrale Vorlagen importieren

Einen vollständigen Abschnitt `button_card_templates:` unter **Konfiguration → Vorlage hinzufügen → Karte aus YAML** einfügen. **„YAML als Karte übernehmen“** wandelt die benannten Einträge in Bibliotheksvorlagen vom Typ `custom:button-card` um. Danach **„Zentrale Änderungen speichern“**. Button Card muss separat installiert und als Ressource geladen sein.

Statische Vererbung über `template:` wird bei diesem zentralen Import aufgelöst. Alle referenzierten Elternvorlagen müssen im eingefügten Abschnitt enthalten sein. Fehlende oder zyklische Verweise und dynamische Vorlagennamen werden abgewiesen. Der Import übernimmt den aktuellen Stand; spätere Änderungen an den ursprünglichen Dashboard-Templates ändern die Bibliothek nicht. Design und Logik anschließend zentral in der Bibliothek pflegen.

### 2. Verknüpfte Karten verwenden

Beim Einsetzen einer Vorlage erscheint **„Entitäten und Variablen dieser Verwendung“**. Variablen wie `entity_cover` erhalten nach Möglichkeit native Entitätsauswahlen. Weitere einfache Variablen lassen sich als Text, Zahl oder Checkbox anpassen. Beim Rollladen-Beispiel werden fünf Entitäten, Anzeigename und Popup-Hash örtlich eingetragen. In der zentralen Vorlage dürfen die Entitäten leer bleiben. `nav_anchor` wird in diesem Beispiel ohne führendes `#` eingetragen.

Manuell geänderte Variablen werden als örtliche Ausnahmen gespeichert. **„Wert aus Vorlage übernehmen“** hebt eine einzelne Ausnahme auf. Zentrale Gruppen-/Personenbindungen bleiben verbindlich. JavaScript-Ausdrücke `[[[ ... ]]]`, Styles, Aktionen und `custom_fields` bleiben erhalten; die Auswertung übernimmt Button Card. Die Integration führt JavaScript beim Import nicht aus. Bei `custom_fields.card` wertet Button Card normalerweise die äußeren Variablen aus; `do_not_eval` behält seine ursprüngliche Wirkung.

### 3. Vorhandenen Kartenaufruf übernehmen

Der Umwandler ist Bestandteil von v1.1.0. Er nutzt eine **vorhandene, ausdrücklich ausgewählte Bibliotheksvorlage**. Dabei wird keine weitere Vorlage angelegt und der alte Dashboard-Eintrag nicht automatisch ersetzt.

1. Im Home-Assistant-Dashboard eine neue Karte anlegen und **Vorlagenkarte** wählen.
2. Die gewünschte vorhandene Bibliotheksvorlage vom Typ `custom:button-card` auswählen.
3. **„Vorhandene Button Card übernehmen“** aufklappen.
4. Den alten Kartenaufruf unter **„Bisherige Kartenkonfiguration (YAML)“** einfügen.
5. **„Für diese Karte übernehmen“** drücken und die übernommenen Werte prüfen.
6. Mit dem normalen Home-Assistant-Speichern die neue Karte sichern.

Alternativ liefert **„Neue Vorlagenkarte (YAML)“** den vollständigen neuen Referenzcode. **„Neuen YAML-Code kopieren“** übernimmt ihn in die Zwischenablage; bei fehlendem Zugriff bleibt manuelles Kopieren möglich. Diesen Code bei Bedarf selbst an der bisherigen Dashboardstelle einsetzen.

Die Übernahme verwendet nur den vorhandenen YAML-Parser und den lokalen Konfigurationsänderungs-Event des geöffneten Karteneditors. Sie ruft weder `card_library/save` noch `card_library/dashboard_write` auf. Erst das reguläre HA-Speichern ändert das Dashboard. Änderungen am eingefügten Quelltext leeren die zuvor akzeptierte YAML-Ausgabe, bis die Eingabe erneut übernommen wird.

### 4. Übernahme und Grenzen

- Unterstützt werden eine einzelne `custom:button-card` mit genau einem festen `template`-Namen, auch als Liste mit einem Eintrag, sowie eine vollständige einzelne Button Card ohne `template`. Mehrere oder dynamische Vorlagenverweise werden abgewiesen. Das im Editor ausgewählte Bibliothekstemplate ist das Ziel; der alte Name legt kein zusätzliches Bibliothekstemplate an.
- Explizit eingefügte Variablen bleiben lokal, **auch wenn ihr Wert derzeit dem zentralen Wert entspricht**. Fehlende Felder bleiben verknüpft und löschen keine zentrale Einstellung. Vorhandene lokale Ausnahmen bleiben erhalten, soweit ein eingefügter Wert sie nicht ausdrücklich ersetzt.
- Bei einem Kartenaufruf mit `template` werden lokale Objektfelder mit dem ausgewählten zentralen Stand zusammengeführt. Listen folgen der Button-Card-Vererbung; `state` berücksichtigt seine `id`-Einträge. Bei einer vollständigen Karte ohne `template` werden ausdrücklich enthaltene Listen, `state` und `extra_styles` vollständig übernommen. Die resultierenden lokalen Listen und `extra_styles` sind Momentaufnahmen: spätere zentrale Änderungen an genau diesen Feldern werden dort nicht übernommen. Die Oberfläche weist darauf hin; andere Felder bleiben verknüpft.
- Zentrale und lokale `extra_styles`-Beiträge mit JavaScript werden abgewiesen, wenn ihre getrennten Auswertungen nicht verlustfrei zusammengeführt werden können. Reiner CSS-Text lässt sich zusammenführen. JavaScript wird für die Umwandlung nicht ausgeführt.
- Widersprüche zu zentralen Gruppen-/Personenbindungen werden abgewiesen. Das gilt auch für gebundene HA-Platzierungsfelder. `grid_options`, `layout_options`, `view_layout` und `visibility` werden außen an der neuen Referenzkarte erhalten; übrige Kartenfelder gehören zur inneren Button Card.
- Noch vorhandene verschachtelte Button-Card-Template-Verweise benötigen ihre Definitionen weiterhin im Dashboard. Pflichtfeldhinweise vor dem Speichern prüfen. Änderungen an Vorlage, Verbindung, Kartenkonfiguration oder Eingabe während einer laufenden Prüfung verhindern die Übernahme veralteter Ergebnisse.

Die lokale Browserprüfung verwendet originale Button Card **7.0.1** und die vollständige Rollladen-Testvorlage. HA-Karteneditor, Kartenhelfer und Speicherung sind dabei teilweise nachgebildet. Das ersetzt keinen vollständigen Test auf einer realen Home-Assistant-Installation. Einzelheiten: [Prüfungen](TESTS.md).

### 5. Beispiel: bisheriger Dashboard-Aufruf

Dieses vollständige YAML wird in den Umwandler eingefügt, nachdem die passende Bibliotheksvorlage ausgewählt wurde:

```yaml
type: custom:button-card
template: rolladen_karte
variables:
  entity_cover: cover.rolllade_kuchenfenster_3
  entity_modus: sensor.rollladen_modus_kuchenfenster
  entity_beschattung: sensor.rollladen_beschattung_modus_kuchenfenster
  entity_override_auto: input_boolean.rollladen_modus_override_kuchenfenster
  entity_override_besch: input_boolean.rollladen_beschattung_modus_override_kuchenfenster
  friendly_name: Küchenfenster
  nav_anchor: rolllade_kuchenfenster_info
```

Alle sieben Werte werden lokal übernommen. Gestaltung, JavaScript, Aktionen und Unterkarten kommen weiterhin aus der ausgewählten zentralen Vorlage. Die Oberfläche erzeugt die neue `custom:library-card`-Referenz mit ihrer tatsächlichen Vorlagen-ID und ihren lokalen Ausnahmen.

<a id="english"></a>
## English

### 1. Import central templates

Paste a complete `button_card_templates:` section under **Konfiguration → Vorlage hinzufügen → Karte aus YAML**. **“YAML als Karte übernehmen”** converts the named entries into library templates of type `custom:button-card`. Then press **“Zentrale Änderungen speichern”**. Install Button Card and load its frontend resource separately.

This central import resolves static inheritance through `template:`. Include all referenced parent definitions in the pasted section. Missing or cyclic references and dynamic template names are rejected. Importing captures the current state; later changes to the original dashboard templates do not change the library. Maintain subsequent design and logic changes centrally in the library.

### 2. Use linked cards

Inserting a template exposes **“Entitäten und Variablen dieser Verwendung”**. Variables such as `entity_cover` use native entity pickers when available. Other primitive variables support text, numbers or checkboxes. The shutter example uses five local entities, a display name and a popup hash. Entity values may remain empty in the central template. In this example, enter `nav_anchor` without a leading `#`.

Manually changed variables become local exceptions. **“Wert aus Vorlage übernehmen”** removes an individual exception. Shared group/person bindings remain mandatory. JavaScript expressions `[[[ ... ]]]`, styles, actions and `custom_fields` are preserved and evaluated by Button Card. The integration does not execute JavaScript during import. Button Card normally evaluates outer variables inside `custom_fields.card`; `do_not_eval` retains its original behavior.

### 3. Import an existing card call

The converter is included in v1.1.0. It uses an **existing library template explicitly selected by the user**. No additional template is created, and the old dashboard entry is not replaced automatically.

1. Add a new card to the Home Assistant dashboard and choose **Vorlagenkarte**.
2. Select the desired existing library template of type `custom:button-card`.
3. Expand **“Vorhandene Button Card übernehmen”**.
4. Paste the old card call into **“Bisherige Kartenkonfiguration (YAML)”**.
5. Press **“Für diese Karte übernehmen”** and check the imported values.
6. Save the new card using Home Assistant's normal save operation.

Alternatively, **“Neue Vorlagenkarte (YAML)”** shows the complete new reference configuration. **“Neuen YAML-Code kopieren”** copies it to the clipboard; manual copying remains available when clipboard access is unavailable. Insert this configuration at the previous dashboard location yourself if needed.

Importing uses only the existing YAML parser and the open card editor's local configuration-change event. It calls neither `card_library/save` nor `card_library/dashboard_write`. The normal HA save operation commits the dashboard change. Editing the pasted source clears previously accepted YAML output until the input is imported again.

### 4. Import behavior and limits

- Supported input is a single `custom:button-card` with exactly one fixed `template` name, including a one-entry list, or a complete individual Button Card without `template`. Multiple or dynamic template references are rejected. The library template selected in the editor determines the target; the old name does not create an additional library template.
- Explicitly supplied variables remain local **even when currently equal to the central value**. Missing fields keep inheriting and do not delete central settings. Existing local exceptions remain unless a supplied value explicitly replaces them.
- A call with `template` merges local object fields with the selected central configuration. Lists follow Button Card inheritance; `state` respects its `id` entries. A complete card without `template` imports explicitly supplied lists, `state` and `extra_styles` in full. Resulting local lists and `extra_styles` are snapshots: subsequent central changes to those specific fields do not propagate there. The interface explains this; other fields remain linked.
- Central and local `extra_styles` contributions involving JavaScript are rejected when their separate evaluations cannot be combined without loss. Plain CSS can be combined. Conversion does not execute JavaScript.
- Conflicts with shared group/person bindings are rejected, including bound HA placement fields. `grid_options`, `layout_options`, `view_layout` and `visibility` stay on the outer reference card; other card fields belong to the inner Button Card.
- Remaining nested Button Card template references still require their definitions in the dashboard. Check required-input messages before saving. Changes to the template, connection, card configuration or input during validation prevent stale results from being applied.

Local browser verification uses original Button Card **7.0.1** and the complete shutter test template. HA card editing, card helpers and persistence are partially simulated. This does not replace complete testing on a live Home Assistant installation. Details: [Tests](TESTS.md).

### 5. Example: previous dashboard call

Paste this complete YAML into the converter after selecting the matching library template:

```yaml
type: custom:button-card
template: rolladen_karte
variables:
  entity_cover: cover.rolllade_kuchenfenster_3
  entity_modus: sensor.rollladen_modus_kuchenfenster
  entity_beschattung: sensor.rollladen_beschattung_modus_kuchenfenster
  entity_override_auto: input_boolean.rollladen_modus_override_kuchenfenster
  entity_override_besch: input_boolean.rollladen_beschattung_modus_override_kuchenfenster
  friendly_name: Küchenfenster
  nav_anchor: rolllade_kuchenfenster_info
```

All seven values become local settings. Design, JavaScript, actions and child cards continue to come from the selected central template. The interface generates the new `custom:library-card` reference with its actual template ID and local exceptions.
