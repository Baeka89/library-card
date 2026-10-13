# v0.5.1 veröffentlichen und bei HACS einreichen

Das vollständige Quellpaket entpacken. `publish.py` benötigt die anderen
Projektdateien und ist kein eigenständiger Installer ohne Quellcode.
Der gewählte Zielordner wird automatisch angelegt. Er muss leer sein oder aus
einem vorherigen Start dieses Skripts stammen; fremde Projekte werden nicht überschrieben.

## Einmalige Voraussetzungen

- Python 3.12 oder neuer: https://www.python.org/downloads/
- Git: https://git-scm.com/downloads
- Node.js 22: https://nodejs.org/
- GitHub CLI: https://cli.github.com/
- Eigenes persönliches GitHub-Konto mit Berechtigung für Repository-Erstellung,
  Workflow-Dateien, Actions-Lesen sowie Fork/PR-Erstellung.
- HACS-Richtlinien lesen: https://www.hacs.xyz/docs/publish/start/ und
  https://www.hacs.xyz/docs/publish/include/.

Im Terminal in den entpackten Quellordner wechseln. Dann anmelden:

```bash
gh auth login --hostname github.com --scopes workflow
```

Die Anmeldung öffnet GitHubs eigenen Ablauf. Keine Zugangstokens in Dateien
eintragen. Das Skript liest den Benutzernamen danach über `gh api user`.
Die MIT-Lizenz ist bereits gewählt und enthalten.

## Alles automatisch ausführen

Den Projektpfad an deinen PC anpassen. Windows-Beispiel:

```powershell
python publish.py --project-dir "C:\Users\DEINNAME\Projekte\library-card" --publish --submit-hacs --ack-publishing-docs
```

Linux/macOS-Beispiel:

```bash
python publish.py --project-dir "$HOME/Projekte/library-card" --publish --submit-hacs --ack-publishing-docs
```

Falls Windows `python` nicht findet, `py -3.12` verwenden. Mit
`--ack-publishing-docs` bestätigst du die erste Angabe der offiziellen HACS-Checkliste,
dass du die Veröffentlichungsrichtlinien gelesen hast. Das Flag deaktiviert keine Prüfung.

Der Ablauf:

1. Quellcode in den lokalen Projekteordner übernehmen.
2. GitHub-Links, Codeowner und CODEOWNERS auf dein Konto setzen.
3. Testabhängigkeiten in einer lokalen `.venv` installieren und alle Tests prüfen.
4. Öffentliches Repository `<dein Benutzer>/library-card` anlegen, Beschreibung,
   Topics und Issues einrichten. Den lokalen `main`-Branch ohne Force-Push hochladen.
5. **HACS**, **Hassfest** und **Tests** für genau diesen Commit abwarten.
   Fehler, übersprungene Jobs oder ein Zeitlimit stoppen den Ablauf.
6. Den Tag `v0.5.1` und ein vollständiges stabiles GitHub-Release erstellen.
   Integrations-ZIP und SHA256-Prüfsumme werden beigefügt und geprüft.
7. `hacs/default` in dein persönliches Konto forken. Einen eigenen Branch von
   `upstream/master` erstellen und nur deinen alphabetischen Eintrag in `integration` ergänzen.
8. Den aktuellen HACS-Antrag mit Release-/Prüflauf-Links ausfüllen und als
   editierbaren Pull Request öffnen. Geänderte unbekannte Checklisten stoppen die Einreichung.

Das Ergebnis steht im Projektordner unter `.publication/result.json`.
Der ausgefüllte Antrag steht in `.publication/HACS-APPLICATION.md`.
Diese lokalen Dateien und die Testumgebung werden nicht ins Repository hochgeladen.

## Varianten und Wiederholung

Nur den Ablauf anzeigen, ohne Änderungen oder Anmeldung:

```bash
python publish.py --dry-run
```

Nur lokal vorbereiten und prüfen, ohne GitHub-Anmeldung oder Upload:

```bash
python publish.py --owner DEIN_GITHUB_BENUTZER --project-dir "DEIN_PROJEKTEORDNER/library-card"
```

Nur veröffentlichen, noch keinen HACS-Antrag senden:

```bash
python publish.py --project-dir "DEIN_PROJEKTEORDNER/library-card" --publish
```

Nach einem Verbindungsfehler denselben Befehl erneut starten. Vorhandene lokale
Änderungen bleiben erhalten. Ein passendes stabiles Release oder offener Antrag
wird wiederverwendet. Fremde Repository-Inhalte, abweichende Tags und unbekannte
Branchänderungen werden nicht überschrieben. Ein geschlossener HACS-Antrag wird
nicht automatisch erneut eröffnet: zuerst den genannten Ablehnungsgrund beheben.

Das Skript erstellt ein Release nur für diese erste öffentliche Version.
Spätere Veröffentlichungen benötigen eine neue konsistente Versionsnummer.
Wurde ein Prüflauf nach dem Release erneut ausgeführt, prüft das Skript weiterhin
die HACS-Regel zur zeitlichen Reihenfolge; es löscht kein bestehendes Release.

## Was nicht automatisch zugesichert werden kann

HACS entscheidet über Aufnahme und Zeitpunkt. Ein erfolgreich eingereichter PR
bedeutet noch keine Standardaufnahme. Bis dahin kann das öffentliche Repository
als benutzerdefinierte **Integration** in HACS verwendet werden.

Die vollständigen Remote-Prüfungen können erst nach der Repository-Erstellung
laufen. Lokale Tests und Hassfest ersetzen weder diesen HACS-Lauf noch Tests mit
deiner tatsächlichen HA-/Bubble-Version. Status: [HACS-Prüfbericht](HACS-AUDIT.md).
