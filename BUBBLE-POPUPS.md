# Zentrale Vorlagen als Bubble-Popup – 0.5.0

## Bereits fertiges Bubble-Popup direkt verwenden

Ein vollständiges Popup kann direkt in der Bibliothek gespeichert bleiben. Sein `hash` wird automatisch erkannt; es braucht keine zusätzliche Vorlagenkarte im Dashboard. Unterstützt werden eine eigenständige Bubble-Popup-Karte mit `cards` und ein vollständiger `vertical-stack`, dessen erste Karte ein klassischer Bubble-Popup-Kopf ohne eigene `cards` ist.

Beispiel für die gespeicherte Vorlage:

```yaml
type: custom:bubble-card
card_type: pop-up
hash: '#kalender'
name: Familienkalender
width_desktop: 900px
cards:
  - type: calendar
    entities:
      - calendar.calendar
```

1. Unter **Vorlage hinzufügen → Karte aus YAML** das vollständige Popup einfügen oder eine bereits gespeicherte Popup-Vorlage öffnen.
2. **Zentrale Änderungen speichern**. Hash, Inhalt und Gestaltung lassen sich später im originalen Karteneditor bearbeiten.
3. Unter **Popup über #Hash öffnen** den wirksamen Hash und **Popup-Button (YAML)** ablesen. Eine eventuell vorhandene separate Popup-Zuordnung hat Vorrang vor dem Hash aus der Kartenkonfiguration.
4. Auf dem Zieldashboard ausschließlich den öffnenden Button verwenden:

```yaml
type: button
name: Familienkalender
icon: mdi:calendar
tap_action:
  action: navigate
  navigation_path: '#kalender'
```

Falls dort bereits eine unsichtbare `custom:library-card`-Verknüpfung oder eine zusätzliche Popup-Karte liegt, diese einmal aus dem Dashboard entfernen. Der Button bleibt erhalten. Die Bibliothek ändert vorhandene Dashboards beim Update nicht automatisch. Der benötigte Popup-Rahmen und sein verknüpfter Inhalt werden beim Aufruf am HA-App-Root erzeugt, außerhalb der Dashboard-Zellen; dadurch entsteht kein zusätzlicher Layoutplatz.

Bei zentralen Inhaltsänderungen bleibt der Popup-Rahmen bestehen. Eigenständige Popups behalten Bubbles originales Kartenraster einschließlich `grid_options`; die Unterkarten werden über die native Konfigurationsschnittstelle aktualisiert. Klassische Stacks verwenden eine Inhaltsreferenz auf ihren ursprünglichen Stack. Änderungen am Popup-Rahmen erzeugen ihn neu. Eine duplizierte native Popup-Vorlage erhält eine eigene Hash-Zuordnung; ihre gemeinsamen Bindungen bleiben erhalten.

## Normale Inhaltsvorlagen über #Hash öffnen

Dieser Abschnitt gilt für Vorlagen ohne eigenen Bubble-Popup-Rahmen. Für vollständige native Popup-Vorlagen gilt die Anleitung oben mit automatisch erkanntem Hash.

1. Bibliothek 0.5.0 installieren, HA neu starten und die Modulressource auf `/card_library/card-library.js?v=0.5.0` aktualisieren. Browser neu laden.
2. In der Kartenbibliothek die gewünschte gespeicherte Vorlage bearbeiten.
3. „Popup über #Hash öffnen“ öffnen und z. B. `#kalender` eintragen. Optional Titel und Desktop-Breite festlegen.
4. „Zentrale Änderungen speichern“ drücken. Die Zuordnung liegt mit der Vorlage in der Integration, einschließlich Export/Import und Verlauf.
5. Im vorhandenen Button oder Chip ganz normal auf diesen Hash navigieren:

```yaml
tap_action:
  action: navigate
  navigation_path: '#kalender'
```

Keine zusätzliche Vorlagenkarte, Popup-Karte oder spezielle Öffnungsaktion im Dashboard erforderlich. Der vorhandene Button bleibt der Auslöser; der Popup-Inhalt wird ausschließlich zentral gespeichert. Auch ein direkter Link wie `/dashboard-test/0#kalender` wird nach Bereitstellung der Bibliothek erkannt.

Der Hash muss exakt übereinstimmen und innerhalb der Bibliothek eindeutig sein. Verwende ihn nicht gleichzeitig für eine bereits platzierte native Bubble-Popup-Karte. Buchstaben, Zahlen, `_` und `-` sind erlaubt, der interne Präfix `#card-library-popup-` ist reserviert. Die Zuordnung gilt HA-weit für Dashboards, auf denen die Bibliotheksressource geladen ist.

Für diesen Weg gelten die zentralen Popup-Einstellungen und die zentrale Vorlagenkonfiguration. Die lokalen Ausnahmen des unten beschriebenen separaten Aktionsaufrufs werden nicht automatisch in die Hash-Zuordnung kopiert.

Die Ressource stellt eine gemeinsame Bibliotheksverbindung und einen HA-Zustandsempfänger bereit. Sie erzeugt keine Inhaltskarte, bevor ein zugeordneter Hash aufgerufen wird. Das bestehende Serverprotokoll überträgt die Bibliothek vollständig; lediglich der angeforderte Inhalt wird aufgelöst und dargestellt.

Die Hash-Zuordnung wird als optionale Vorlage-Metadaten gespeichert, beispielsweise:

```yaml
popup:
  hash: '#kalender'
  options:
    name: Familienkalender
    width_desktop: 900px
```

Beim Entfernen dieses Metadaten-Hashes und Speichern wird die separate Zuordnung gelöscht. Enthält die Vorlage ein vollständiges natives Popup, greift danach wieder dessen eigener `hash`. Um dessen Aufruf zu entfernen, auch diesen Hash im Originaleditor leeren. Beim Duplizieren normaler Inhaltsvorlagen wird die separate Zuordnung entfernt; native Popup-Duplikate erhalten einen neuen eindeutigen Hash. Eine zentrale Änderung der Popup-Optionen erzeugt den geöffneten Rahmen erneut; Inhaltsänderungen aktualisieren den zentral verbundenen Inhalt.

## Eigene Hash-Verknüpfungen mit lokalen Änderungen

In der öffentlichen Version 0.5.0 kann dieselbe Vorlage über mehrere Hashes mit verschiedenen lokalen Einstellungen geöffnet werden. Beispiel: `#Menu-Wohnzimmer` und `#Menu-Flur`. Beide bleiben mit der zentralen Vorlage verbunden; nur gespeicherte Ausnahmen gelten je Verknüpfung.

1. Im Editor einer **Vorlagenkarte** unter **Vorlagen einsetzen** die gespeicherte Vorlage wählen.
2. Unter **Örtliche Anpassungen** die gewünschten Kartenwerte ändern, etwa Entitäten oder `card_mod`.
3. **Als Bubble-Popup verwenden → Eigene Popup-Verknüpfung** öffnen. Unter **Popup-Verknüpfung** „Neue Verknüpfung“ wählen und **Eigener Popup-Hash** eintragen.
4. Titel und Breite bei Bedarf ändern. Die Felder zeigen übernommene Werte; Leeren stellt die Übernahme wieder her.
5. **Verknüpfung speichern** drücken. Administratoren speichern damit Hash und lokale Ausnahmen in der Integration, unabhängig vom Dashboard-Speichern.
6. Den **Hash-Button (YAML)** übernehmen. Auf dem Zieldashboard steht ausschließlich dieser Button. Die zum Einrichten geöffnete Vorlagenkarte anschließend abbrechen, wenn sie dort nicht als normale Karte benötigt wird.

```yaml
tap_action:
  action: navigate
  navigation_path: '#Menu-Wohnzimmer'
```

Für die zweite Variante erneut „Neue Verknüpfung“ wählen, die lokalen Kartenwerte ändern und einen anderen Hash speichern. Vorhandene Verknüpfungen lassen sich über die Auswahl laden, bearbeiten und erneut speichern. Der Button-Code wird erst angeboten, wenn die aktuellen lokalen Einstellungen gespeichert sind. Gespeicherte Hashes müssen einschließlich Groß-/Kleinschreibung exakt übereinstimmen und innerhalb der Bibliothek eindeutig sein.

Der Bereich **Zentralen Popup-Hash verwenden** zeigt den bestehenden zentralen Hash und seinen Button. Dieser Aufruf verwendet die zentrale Konfiguration; örtliche Änderungen dieser Verwendung gehen ausschließlich in eine eigene Verknüpfung oder einen direkten Aktionsaufruf ein.

**Verknüpfung entfernen** löscht nur den eigenen Hash und seine Ausnahmen. Bei bekannten Dashboard-Verwendungen wird Entfernen oder Umbenennen abgewiesen: zuerst die betreffenden Buttons ändern oder entfernen. In der zentralen Kartenbibliothek werden Änderungen an Verknüpfungen zunächst in den Entwurf übernommen; danach **Zentrale Änderungen speichern** drücken.

Export, Import und Verlauf enthalten die Verknüpfungen unter `popup_links`. Beim Duplizieren einer Vorlage werden deren eigene Verknüpfungen entfernt, damit keine doppelten Hashes entstehen. Zentrale Bindungen bleiben auch bei lokalen Ausnahmen verbindlich.

## Alternativer eigener Aktionsaufruf ohne eigenen Hash

Die Bibliothek erzeugt beim Aufruf eine originale `bubble-card` mit `card_type: pop-up`. Normale Inhalte und klassische Stacks verwenden eine `custom:library-card`-Inhaltsreferenz; eigenständige Bubble-Vorlagen verwenden ihre originalen Unterkarten und ihr natives Raster. Beide Wege bleiben zentral verbunden. Eine dauerhaft platzierte Popup-Karte in der Dashboard-Konfiguration ist nicht erforderlich. Bubble Card wird nicht verändert.

Voraussetzungen: aktuelle Bibliotheksintegration und JavaScript-Ressource, geladene Bubble-Card-Ressource mit eigenständigem Popup-Format (ab 3.2.0). Die Vorlage darf normalen Karteninhalt oder ein oben beschriebenes vollständiges Bubble-Popup enthalten. Der native Rahmen wird nur einmal erzeugt. Einzelne alte Popup-Köpfe ohne Inhalt bleiben normale Vorlagen und benötigen für diesen Aufruf einen vollständigen Popup-Stack oder eigene `cards`.

## Grafischer Einstieg

1. Im Vorlagenkarteneditor „Vorlagen einsetzen“ öffnen und eine Vorlage wählen.
2. Optional örtliche Anpassungen wie gewohnt bearbeiten.
3. „Als Bubble-Popup verwenden“ öffnen, Titel und Desktop-Breite bei Bedarf ändern. Übernommene Werte werden angezeigt.
4. „Bubble-Popup testen“ öffnet die Vorschau.
5. Unter **Direkter Button-Aufruf ohne eigenen Hash** den **Button zum Öffnen (YAML)** auf das Dashboard kopieren. Die zur Konfiguration verwendete Vorlagenkarte muss dort nicht gespeichert werden.

Auch die Kartenbibliothek bietet den Aufruf unter „Im Dashboard einbauen“. Vorher zentrale Änderungen speichern. Spätere Änderungen an lokalen Einstellungen der zum Erzeugen verwendeten Vorlagenkarte verändern einen bereits kopierten Button nicht; dafür den Aufruf erneut übernehmen. Zentrale Vorlagenänderungen wirken weiterhin auf das Popup.

## Direktaufruf

```yaml
type: button
name: Familienkalender
icon: mdi:calendar
tap_action:
  action: fire-dom-event
  card_library:
    action: popup
    template: DEINE_VORLAGEN_ID
    popup:
      name: Familienkalender
      width_desktop: 900px
```

Unter `card_library.overrides` kann die bestehende Liste lokaler Anpassungen angegeben werden. Unter `popup` werden originale Bubble-Einstellungen weitergereicht, beispielsweise `styles`, `bg_color`, `bg_opacity` oder `show_header`. `type`, `card_type`, `hash` und `cards` sind reserviert. CSS des Popup-Rahmens und `card_mod` des Vorlageninhalts sind getrennte Einstellungen. Nicht jede Inhaltskarte unterstützt jeden Style-Schlüssel.

Der alternative Aktionshandler hört auf das von HA verwendete `ll-custom`-Ereignis mit `detail.card_library`. Sein Auslöser muss HA-`fire-dom-event` unterstützen. Normale Hash-Navigation funktioniert über die oben beschriebene zentrale Zuordnung. Es gibt keinen neuen serverseitigen Popup-Dienst.

## Prüfumfang und Grenzen

Automatisierte Prüfungen umfassen originale Kartentypen, lokale Ausnahmen, Zustandsweitergabe, Hash-Aufrufe und Navigation, Ressourcenfehler und Aufräumen. In der öffentlichen Version 0.5.0 sind außerdem mehrere Hash-Verknüpfungen je Vorlage, separate Entitäten/Styles/Optionen, geerbte Werte, zentrale Aktualisierung, Auswahlwechsel beim Speichern und Löschschutz geprüft. Ein verbundener Ressourcentest verwendet die tatsächliche Hauptressource mit Client und Router; das simulierte Dashboard enthält ausschließlich öffnende Buttons. Ergebnisse und Grenzen: [Funktionstest 0.5.0](docs/TESTS.md).

Beim Wechsel zu einem anderen nativen Bubble-Popup bleibt höchstens eine geschlossene Bibliothekshülle bis zum Schließen des fremden Hashes erhalten. Dadurch setzt ein verspätetes Entfernen nicht die globale Scrollsperre des neuen Popups zurück. Beim nächsten Bibliotheksaufruf oder Verlassen der Seite wird die Hülle entfernt. Root-`card_mod` wird mit dem originalen `hui-card`-Host geladen, sofern dieser verfügbar ist; ohne ihn bleibt der ursprüngliche Kartenfactory-Pfad erhalten.

Die Popup-Tests verwenden DOM- und Bubble-Testdoubles. Originale Bubble-Darstellung, Animation, Theme-Vererbung, Karten innerhalb des Popups und mobile HA-Apps sind noch in HA zu prüfen. Quellcodebasis für den Adapter: https://github.com/Clooos/Bubble-Card/tree/main/src/cards/pop-up .
