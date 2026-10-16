# Prüfungen / Tests

[Deutsch](#deutsch) | [English](#english)

<a id="deutsch"></a>
## Deutsch

### 1. Lokaler Prüfstand

Lokal bestehen **893 Funktionstests: 712 JavaScript und 181 Python**. Gegenüber v1.0.0 ergänzt der Button-Card-Umwandler **92 JavaScript-Prüfungen: 46 reine Umwandlertests, 23 UI-Tests und dieselben 23 Tests mit nativen HA-Bedienelementen**. Sie prüfen unter anderem sieben Beispielvariablen, Vererbung, lokale Ausnahmen, Platzierung, Kopieren, Bindungskonflikte, Fehler und veraltete asynchrone Ergebnisse.

Die übrigen Prüfungen enthalten native HA-Bedienelemente als Testkomponenten, YAML-Roundtrips mit PyYAML, Editorisolierung, Vorladevererbung und das eigenständige Aktualisierungsskript für v1.1.0. Alle neun WebSocket-Schemas werden mit echten voluptuous- und probatio-Validatoren geprüft. Die lokale Paketprüfung umfasst Versionsreferenzen, Logo-PNGs und Archivinhalt. Die vorbereitete Zielversion ist v1.1.0.

### 2. Funktionstests ausführen

Node.js ab 22 und Python ab 3.12 mit den Abhängigkeiten aus `requirements-dev.txt` verwenden:

- `python3 -m pip install -r requirements-dev.txt`
- `npm test`
- `python3 -m unittest discover -s tests -p 'test_*.py' -v`
- `python3 tests/check_websocket_schemas.py`
- `python3 scripts/check_release.py --configured`
- `python3 scripts/build_release.py`

Der Veröffentlichungsablauf richtet die Python-Abhängigkeiten in `.venv` ein. Der Build prüft ein lokales Paket; er veröffentlicht es nicht.

### 3. Bubble-Browserregressionen

`tests/browser_bubble_editor.cjs` und `tests/browser_bubble_preload.cjs` verwenden Playwright und die unveränderten Originaldateien `bubble-card-v3.2.0.js` und `bubble-card-v3.4.2.js`. `LIBRARY_BUBBLE_DIR` gibt deren tatsächlichen Ordner an; `LIBRARY_PLAYWRIGHT` und `LIBRARY_CHROMIUM` können vorhandene Laufzeitpfade angeben. Die Originaldateien stammen aus den entsprechenden Tags des offiziellen Clooos/Bubble-Card-Repositorys und sind keine ausgelieferten Projektquellen. Mit `node tests/browser_bubble_editor.cjs` beziehungsweise `node tests/browser_bubble_preload.cjs` ausführen.

Geprüft wurden: Popup-Unterkarte bearbeiten, in die Vorlage zurückgeben und die äußere Verwaltungskarte unverändert speichern; Vorladen vor dem ersten Öffnen; Variantenwechsel A–zentral–A; Schließen/Wiederöffnen mit denselben verbundenen Unterkarten; ausdrücklich nicht vorzuladende Varianten; unveränderte Bibliotheksaktualisierungen; gezielte zentrale Änderung und Aufräumen beim Verlassen der Seite. Unit-Tests prüfen zusätzlich ungültige Pflichtwerte und HA-Verbindungswechsel.

### 4. Button-Card-Browserregression

`tests/browser_button_converter.cjs` verwendet originale Button Card **7.0.1**, die vollständige Rollladen-Testvorlage in `tests/fixtures/button-card-shutter.json`, die Library-Module und Playwright. `LIBRARY_BUTTON_CARD` muss auf die **tatsächliche Originaldatei `button-card.js`** zeigen. Optional geben `LIBRARY_PLAYWRIGHT` und `LIBRARY_CHROMIUM` vorhandene Laufzeitpfade an; `PYTHON` wählt einen Python-Interpreter mit PyYAML. Danach `node tests/browser_button_converter.cjs` ausführen. Die externe Button-Card-Datei ist keine ausgelieferte Projektquelle.

Der Test legt eine neue Vorlagenkarte an, wählt die vorhandene Rollladenvorlage, fügt den bisherigen YAML-Aufruf mit sieben Variablen ein und übernimmt ihn über den tatsächlichen Umwandler. Das Eingabe-YAML und der kopierte Referenzcode werden durch PyYAML gelesen. Die originale Button Card führt die JavaScript-Ausdrücke der Testvorlage aus. Verglichen werden alter und neuer Kartenaufruf: Anzeigename, Statuslabel und Rahmenfarbe stimmen überein. Eine anschließende zentrale Namensänderung erreicht die neue Karte, während alle sieben örtlichen Variablen erhalten bleiben.

Zusätzlich werden der kopierte Referenzcode, genau ein Parseraufruf, kein schreibender Serviceaufruf und weiterhin genau eine Bibliotheksvorlage geprüft. Die Auswahl der Vorlage und die anschließende Übernahme lösen jeweils einen lokalen Konfigurationsänderungs-Event aus; die Übernahme selbst löst genau einen aus.

### 5. Grenzen und GitHub-Stand

HA-Dialoge, Kartenhelfer, Anmeldung und Speicherung sind in den Browserprüfungen teilweise nachgebildet; Bubble-/Button-Card-Ausführung und Library-Module sind original. Der YAML-Eingang und der kopierte Referenzcode des Umwandlertests werden mit PyYAML geprüft, der vollständige Home-Assistant-WebSocket-Server wird dafür nicht gestartet. Diese Prüfungen belegen keine vollständige Live-HA-, Geräte-, Theme- oder Mobilkompatibilität.

**v1.0.0 ist seit 16.10.2026 veröffentlicht.** Für die zusätzlichen lokalen Umwandleränderungen wurden noch keine neuen GitHub-HACS-, Hassfest- oder Testläufe ausgeführt. Bereits veröffentlichte Stände und lokale Erfolge werden nicht als entfernte Prüfung dieser Erweiterung ausgegeben. Das neue Aktualisierungsskript wartet diese Läufe für den v1.1.0-Commit ab, bevor es veröffentlicht.

<a id="english"></a>
## English

### 1. Local verification status

Local checks pass **893 functional tests: 712 JavaScript and 181 Python**. Compared with v1.0.0, the Button Card converter adds **92 JavaScript checks: 46 pure conversion tests, 23 UI tests and the same 23 tests with native HA controls**. They cover the seven example variables, inheritance, local exceptions, placement, copying, binding conflicts, errors and stale asynchronous results.

Other checks include native HA control test doubles, PyYAML roundtrips, editor isolation, preload inheritance and the self-contained v1.1.0 updater. All nine WebSocket schemas are checked with real voluptuous and probatio validators. Local package checks cover version references, logo PNGs and archive contents. The prepared target version is v1.1.0.

### 2. Run functional tests

Use Node.js 22+ and Python 3.12+ with the dependencies in `requirements-dev.txt`:

- `python3 -m pip install -r requirements-dev.txt`
- `npm test`
- `python3 -m unittest discover -s tests -p 'test_*.py' -v`
- `python3 tests/check_websocket_schemas.py`
- `python3 scripts/check_release.py --configured`
- `python3 scripts/build_release.py`

The publication workflow installs Python dependencies into `.venv`. Building checks a local package; it does not publish it.

### 3. Bubble browser regressions

`tests/browser_bubble_editor.cjs` and `tests/browser_bubble_preload.cjs` use Playwright and unchanged original `bubble-card-v3.2.0.js` and `bubble-card-v3.4.2.js`. `LIBRARY_BUBBLE_DIR` specifies their actual directory; `LIBRARY_PLAYWRIGHT` and `LIBRARY_CHROMIUM` may specify existing runtimes. The files come from the corresponding tags of the official Clooos/Bubble-Card repository and are not distributed project source. Run `node tests/browser_bubble_editor.cjs` and `node tests/browser_bubble_preload.cjs` respectively.

Checks cover editing a popup child, returning it to the template while preserving the outer manager card; preparing before first opening; A–central–A navigation; closing/reopening with the same connected children; explicitly lazy variants; unrelated library updates; selective central changes and cleanup on page exit. Unit tests additionally cover invalid required inputs and HA connection replacement.

### 4. Button Card browser regression

`tests/browser_button_converter.cjs` uses original Button Card **7.0.1**, the complete shutter test template in `tests/fixtures/button-card-shutter.json`, the Library modules and Playwright. Set `LIBRARY_BUTTON_CARD` to the **actual original `button-card.js` file**. Optionally specify existing runtimes with `LIBRARY_PLAYWRIGHT` and `LIBRARY_CHROMIUM`; `PYTHON` selects a Python interpreter with PyYAML. Then run `node tests/browser_button_converter.cjs`. The external Button Card file is not distributed project source.

The test creates a new template card, selects the existing shutter template, pastes the previous YAML call with seven variables and imports it through the actual converter. PyYAML parses both the input and the copied reference configuration. Original Button Card executes the test template's JavaScript expressions. The old and new card calls produce matching display names, status labels and border colors. A subsequent central name change reaches the new card while preserving all seven local variables.

It also checks copied reference YAML, exactly one parser call, no writing service call and exactly one remaining library template. Template selection and the subsequent import each emit one local configuration-change event; importing itself emits exactly one.

### 5. Limits and GitHub status

HA dialogs, card helpers, authentication and persistence are partially simulated in browser checks; Bubble/Button Card execution and Library modules are original. The converter test's YAML input and copied reference configuration are checked with PyYAML without starting the complete Home Assistant WebSocket server. These checks do not establish complete live HA, hardware, theme or mobile compatibility.

**v1.0.0 has been published since 2026-10-16.** No new GitHub HACS, Hassfest or test runs cover the additional local converter changes yet. Published versions and local successes are not presented as remote validation of this extension. The new updater waits for these workflows for the v1.1.0 commit before publishing.
