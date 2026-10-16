# Library Card for Home Assistant

<p align="center"><img src="custom_components/card_library/brand/icon@2x.png" alt="Library Card" width="160" height="160"></p>

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Baeka89&repository=library-card&category=integration)
[![Release](https://img.shields.io/github/v/release/Baeka89/library-card)](https://github.com/Baeka89/library-card/releases/latest)
[![Maintainer](https://img.shields.io/badge/Maintainer-Baeka89-blue.svg)](https://github.com/Baeka89)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/misomazo)

[Deutsch](#deutsch) | [English](#english)

<a id="deutsch"></a>
## Deutsch

### 1. Projekt und Kurzbeschreibung

Library Card verwaltet wiederverwendbare Dashboard-Karten zentral in Home Assistant. Diese README beschreibt den Funktionsumfang von **v1.1.0**. Karten auf Dashboards bleiben mit ihrer Vorlage verknüpft; lokale Ausnahmen ergänzen diese Vorlage.

### 2. Projektzweck und Funktionsumfang

Zentrale Änderungen erreichen alle verknüpften Verwendungen. Entitäten, Variablen, Layout, Styles, card-mod und Popup-Optionen können örtlich abweichen. Gemeinsame Einstellungen und Personenfarben bleiben zentral. Die Oberfläche trennt „Vorlagen einsetzen“ und „Konfiguration“ und verwendet native HA-Bedienelemente.

Unterstützt werden Originaleditoren, YAML-Import, JSON-Import/Export, benannte Button-Card-Templates mit statischer Vererbung, Kategorien/Suche, definierte Eingabefelder, Vorlagenschutz, bis zu zehn vorherige Speicherstände, gezielte Rücknahme und Änderungsvorschau. Verwendungen lassen sich ansehen, bearbeiten, vergleichen und duplizieren; die Übersicht nennt Fundstellen und fehlende Entitäten.

Der Button-Card-Umwandler übernimmt vorhandene Kartenaufrufe in eine ausgewählte, bestehende Bibliotheksvorlage. Das Ergebnis lässt sich im normalen HA-Karteneditor speichern oder als vollständiges Referenz-YAML kopieren. Dabei wird keine weitere Bibliotheksvorlage erstellt.

### 3. Systeme, Geräte und Voraussetzungen

Home Assistant **2024.7.0 oder neuer**. Native Karten, installierte Custom Cards sowie vollständige horizontal-stack-, vertical-stack- und grid-Konfigurationen sind verwendbar. Kopf-/Fußzeilen dürfen ein äußeres `card:` und numerisches `max_width:` enthalten. Genutzte Custom Cards und card-mod müssen separat installiert und geladen sein.

Hash-Popups benötigen die originale Bubble Card ab **3.2.0** mit eigenständigem Popup-Format. Editorisolierung und Vorladen wurden zusätzlich mit den Originaldateien von **3.2.0 und 3.4.2** im Browser geprüft. Andere Fremdkarten und Versionen benötigen gegebenenfalls eigene Prüfungen. Das unveränderte Logo wird von HA ab **2026.3** lokal unterstützt; Store-Anzeige vor Installation hängt auch von Index und Cache ab.

Der Umwandler benötigt eine vorhandene Bibliotheksvorlage vom Typ `custom:button-card`. Sein Kartenverhalten wurde zusätzlich mit der Originaldatei von Button Card **7.0.1** im Browser geprüft; Button Card bleibt separat erforderlich.

### 4. Installation

1. Falls das Repository in HACS nicht gefunden wird: HACS → benutzerdefinierte Repositories → `https://github.com/Baeka89/library-card`, Kategorie **Integration**. Eine Aufnahme in den HACS-Standard wird hier nicht behauptet.
2. Library Card über HACS herunterladen. Alternativ den vollständigen Ordner `custom_components/card_library` aus dem Installationsarchiv nach `/config/custom_components/card_library` kopieren.
3. Home Assistant neu starten.
4. Einstellungen → Geräte & Dienste → Integration hinzufügen → **Library Card**.
5. Unter Einstellungen → Dashboards → Ressourcen den bestehenden Eintrag auf `/card_library/card-library.js?v=1.1.0` ändern oder, wenn noch keiner existiert, als JavaScript-Modul hinzufügen. Keine doppelte Ressource anlegen. Erweiterter Modus im HA-Profil kann dafür erforderlich sein.
6. Browser vollständig neu laden. Die Karten **Kartenbibliothek** (`custom:library-manager`) und **Vorlagenkarte** (`custom:library-card`) sind anschließend verfügbar.

### 5. Einrichtung und Authentifizierung

Es werden die vorhandene HA-Anmeldung und deren Berechtigungen verwendet; zusätzliche Zugangsdaten sind nicht erforderlich. Schreibende Verwaltungsfunktionen benötigen Administratorrechte. Eine Verwaltungskarte im Dashboard dient der zentralen Pflege.

### 6. Konfiguration und Optionen

Vorlagen mit dem Originaleditor erstellen oder vorhandenes Karten-YAML übernehmen. Ganze Kartenbäume bleiben erhalten. Gruppen und Personenfarben können an Felder oder vollständige Bereiche gebunden werden. Eingabefelder unterstützen Entität, Text, Zahl, Schalter und Auswahl, einschließlich Pflichtfeldern und Entitätsdomänen. Geschützte Vorlagen müssen separat entsperrt und gespeichert werden.

**Popup laden:** je Vorlage „Beim Öffnen laden“ (Standard) oder „Im Hintergrund vorladen und bereithalten“. Gespeicherte Hash-Varianten können den Vorlagenwert übernehmen oder ausdrücklich vorladen bzw. erst beim Öffnen laden. Intern sind dies `template.preload` und optional `popup_links[].preload`; diese Bibliotheksmetadaten sind keine Bubble-Optionen. Vorladen gilt je Browser-Sitzung, benötigt zusätzlichen Speicher und hält die ausgewählten Originalkarten außerhalb des Dashboard-Rasters verbunden. Unveränderte Varianten werden weiterverwendet; Änderungen und ungültige Pflichtwerte werden berücksichtigt.

**YAML anzeigen / kopieren:** unter „Vorlagenaktionen“ die zentrale Vorlage oder eine gespeicherte Hash-Variante auswählen. Die vollständige Momentaufnahme enthält aktuelle gemeinsame Werte, örtliche Ausnahmen der gewählten Variante, Unterkarten, Popup-Optionen und fremde Konfigurationsfelder. Ein Textfeld ermöglicht manuelles Kopieren, wenn die Zwischenablage nicht verfügbar ist. Kopieren ändert keine Verknüpfung. Zentrale Kopf-/Fußzeilen werden wieder als äußeres `card:`/`max_width:` ausgegeben; innerhalb eines Popups kann der vorhandene Container-Adapter zur Erhaltung der Breite nötig bleiben.

**Vorhandene Button Card übernehmen:** genau einen festen `template`-Namen, auch als Liste mit einem Eintrag, oder eine vollständige einzelne Button Card ohne `template` einfügen. Die im Editor ausgewählte Bibliotheksvorlage bestimmt das Ziel. Explizit eingefügte Variablen bleiben lokale Werte, auch wenn sie derzeit mit der Vorlage übereinstimmen. Fehlende Felder erben weiter; vorhandene lokale Ausnahmen bleiben erhalten, soweit die Eingabe sie nicht ausdrücklich ersetzt. HA-Platzierungsfelder bleiben außen an der Referenzkarte. Details: [Button-Card-Vorlagen](docs/BUTTON-TEMPLATES.md).

### 7. Verwendung

„Diese Vorlage verwenden“ erstellt eine Bibliotheksreferenz. Lokale Entitäten, Variablen, Designfelder, CSS und card-mod können anschließend angepasst werden. YAML zum Einbauen sowie Buttons erzeugt die Oberfläche für die ausgewählte Vorlage.

Die Übernahme läuft so ab:

1. Im HA-Dashboard eine neue Karte anlegen und **Vorlagenkarte** wählen.
2. Die gewünschte vorhandene Button-Card-Vorlage auswählen.
3. **„Vorhandene Button Card übernehmen“** öffnen und unter **„Bisherige Kartenkonfiguration (YAML)“** den alten Kartenaufruf einfügen.
4. **„Für diese Karte übernehmen“** drücken und die Werte prüfen.
5. Die Karte regulär in Home Assistant speichern. Alternativ **„Neuen YAML-Code kopieren“** verwenden und den vollständigen Code an der gewünschten Dashboardstelle einsetzen.

Der Umwandler prüft das YAML über den vorhandenen Parser und ändert nur die lokale Konfiguration im geöffneten Karteneditor. Er speichert weder die zentrale Bibliothek noch das Dashboard direkt; das Dashboard wird erst durch den normalen HA-Speichervorgang geändert.

Für ein Popup genügt ein Navigationsbutton zum gespeicherten Hash. Es sind weder eine zusätzliche Popup-Karte noch ein Platzhalter im Raster erforderlich. Ein eigenständiges Bubble-Popup mit `cards:`, ein klassischer vertical-stack mit Popup-Kopf oder eine normale Karte können als Inhalt dienen. Mehrere Hash-Varianten verweisen auf dieselbe Vorlage; alle Buttons mit demselben Hash teilen dieselbe gespeicherte Variante. Direkte `fire-dom-event`-Aufrufe mit `card_library` bleiben möglich.

Beim Bearbeiten von Bubble-Unterkarten verwendet die Bibliothek einen eigenen nativen HA-Dialog mit eigenem Speicheraufruf. Änderungen werden an den eingebetteten Originaleditor zurückgegeben und anschließend nach dem bestehenden Ablauf gespeichert. Die Dashboardposition der Verwaltungskarte ist dadurch kein Speicherziel der Popup-Unterkarte.

UI-Dashboards werden über Lovelace-Schnittstellen mit Fingerprint- und Revisionsprüfung geändert. Für YAML-Dashboards wird die Konfiguration zum manuellen Übernehmen ausgegeben. Die Nutzungsübersicht zählt gespeicherte Verknüpfungen und statisch erkennbare Popup-Aufrufe; sie ist keine Klickstatistik.

### 8. Aktualisierung und Migration

Über HACS aktualisieren, HA neu starten, die bestehende Ressource auf `/card_library/card-library.js?v=1.1.0` ändern und Browser vollständig neu laden. Domain und Bibliotheksspeicher bleiben `card_library`; Integrationseinträge und `.storage` nicht löschen. Es ist keine Datenmigration erforderlich. Bereits durch den früheren Fehler ersetzte Dashboardkarten werden nicht automatisch zurückgeschrieben; die Verwaltungskarte bei Bedarf wieder hinzufügen.

Das Aktualisierungsskript bereitet **v1.1.0** vor und veröffentlicht erst nach erfolgreichen lokalen und GitHub-Prüfungen.

Für die Veröffentlichung auf dem Ubuntu-PC dient **ein vollständiges Aktualisierungsskript** mit eingebetteten Quellen. Es aktualisiert `/home/ubuntu/Projekte/Projekt Library-Card`, führt Prüfungen durch, lädt den Commit hoch, wartet auf HACS/Hassfest/Tests und erstellt erst danach das Release. Unbekannte lokale Änderungen und abweichende Tags/Dateien stoppen den Ablauf. Einzelheiten: [Veröffentlichung](docs/PUBLISH.md).

### 9. Einschränkungen und Fehlerbehebung

Nicht jede Fremdkarte besitzt einen grafischen Editor. Vorladen garantiert keine abgeschlossenen Netzabfragen und kann sichtbarkeitsabhängige Initialisierung einer Unterkarte nicht erzwingen. Dynamische JavaScript-/Jinja-Aufrufe lassen sich nicht vollständig statisch erfassen. Die Bubble-Kompatibilitätsadapter sind an vorhandene Fähigkeiten gebunden; bei inkompatiblen Versionen gibt es eine Meldung und Vorladen fällt auf Laden beim Öffnen zurück. Ein nicht sicher isolierbarer Unterkarteneditor wird gesperrt.

Der Umwandler weist mehrere oder dynamische `template`-Verweise sowie Konflikte mit zentralen Bindungen zurück. Das gilt auch für gebundene Platzierungsfelder. Lokal angepasste Listen und `extra_styles` werden als örtlicher Stand gespeichert; spätere zentrale Änderungen an genau diesen Feldern kommen dort nicht an. Bei zentralen und lokalen `extra_styles`-Beiträgen mit JavaScript wird die Übernahme abgewiesen, da getrennte Auswertungen nicht verlustfrei kombiniert werden können. Verschachtelte, noch vorhandene Template-Verweise benötigen ihre Definitionen weiterhin im Dashboard. Hinweise in der Oberfläche erläutern solche Grenzen.

Bei alten Ansichten Ressourcenversion und Browsercache prüfen. Bei fehlenden Karten zuerst Fremdressourcen und Entitäten prüfen. Der Teststand verwendet teilweise nachgebildete HA-Schnittstellen; ein vollständiger Test auf einer realen HA-Installation mit allen Themes und Mobilgeräten ist nicht erfolgt.

### 10. Entwicklung und Tests

Für lokale Entwicklungs-/Veröffentlichungsprüfungen: Python ab 3.12, Node.js ab 22 und `requirements-dev.txt`. Lokal bestehen **893 Funktionstests: 712 JavaScript und 181 Python**, darunter 92 zusätzliche JavaScript-Prüfungen für den Umwandler. Alle neun WebSocket-Schemas werden mit voluptuous und probatio geprüft. Browserregressionen verwenden originale Bubble- und Button-Card-Dateien und teilweise nachgebildete HA-Dialog-/Speicherschnittstellen. GitHub-Prüfungen für v1.1.0 werden beim Ausführen des Aktualisierungsskripts für den neuen Commit abgewartet. Details, Aufrufe und Grenzen: [Prüfungen](docs/TESTS.md).

### 11. Versionshistorie

[CHANGELOG.md](CHANGELOG.md) und [GitHub-Releases](https://github.com/Baeka89/library-card/releases). Die Einträge beschreiben veröffentlichte Stände; lokale Prüfrunden erhalten keine eigene Version.

### 12. Unterstützung, Mitwirkung, Danksagung und Lizenz

Fehler mit Versionen und nachvollziehbarem Ablauf als [Issue](https://github.com/Baeka89/library-card/issues) melden. Beiträge sind per Pull Request willkommen; siehe [CONTRIBUTING.md](CONTRIBUTING.md). Danke an Home Assistant, HACS und die Entwickler der unterstützten Originalkarten, insbesondere Bubble Card. Unterstützung ist über [PayPal](https://paypal.me/misomazo) möglich. Lizenz: [MIT](LICENSE).

<a id="english"></a>
## English

### 1. Project and short description

Library Card centrally manages reusable dashboard cards in Home Assistant. This README describes the features of **v1.1.0**. Dashboard cards stay linked to their template; local exceptions supplement that template.

### 2. Purpose and features

Central changes reach every linked use. Entities, variables, layout, styles, card-mod and popup options may differ locally. Shared settings and person colors remain central. The interface separates insertion from configuration and uses native HA controls.

Features include original card editors, YAML input, JSON import/export, named Button Card templates with static inheritance, categories/search, defined inputs, template protection, up to ten previous saved states, individual restoration and change previews. Uses can be inspected, edited, compared and duplicated; the overview shows locations and missing entities.

The Button Card converter maps existing card calls to a selected, existing library template. Save the result through the normal HA card editor or copy the complete reference YAML. No additional library template is created.

### 3. Systems, devices and prerequisites

Home Assistant **2024.7.0 or newer**. Built-in cards, installed custom cards and complete horizontal-stack, vertical-stack and grid configurations are supported. Header/footer configurations may contain an outer `card:` and numeric `max_width:`. Install and load any custom cards and card-mod separately.

Hash popups require original Bubble Card **3.2.0 or newer** with standalone popups. Editor isolation and preloading were additionally checked in a browser with original **3.2.0 and 3.4.2** files. Other third-party cards and versions may require their own checks. HA **2026.3+** supports the unchanged local logo; store visibility before installation also depends on index and cache.

The converter requires an existing library template of type `custom:button-card`. Card behavior was additionally checked in a browser with the original Button Card **7.0.1** file; Button Card remains a separate prerequisite.

### 4. Installation

1. If HACS does not find the repository: add `https://github.com/Baeka89/library-card` as a custom repository, category **Integration**. Inclusion in the HACS default catalog is not claimed here.
2. Download Library Card through HACS. Alternatively copy the entire `custom_components/card_library` directory from the installation archive to `/config/custom_components/card_library`.
3. Restart Home Assistant.
4. Settings → Devices & services → Add integration → **Library Card**.
5. Under Settings → Dashboards → Resources, update the existing entry to `/card_library/card-library.js?v=1.1.0`, or add it as a JavaScript module if absent. Avoid duplicate resources. Advanced mode in the HA profile may be required.
6. Fully reload the browser. **Kartenbibliothek** (`custom:library-manager`) and **Vorlagenkarte** (`custom:library-card`) are then available.

### 5. Setup and authentication

The integration uses the existing HA login and permissions; no additional credentials are required. Administrative writes require administrator rights. A manager card on the dashboard provides central management.

### 6. Configuration and options

Create templates with their original editor or import existing card YAML. Complete card trees are preserved. Bind groups and person colors to individual fields or whole sections. Inputs support entity, text, number, boolean and selection, including required fields and entity domains. Protected templates must first be unlocked and saved separately.

**Popup loading:** choose loading when opened (default) or background preload and retention per template. Saved hash variants can inherit this choice or explicitly enable or disable preloading. Internally these are `template.preload` and optional `popup_links[].preload`; they are library metadata, not Bubble options. Preloading is per browser session, consumes additional memory and keeps selected original cards connected outside the dashboard grid. Unchanged variants are reused; changes and invalid required inputs are respected.

**Show / copy YAML:** under template actions, choose the central template or a saved hash variant. The complete snapshot contains current shared values, that variant's local exceptions, child cards, popup options and third-party configuration fields. A text field permits manual copying when clipboard access is unavailable. Copying does not change links. Central header/footer exports restore the outer `card:`/`max_width:` structure; popup content may retain the existing container adapter to preserve width.

**Import an existing Button Card:** paste exactly one fixed `template` name, including a one-entry list, or a complete individual Button Card without `template`. The library template selected in the editor determines the target. Explicitly supplied variables remain local values even when currently equal to the template. Missing fields keep inheriting; existing local exceptions remain unless the input explicitly replaces them. HA placement fields stay on the outer reference card. Details: [Button Card templates](docs/BUTTON-TEMPLATES.md).

### 7. Usage

Using a template creates a library reference. Local entities, variables, design fields, CSS and card-mod can then be adjusted. The interface generates insertion YAML and buttons for the selected template.

The converter workflow is:

1. Add a new card to the HA dashboard and choose **Vorlagenkarte**.
2. Select the desired existing Button Card template.
3. Open **“Vorhandene Button Card übernehmen”** and paste the old card call into **“Bisherige Kartenkonfiguration (YAML)”**.
4. Press **“Für diese Karte übernehmen”** and check the values.
5. Save the card normally in Home Assistant. Alternatively use **“Neuen YAML-Code kopieren”** and insert the complete configuration at the desired dashboard location.

The converter validates YAML through the existing parser and changes only the local configuration in the open card editor. It does not directly save the central library or dashboard; the normal HA save operation commits the dashboard change.

A navigation button targeting the saved hash is sufficient for a popup. No extra popup card or grid placeholder is required. Standalone Bubble popups with `cards:`, classic vertical stacks with a popup header and ordinary cards can provide content. Multiple hash variants can reference one template; all buttons with the same hash share that saved variant. Explicit `fire-dom-event` calls with `card_library` remain available.

Bubble child-card editing uses a separate native HA dialog with its own save callback. Changes return to the embedded original editor and are saved through the existing workflow. The manager card's dashboard position is therefore not a save destination for the popup child.

UI dashboards are changed through Lovelace interfaces with fingerprint and revision checks. YAML dashboard configurations are exported for manual application. Usage counts cover saved links and statically recognizable popup calls; they are not click statistics.

### 8. Updating and migration

Update through HACS, restart HA, change the existing resource to `/card_library/card-library.js?v=1.1.0` and fully reload the browser. The domain and library storage remain `card_library`; do not delete integration entries or `.storage`. No data migration is required. Dashboard cards already replaced by the earlier bug are not automatically rewritten; re-add the manager card if needed.

The updater prepares **v1.1.0** and publishes only after successful local and GitHub checks.

For publication on Ubuntu, use **one complete updater script** with embedded source. It updates `/home/ubuntu/Projekte/Projekt Library-Card`, runs checks, uploads the commit, waits for HACS/Hassfest/tests and only then creates the release. Unknown local edits and divergent tags/assets stop the process. Details: [Publication](docs/PUBLISH.md).

### 9. Limitations and troubleshooting

Not every custom card has a graphical editor. Preloading does not guarantee completed network requests and cannot force a child's visibility-dependent initialization. Dynamic JavaScript/Jinja calls cannot be fully recognized statically. Bubble compatibility adapters check existing capabilities; incompatible versions produce a message and preloading falls back to loading on open. Child-card editors that cannot be isolated safely are blocked.

The converter rejects multiple or dynamic `template` references and conflicts with central bindings, including bound placement fields. Locally customized lists and `extra_styles` are stored as local snapshots; subsequent central changes to those specific fields do not propagate there. Central and local `extra_styles` contributions involving JavaScript are rejected because separate evaluations cannot be combined without loss. Remaining nested template references still need their definitions in the dashboard. Messages in the interface explain these limits.

For stale views, check resource version and browser cache. For missing cards, check third-party resources and entities first. Some tests use simulated HA interfaces; a complete live HA test with all themes and mobile devices has not been performed.

### 10. Development and tests

Local development/publication checks require Python 3.12+, Node.js 22+ and `requirements-dev.txt`. Local checks pass **893 functional tests: 712 JavaScript and 181 Python**, including 92 additional JavaScript checks for the converter. All nine WebSocket schemas are checked with voluptuous and probatio. Browser regressions use original Bubble and Button Card files with partially simulated HA dialog/storage interfaces. The updater waits for GitHub validation of the new v1.1.0 commit. Details, commands and limits: [Tests](docs/TESTS.md).

### 11. Version history

See [CHANGELOG.md](CHANGELOG.md) and [GitHub releases](https://github.com/Baeka89/library-card/releases). Entries describe published versions; local verification rounds receive no separate version.

### 12. Support, contributions, acknowledgements and license

Report issues with versions and a reproducible sequence through [GitHub issues](https://github.com/Baeka89/library-card/issues). Pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Thanks to Home Assistant, HACS and the developers of the supported original cards, particularly Bubble Card. Support via [PayPal](https://paypal.me/misomazo). License: [MIT](LICENSE).
