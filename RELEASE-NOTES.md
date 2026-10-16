# v1.1.0 – Vorhandene Button Cards übernehmen

Version: **1.1.0** · Datum / Date: **2026-10-16**

### Deutsch

Vorhandene Button Cards können mit einer vorhandenen Bibliotheksvorlage verknüpft werden: altes YAML einfügen, lokale Werte übernehmen und die neue Karte normal in Home Assistant speichern oder ihren Referenzcode kopieren.

**Hinzugefügt**

- Im Karteneditor einer Vorlagenkarte erscheint nach Auswahl einer Button-Card-Vorlage „Vorhandene Button Card übernehmen“. Der bisherige Kartenaufruf übernimmt Entitäten, Variablen und lokale Einstellungen, ohne eine weitere Bibliotheksvorlage anzulegen.
- „Neue Vorlagenkarte (YAML)“ zeigt den vollständigen Referenzcode; „Neuen YAML-Code kopieren“ übernimmt ihn in die Zwischenablage. Manuelles Kopieren bleibt möglich.

**Geändert**

- Explizite lokale Werte bleiben lokal, auch wenn sie aktuell dem Vorlagenwert entsprechen. Nicht angegebene Felder bleiben verknüpft; vorhandene ungenannte Ausnahmen und HA-Platzierung werden erhalten. Die Übernahme ändert nur den geöffneten Kartenentwurf; gespeichert wird über den normalen HA-Karteneditor.
- Das vollständige Aktualisierungsskript verwendet den veröffentlichten v1.0.0-Commit als Ausgangsstand und veröffentlicht v1.1.0 erst nach erfolgreichen lokalen und GitHub-Prüfungen.

**Behoben**

Keine.

**Entfernt**

Keine.

**Updatehinweise**

- Über HACS aktualisieren, Home Assistant neu starten, die bestehende Ressource auf /card_library/card-library.js?v=1.1.0 ändern und den Browser vollständig neu laden. Integrationseinträge und .storage erhalten; keine Datenmigration erforderlich.
- Im Dashboard eine neue Vorlagenkarte anlegen, die vorhandene Bibliotheksvorlage auswählen, den Bereich „Vorhandene Button Card übernehmen“ öffnen, altes Karten-YAML einfügen und „Für diese Karte übernehmen“ drücken. Danach die Karte normal speichern oder den neuen YAML-Code kopieren. Der bisherige Dashboard-Eintrag wird nicht automatisch entfernt.

**Bekannte Einschränkungen**

- Der Umwandler verarbeitet eine einzelne Button Card mit genau einem statischen Template-Namen oder eine vollständige einzelne Button Card ohne Template. Mehrere oder dynamische Template-Verweise sowie Konflikte mit zentralen Bindungen, einschließlich gebundener Platzierung, werden abgewiesen. Verschachtelte verbleibende Template-Verweise benötigen ihre Definitionen weiterhin im Dashboard.
- Lokal angepasste Listen und CSS werden als lokaler Stand gespeichert; spätere zentrale Änderungen an diesen Feldern werden dort nicht übernommen. Zentrale und lokale extra_styles-Beiträge mit JavaScript können nicht verlustfrei zusammengeführt werden und werden abgewiesen. Andere Felder bleiben verknüpft.
- Browserprüfungen verwenden teilweise nachgebildete HA-Schnittstellen. Ein vollständiger Test auf einer realen HA-Installation mit allen Fremdkarten, Themes und Mobilgeräten wurde nicht durchgeführt.

**Prüfungen**

- Lokal: 712 JavaScript- und 181 Python-Tests, darunter 46 Umwandlerprüfungen und jeweils 23 zusätzliche Prüfungen mit normalen und nativen HA-Bedienelementen; alle neun WebSocket-Schemas mit voluptuous und probatio; Syntax aller 14 Frontend-Module, Versions-/Paketprüfung und reproduzierbares Installationsarchiv.
- Browser mit originaler Button Card 7.0.1: Küchenfenster-Aufruf mit sieben Variablen; alter und neuer Anzeigename, Statuslabel und Rahmen stimmen überein; zentrale Änderungen erreichen die neue Karte; lokale Variablen bleiben erhalten; kopierter Referenzcode besteht den PyYAML-Roundtrip. Es entstehen keine weitere Vorlage und keine Bibliotheks- oder Dashboard-Schreibaufrufe.
- GitHub-HACS, Hassfest und Tests für den neuen Commit werden beim Ausführen des Aktualisierungsskripts abgewartet; sie wurden hier noch nicht für v1.1.0 ausgeführt.

### English

Existing Button Cards can be linked to an existing library template: paste the old YAML, import local values and save the new card normally in Home Assistant or copy its reference configuration.

**Added**

- After selecting a Button Card template, the template-card editor offers “Vorhandene Button Card übernehmen”. The previous card call imports entities, variables and local settings without creating another library template.
- “Neue Vorlagenkarte (YAML)” displays the complete reference configuration; “Neuen YAML-Code kopieren” copies it to the clipboard. Manual copying remains available.

**Changed**

- Explicit local values stay local even when currently equal to the template value. Omitted fields remain linked; existing unmentioned exceptions and HA placement are preserved. Import changes only the open card draft; the normal HA card editor saves it.
- The complete updater uses the published v1.0.0 commit as its baseline and publishes v1.1.0 only after successful local and GitHub checks.

**Fixed**

None.

**Removed**

None.

**Update notes**

- Update through HACS, restart Home Assistant, change the existing resource to /card_library/card-library.js?v=1.1.0 and fully reload the browser. Preserve integration entries and .storage; no data migration is required.
- Add a new template card to the dashboard, select the existing library template, open “Vorhandene Button Card übernehmen”, paste the old card YAML and press “Für diese Karte übernehmen”. Then save normally or copy the new reference YAML. The previous dashboard entry is not removed automatically.

**Known limitations**

- The converter handles one Button Card with exactly one static template name or one complete Button Card without a template. Multiple or dynamic references and conflicts with central bindings, including bound placement, are rejected. Remaining nested template references still need their definitions in the dashboard.
- Customized lists and CSS are stored as local snapshots; later central changes to those fields do not propagate there. Central and local extra_styles contributions involving JavaScript cannot be combined without loss and are rejected. Other fields remain linked.
- Browser checks use partly simulated HA interfaces. A complete live HA test with all custom cards, themes and mobile devices has not been performed.

**Checks**

- Local checks: 712 JavaScript and 181 Python tests, including 46 converter checks and 23 additional checks with both ordinary and native HA controls; all nine WebSocket schemas with voluptuous and probatio; syntax of all 14 frontend modules, version/package validation and a reproducible installation archive.
- Browser with original Button Card 7.0.1: seven-variable kitchen-window call; matching old and new display names, status labels and borders; central changes reach the new card; local variables are retained; copied reference YAML passes a PyYAML roundtrip. No additional template or library/dashboard write calls are created.
- GitHub HACS, Hassfest and tests for the new commit are awaited when running the updater; they have not yet run here for v1.1.0.

[Changelog v1.1.0](https://github.com/Baeka89/library-card/blob/v1.1.0/CHANGELOG.md#110--2026-10-16) · [Vergleich / Compare v1.0.0…v1.1.0](https://github.com/Baeka89/library-card/compare/v1.0.0...v1.1.0)
