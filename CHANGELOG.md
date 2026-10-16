# Changelog

Veröffentlichte Änderungen; neueste zuerst. / Published changes, newest first.

## [1.0.0] – 2026-10-15

### Deutsch

**Hinzugefügt**

- Vollständige YAML-Ausgabe zentraler Vorlagen und gespeicherter Hash-Varianten mit aktuellen gemeinsamen Werten, lokalen Ausnahmen, Unterkarten, Popup-Optionen und Kopierfunktion.
- Wählbares Hintergrund-Vorladen und Bereithalten der originalen Bubble-Popups je Vorlage; Hash-Varianten können erben, aktivieren oder deaktivieren.

**Geändert**

- Ausgewählte Popup-Instanzen bleiben außerhalb des Dashboard-Rasters verbunden und erhalten HA-Zustandsupdates. Unveränderte Varianten werden wiederverwendet; ungültige oder entfernte Varianten werden aufgeräumt. Laden beim Öffnen bleibt der Standard.
- Das einzelne Aktualisierungsskript übernimmt die Quellen, prüft den Ausgangsstand und veröffentlicht erst nach erfolgreichen lokalen und GitHub-Prüfungen. Entwürfe und Assets werden über ihre IDs behandelt; ältere Skripte und Archive bleiben erhalten.

**Behoben**

- Beim Bearbeiten einer Bubble-Popup-Unterkarte konnte der ursprüngliche Dashboard-Speicheraufruf die Bibliotheksverwaltung durch das verborgene Popup ersetzen. Eigene native HA-Unterkartendialoge geben Änderungen jetzt an den eingebetteten Originaleditor zurück und verwenden den Dashboard-Speicheraufruf nicht.

**Entfernt**

Keine.

**Updatehinweise**

- Über HACS aktualisieren, HA neu starten, die bestehende Ressource auf /card_library/card-library.js?v=1.0.0 ändern und den Browser vollständig neu laden. Domain und Speicher card_library bleiben erhalten; Integrationseinträge und .storage nicht löschen.
- Eine bereits durch den früheren Fehler ersetzte Verwaltungskarte bei Bedarf erneut hinzufügen; fremde Dashboard-Konfigurationen werden nicht automatisch zurückgeschrieben. Vorladen ist zunächst ausgeschaltet.

**Bekannte Einschränkungen**

- Vorladen garantiert keine abgeschlossenen Netzabfragen oder sichtbarkeitsabhängige Initialisierung jeder Fremdkarte. Die Kompatibilitätsadapter prüfen Bubble-Fähigkeiten; bei fehlender Unterstützung erfolgt eine Meldung und Vorladen fällt auf Laden beim Öffnen zurück. Nicht sicher isolierbare Unterkarteneditoren werden gesperrt.
- HA-Dialoge, Kartenhelfer und Dashboard-Speicherung werden teilweise nachgebildet. Ein vollständiger Test auf einer realen HA-Installation mit allen Fremdkarten, Themes und Mobilgeräten wurde nicht durchgeführt.

**Prüfungen**

- Lokal: 620 JavaScript- und 181 Python-Tests; alle neun WebSocket-Schemas mit voluptuous und probatio; Versions-/Paketprüfung und reproduzierbares Installationsarchiv.
- Browsertests mit den originalen Bubble-Card-Dateien 3.2.0 und 3.4.2 prüfen den korrigierten Unterkartenspeicherweg sowie vorab aufgebaute, beim Öffnen/Schließen unverändert verbundene Popup-Inhalte.
- Die GitHub-Läufe für den neuen Commit werden erst beim Ausführen des Aktualisierungsskripts gestartet und vor der Veröffentlichung geprüft.

### English

**Added**

- Complete YAML export of central templates and saved hash variants, including current shared values, local exceptions, child cards, popup options and clipboard copying.
- Optional background preparation and retention of original Bubble popups per template; hash variants can inherit, enable or disable it.

**Changed**

- Selected popup instances stay connected outside the dashboard grid and receive HA state updates. Unchanged variants are reused; invalid or removed variants are cleaned up. Loading on open remains the default.
- The single updater applies source, verifies the baseline and publishes only after successful local and GitHub checks. Drafts and assets are handled by ID; older scripts and archives are preserved.

**Fixed**

- Editing a Bubble popup child could retain the original dashboard save callback and replace the library manager with the hidden popup. Separate native HA child dialogs now return changes to the embedded original editor without using the dashboard save callback.

**Removed**

None.

**Update notes**

- Update through HACS, restart HA, change the existing resource to /card_library/card-library.js?v=1.0.0 and fully reload the browser. The card_library domain and storage remain unchanged; do not delete integration entries or .storage.
- Re-add a manager card already replaced by the previous bug if needed; external dashboard configurations are not automatically rewritten. Preloading is initially disabled.

**Known limitations**

- Preloading cannot guarantee completed network requests or visibility-dependent initialization of every custom card. Compatibility adapters check Bubble capabilities; unsupported preloading reports an error and falls back to loading on open. Child editors that cannot be isolated safely are blocked.
- HA dialogs, card helpers and dashboard persistence are partly simulated. A full live HA test with all custom cards, themes and mobile devices has not been performed.

**Checks**

- Local checks: 620 JavaScript and 181 Python tests; all nine WebSocket schemas with voluptuous and probatio; version/package validation and a reproducible installation archive.
- Browser tests with original Bubble Card 3.2.0 and 3.4.2 files verify the corrected child-editor save path and prebuilt popup contents remaining connected through opening and closing.
- GitHub workflows for the new commit start when the updater runs and are verified before publication.

## [0.5.2]

### English 🇺🇸

- Import named Button Card templates, including static inheritance, and configure local entities and variables.
- Add template categories/search, defined input fields and template protection.
- Show saved uses, local exceptions and missing entities; open/edit, compare and duplicate linked cards and hash popups.
- Preview central changes and selectively restore one template from history.
- Improve original-editor stability, preview state updates, popup validation and save/import conflict handling.
- Index dashboard uses once and validate large libraries in HA workers to reduce repeated work and UI blocking.
- Include the approved colorful Library Card icon in 256 and 512 pixels. Native local branding requires HA 2026.3+.
- Harden archive building and publication checks. Keep native HA styling and the existing library storage domain.
- Update the resource to `/card_library/card-library.js?v=0.5.2` and reload the browser after restarting HA.

### Deutsch 🇩🇪

- Benannte Button-Card-Vorlagen einschließlich statischer Vererbung importieren; Entitäten und Variablen lokal einsetzen.
- Kategorien/Suche, definierte Eingabefelder und Vorlagenschutz ergänzen.
- Gespeicherte Verwendungen, lokale Ausnahmen und fehlende Entitäten anzeigen; verknüpfte Karten und Hash-Popups öffnen/bearbeiten, vergleichen und duplizieren.
- Zentrale Änderungen vorschauen und eine einzelne Vorlage gezielt aus dem Verlauf zurücknehmen.
- Originaleditoren stabilisieren, Vorschauen aktualisieren und Popup-, Speicher- und Importkonflikte korrekt prüfen.
- Dashboard-Verwendungen einmal indizieren und große Bibliotheken in HA-Workern validieren, um wiederholte Arbeit und UI-Blockaden zu reduzieren.
- Freigegebenes farbiges Library-Card-Logo in 256 und 512 Pixeln mitliefern. Native lokale Logo-Anzeige benötigt HA 2026.3+.
- Archivierung und Veröffentlichungsprüfungen verbessern; natives HA-Design und die bestehende Speicher-Domain erhalten.
- Ressource auf `/card_library/card-library.js?v=0.5.2` setzen und nach HA-Neustart den Browser neu laden.

## [0.5.1]

### English 🇺🇸

- Replace the library's calendar-inspired styling with Home Assistant controls and theme values.
- Use native buttons, text fields, dropdowns, checkboxes and expandable menus when available; retain compatible themed controls on older HA versions.
- Use native confirmation dialogs with guards against library changes while a dialog is open; show a native button for JSON imports.
- Preserve template inheritance, local exceptions, popup hashes and original card editors.
- Run all 163 existing UI scenarios with native control test doubles, plus five native component regressions.
- Update the resource to `/card_library/card-library.js?v=0.5.1` and reload your browser after installing.

### Deutsch 🇩🇪

- Kalender-inspirierte Bibliotheksgestaltung durch Home-Assistant-Bedienelemente und Theme-Werte ersetzen.
- Native Buttons, Textfelder, Dropdowns, Checkboxen und aufklappbare Menüs verwenden, soweit vorhanden; kompatible Theme-Bedienelemente für ältere HA-Versionen beibehalten.
- Native Bestätigungsdialoge gegen zwischenzeitliche Bibliotheksänderungen absichern; nativen Button für JSON-Importe anzeigen.
- Vorlagenverknüpfungen, örtliche Ausnahmen, Popup-Hashes und Originaleditoren erhalten.
- Alle 163 bestehenden UI-Abläufe zusätzlich mit nativen Testkomponenten und fünf gezielten Regressionstests prüfen.
- Nach Installation die Ressource auf `/card_library/card-library.js?v=0.5.1` setzen und den Browser neu laden.

## [0.5.0]

### English 🇺🇸

#### Added

- First public release of Library Card for Home Assistant.
- Central templates for built-in cards, installed custom cards, complete stacks and supported header/footer configurations.
- Original graphical card editors, direct YAML input and import of existing dashboard cards.
- Linked reuse: central template changes update every linked use while preserving local exceptions.
- Flexible inheritance of complete configurations, marked design fields or selected fields, with local entity and style overrides.
- Shared groups and person colors across multiple templates.
- Original Bubble Card popups opened through hash buttons without an extra dashboard card; multiple hash links with individual local settings.
- JSON library import/export, history, restoration and checks for known dashboard uses before deleting templates.
- Separate insertion and configuration workspaces, with German and English library UI.
- HACS/Hassfest validation workflows and JavaScript/Python regression tests.

#### Documentation

- Bilingual README with language navigation, HACS installation, template and popup guides, support links and technical components.
- Bilingual changelog and matching release notes.

#### Requirements

- Home Assistant 2024.7.0 or newer. Install custom cards and card-mod separately when used.
- Bubble popups require Bubble Card 3.2.0 or newer with standalone popup support.
- Existing library data retain the `card_library` domain and storage format. Resource: `/card_library/card-library.js?v=0.5.0`.

### Deutsch 🇩🇪

#### Hinzugefügt

- Erste öffentliche Veröffentlichung von Library Card für Home Assistant.
- Zentrale Vorlagen für HA-Karten, installierte Custom Cards, vollständige Stacks und unterstützte Kopf-/Fußzeilen.
- Originale grafische Karteneditoren, direkte YAML-Eingabe und Übernahme vorhandener Dashboard-Karten.
- Verknüpfte Verwendung: zentrale Änderungen aktualisieren alle Verwendungen; örtliche Ausnahmen bleiben erhalten.
- Flexible Übernahme vollständiger Konfigurationen, markierter Designfelder oder ausgewählter Felder mit örtlichen Entitäts- und Style-Ausnahmen.
- Gemeinsame Gruppen und Personenfarben für mehrere Vorlagen.
- Originale Bubble-Card-Popups über Hash-Buttons ohne zusätzliche Dashboard-Karte; mehrere Hash-Verknüpfungen mit eigenen örtlichen Einstellungen.
- JSON-Import/Export der Bibliothek, Verlauf, Wiederherstellung und Prüfung bekannter Dashboard-Verwendungen vor dem Löschen.
- Getrennte Arbeitsbereiche für Einsetzen und Konfiguration sowie deutsche und englische Bibliotheksoberfläche.
- HACS-/Hassfest-Prüfungen und JavaScript-/Python-Regressionstests.

#### Dokumentation

- Zweisprachige README mit Sprachwahl, HACS-Installation, Vorlagen- und Popup-Anleitungen, Unterstützung und technischen Komponenten.
- Zweisprachiges Changelog und dazu passende Release-Beschreibung.

#### Voraussetzungen

- Home Assistant ab 2024.7.0. Genutzte Custom Cards und card-mod separat installieren.
- Bubble-Popups benötigen Bubble Card ab 3.2.0 mit Standalone-Popup-Unterstützung.
- Bestehende Bibliotheksdaten behalten Domain und Speicherformat `card_library`. Ressource: `/card_library/card-library.js?v=0.5.0`.
