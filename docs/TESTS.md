# Prüfungen der öffentlichen Version v0.5.0

Die öffentliche Version enthält den vollständigen bisherigen Funktionsstand,
einschließlich mehrerer Popup-Hashes mit lokalen Ausnahmen. Die interne
Versionsfolge wird nicht als frühere öffentliche GitHub-Releases dargestellt.

444 Tests bestehen: 340 JavaScript- und 104 Python-Tests, davon 22 für die Veröffentlichung.

JavaScript prüft Core/Vererbung, Tools, Originaleditoren, Ressourcen und
Popup-Lebenszyklus. Python prüft Speicherung, History, YAML, Modell und
Browser-/Backend-Parität. Zusätzliche Publication-Tests prüfen Reihenfolge,
Fehlerabbruch, Namens-/Pfadsicherheit, Wiederholung, HACS-Sortierung,
Checklistenänderungen, genaue Commit-Prüfung und übersprungene CI-Jobs.

```bash
python -m pip install -r requirements-dev.txt
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/check_websocket_schemas.py
python scripts/check_release.py
python scripts/build_release.py
```

`--configured` bei `check_release.py` verlangt die tatsächliche GitHub-Identität.
Diese setzt `publish.py` vor der Veröffentlichung.

Echtes Hassfest wurde im offiziellen Container lokal ausgeführt, ohne
ausgeschaltete Prüfungen. GitHub führt zusätzlich HACS, Hassfest und Tests aus.
Rohprotokolle und genaue Ergebnisse: [VERIFICATION.txt](VERIFICATION.txt).

UI, Kartenfactories und HA-Verbindungen in den Funktionstests sind Testdoubles.
Ein neuer automatisierter Live-HA-/Browser-Test wurde nicht durchgeführt.
Beliebige installierte Custom Cards, CSS, Animationen und Mobil-App-Verhalten
benötigen Tests vor Ort.
