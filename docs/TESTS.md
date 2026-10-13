# Prüfungen der Version v0.5.1

612 Tests bestehen: 508 JavaScript- und 104 Python-Tests. Die 163 bisherigen
UI-Abläufe laufen sowohl mit Browser-Bedienelementen als auch mit nativen
HA-Testkomponenten. Fünf weitere Tests prüfen die konkreten Komponenten,
Dropdown-Ereignisse alter/neuer HA-Versionen, verzögertes Laden und Dialoge.

```bash
python -m pip install -r requirements-dev.txt
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/check_websocket_schemas.py
python scripts/check_release.py --configured
python scripts/build_release.py
```

Der Lauf nutzt Testdoubles für HA-Komponenten und Verbindungen. Eine visuelle
Prüfung in einer laufenden Home-Assistant-Instanz ist in dieser Umgebung nicht
möglich. Theme, mobile Darstellung und Custom Cards müssen vor Ort geprüft werden.

GitHub führt zusätzlich HACS, Hassfest und Tests für den veröffentlichten Commit
aus. Der Update-Ablauf veröffentlicht erst nach erfolgreichen Prüfungen.
