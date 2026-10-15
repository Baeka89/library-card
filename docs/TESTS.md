# Prüfungen des lokalen Entwicklungsstands

742 Funktionstests: 590 JavaScript- und 152 Python-Tests. Die UI-Suite läuft
mit Browser-Bedienelementen und zusätzlich mit nativen HA-Testkomponenten.

Neue Tests prüfen Eingabefelder/Pflichtwerte, Kategorien, Schutz beim Import
und Speichern, separate Entsperrung, gezielte Rücknahme, lokale Bearbeitung,
Platzierung/card-mod, Vergleich, Kopien, eigene Popup-Hashes, unvollständige
Schreibvorgänge, Administratorrechte, YAML-Lesemodus und Konflikte.

Alle neun WebSocket-Schemas bestehen mit echtem voluptuous und probatio.
Der offizielle Hassfest-Container meldet null ungültige Integrationen.

```bash
python -m pip install -r requirements-dev.txt
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/check_websocket_schemas.py
python scripts/check_release.py --configured
python scripts/build_release.py
```

UI/Karten und Dashboard-Speicher sind in Funktionstests Testdoubles. Ein Live-HA-
Browserlauf wurde nicht durchgeführt. Konkrete Custom Cards, Themes, mobile
Darstellung und native Lovelace-Persistenz müssen vor Ort geprüft werden.
Es besteht keine Transaktionsgarantie gegenüber externen Dashboard-Editoren
oder zwischen Hash-Bibliothek und Dashboard. Details: [Arbeitsabläufe](WORKFLOWS.md).

Vertiefte Prüfung und Geschwindigkeitsmessungen: [Audit des lokalen Stands](AUDIT-LOCAL.md).
Die Prüfungen erzeugen kein Release. Der geprüfte Stand wird anschließend für v0.5.2 vorbereitet.
