# Prüfungen / Tests

## Deutsch

Lokal bestehen **801 Funktionstests: 620 JavaScript und 181 Python**. Darin sind native HA-Bedienelemente als Testkomponenten, YAML-Roundtrips mit PyYAML, Editorisolierung, Vorladevererbung und das eigenständige Aktualisierungsskript enthalten. Alle neun WebSocket-Schemas werden mit echten voluptuous- und probatio-Validatoren geprüft. Die lokale Paketprüfung umfasst Versionsreferenzen, Logo-PNGs und Archivinhalt.

Ausführen: `python3 -m pip install -r requirements-dev.txt`, `npm test`, `python3 -m unittest discover -s tests -p 'test_*.py' -v`, `python3 tests/check_websocket_schemas.py`, `python3 scripts/check_release.py --configured` und `python3 scripts/build_release.py`. Node.js ab 22 und Python ab 3.12 verwenden. Die Veröffentlichung richtet die Python-Abhängigkeiten in `.venv` ein.

Die zusätzlichen Browserregressionen `tests/browser_bubble_editor.cjs` und `tests/browser_bubble_preload.cjs` verwenden Playwright und die unveränderten Originaldateien `bubble-card-v3.2.0.js` und `bubble-card-v3.4.2.js`. `LIBRARY_BUBBLE_DIR` gibt deren tatsächlichen Ordner an; `LIBRARY_PLAYWRIGHT` und `LIBRARY_CHROMIUM` können vorhandene Laufzeitpfade angeben. Die Originaldateien stammen aus den entsprechenden Tags des offiziellen Clooos/Bubble-Card-Repositorys und sind keine ausgelieferten Projektquellen.

Geprüft wurden: Popup-Unterkarte bearbeiten, in die Vorlage zurückgeben und die äußere Verwaltungskarte unverändert speichern; Vorladen vor dem ersten Öffnen; Variantenwechsel A–zentral–A; Schließen/Wiederöffnen mit denselben verbundenen Unterkarten; ausdrücklich nicht vorzuladende Varianten; unveränderte Bibliotheksaktualisierungen; gezielte zentrale Änderung und Aufräumen beim Verlassen der Seite. Unit-Tests prüfen zusätzlich ungültige Pflichtwerte und HA-Verbindungswechsel.

HA-Dialoge, Kartenhelfer und Speicherung sind im Browser nachgebildet; die Bubble-Ausführung und Library-Module sind original. Das belegt keine vollständige Live-HA-, Geräte- oder Mobilprüfung. GitHub-HACS, Hassfest und Tests für v1.0.0 werden erst vom Aktualisierungsskript für den neuen Commit ausgeführt und abgewartet. Der historische Hassfest-/GitHub-Erfolg von v0.5.2 wird nicht als Prüfung von v1.0.0 ausgegeben.

## English

Local checks pass **801 functional tests: 620 JavaScript and 181 Python**. They include native HA control test doubles, PyYAML roundtrips, editor isolation, preload inheritance and the self-contained updater. All nine WebSocket schemas are checked with real voluptuous and probatio validators. Local package checks cover version references, logo PNGs and archive contents.

Run `python3 -m pip install -r requirements-dev.txt`, `npm test`, `python3 -m unittest discover -s tests -p 'test_*.py' -v`, `python3 tests/check_websocket_schemas.py`, `python3 scripts/check_release.py --configured` and `python3 scripts/build_release.py`. Use Node.js 22+ and Python 3.12+. Publication installs Python dependencies into `.venv`.

Additional browser regressions `tests/browser_bubble_editor.cjs` and `tests/browser_bubble_preload.cjs` use Playwright and unchanged original `bubble-card-v3.2.0.js` and `bubble-card-v3.4.2.js`. `LIBRARY_BUBBLE_DIR` specifies their actual directory; `LIBRARY_PLAYWRIGHT` and `LIBRARY_CHROMIUM` may specify existing runtimes. The files come from the corresponding tags of the official Clooos/Bubble-Card repository and are not distributed project source.

Checks cover editing a popup child, returning it to the template while preserving the outer manager card; preparing before first opening; A–central–A navigation; closing/reopening with the same connected children; explicitly lazy variants; unrelated library updates; selective central changes and cleanup on page exit. Unit tests additionally cover invalid required inputs and HA connection replacement.

HA dialogs, card helpers and persistence are simulated in the browser; Bubble execution and Library modules are original. This does not establish complete live HA, hardware or mobile compatibility. GitHub HACS, Hassfest and tests for v1.0.0 run and are awaited by the updater for the new commit. Historical Hassfest/GitHub success for v0.5.2 is not presented as validation of v1.0.0.
