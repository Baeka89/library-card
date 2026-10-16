# v1.0.0 – YAML-Ausgabe und vorbereitete Popups

Version 1.0.0 · 2026-10-15

Vollständige YAML-Ausgabe, wählbares Popup-Vorladen und geschützte Unterkartenbearbeitung.

Complete YAML export, optional popup preloading and isolated child-card editing.

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

[Changelog v1.0.0](https://github.com/Baeka89/library-card/blob/v1.0.0/CHANGELOG.md#100--2026-10-15) · [Vergleich / Compare](https://github.com/Baeka89/library-card/compare/v0.5.2...v1.0.0)
