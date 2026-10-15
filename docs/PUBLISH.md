# Library Card v0.5.2 veröffentlichen

Das einzelne Skript `publish_library_card_v0_5_2.py` enthält alle geprüften Quellen,
das Logo und die Dokumentation. Es wird außerhalb des Projektordners heruntergeladen.
Das bisher veröffentlichte v0.5.1 wird erhalten; alle freigegebenen lokalen Änderungen
werden gemeinsam als v0.5.2 veröffentlicht. Die früher vorbereiteten Zwischenstände
waren keine öffentlichen Releases und bleiben im getrennten Archivverzeichnis.

## Ausführen auf dem Ubuntu-PC

Voraussetzungen: Python 3.12+, Git, Node.js 22+ und mit Baeka89 angemeldete GitHub CLI.

```bash
python3 /home/ubuntu/Downloads/publish_library_card_v0_5_2.py
```

Projekt: `/home/ubuntu/Projekte/Projekt Library-Card`. Falls das Projekt noch
`library-card` heißt, erkennt das Skript diesen bisherigen Pfad und benennt den
Ordner um. Das getrennte Archivverzeichnis wird nicht verlegt oder überschrieben.

Abweichenden Projektpfad angeben:

```bash
python3 /home/ubuntu/Downloads/publish_library_card_v0_5_2.py --project-dir "/DEIN/PFAD/Projekt Library-Card"
```

Nur Paket, Anmeldung, Projektstand und Remote-Voraussetzungen prüfen (ohne lokale
Änderungen, Commits, Uploads oder Release):

```bash
python3 /home/ubuntu/Downloads/publish_library_card_v0_5_2.py --check-only
```

## Ablauf

1. Eingebettete Quellen/Prüfsumme, Versionen, Werkzeuge, GitHub-Konto und beide
   Remote-Adressen prüfen. Aktuellen main-Stand und vorhandene Ziel-Tags/Release prüfen.
2. Nur bekannte Ausgangsstände oder ein nachweislich zu diesem Skript gehörendes
   vorbereitetes Update übernehmen. Fremde lokale Änderungen stoppen den Ablauf.
3. Quellen, Version, README, Changelog und Icons übernehmen. Testabhängigkeiten in
   einer isolierten `.venv` installieren, alle Funktionstests und WebSocket-Schemas
   prüfen und das reproduzierbare Installationsarchiv erstellen.
4. Commit ohne Force-Push hochladen. HACS, Hassfest und Tests für genau diesen
   Commit vollständig erfolgreich abwarten.
5. Passenden Release-Tag erstellen/wiederverwenden. Release zunächst als Entwurf
   anlegen, Dateien hochladen und anhand ihrer tatsächlichen Prüfsummen kontrollieren.
6. Erst nach vollständiger erfolgreicher Prüfung als stabiles v0.5.2 veröffentlichen.
   Bestehende passende Releases werden wiederverwendet; nur fehlende Assets ergänzt.
7. Den bestehenden HACS-Antrag #11851 anzeigen. Es wird kein zweiter Antrag erstellt.

Nach Abbruch denselben Befehl erneut ausführen. Passende vorbereitete Dateien,
Commits, Tags und Release-Dateien werden geprüft und wiederverwendet; abweichende
Daten werden nicht überschrieben. Ein fehlerhafter Workflow verhindert das Release.

Fehlt auf Ubuntu `ensurepip`, das zur verwendeten Python-Version passende
`python3-venv`-Paket installieren und das Skript erneut starten. Eine unvollständige
vom Skript verwendete `.venv` wird ohne Löschen ihrer Daten erneut eingerichtet.

## Home Assistant aktualisieren

Nach erfolgreicher Veröffentlichung über HACS aktualisieren, HA neu starten,
Ressource auf `/card_library/card-library.js?v=0.5.2` setzen und Browser neu laden.
Das Skript hat keinen Zugriff auf deine HA-Instanz und führt diesen letzten Schritt
nicht selbst aus. Logo-Anzeige lokal ab HA 2026.3; Store-Anzeige vor Installation
hängt vom verwendeten Index und dessen Cache ab.

HACS-Aufnahme und Prüfdauer entscheidet das HACS-Team. Das bestehende Verfahren
bleibt erhalten: https://github.com/hacs/default/pull/11851.
