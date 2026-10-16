# v1.1.0 veröffentlichen / Publish v1.1.0

## Deutsch

Das einzelne `update_library_card_v1_1_0.py` enthält alle geprüften Projektquellen. Es benötigt keine weiteren Downloads aus diesem Chat. Alte Skripte, Archive und der bestehende HACS-Antrag werden erhalten. Der Ausgangscommit ist `eadf38532c6680805e2efeec6163e85a641b8b09` (v1.0.0).

Auf dem Ubuntu-PC das Skript nach `/home/ubuntu/Downloads` speichern und mit `python3 /home/ubuntu/Downloads/update_library_card_v1_1_0.py` ausführen. Git, authentifizierte GitHub CLI für Baeka89, Node.js ab 22 und Python ab 3.12 werden benötigt. Das Skript verwendet `/home/ubuntu/Projekte/Projekt Library-Card`. Mit `--project-dir` kann ein anderer tatsächlicher Projektordner angegeben werden. `--check-only` prüft Paket und Ausgangsstand lesend.

Der Ablauf prüft lokale Änderungen, Quell-/Push-Remote, alle veröffentlichten numerischen Versionen und bestehende Tags. Er aktualisiert die Quellen und führt die lokalen Prüfungen mit isolierten Python-Abhängigkeiten durch. Anschließend erstellt er den Commit, pusht ohne Force und wartet auf HACS, Hassfest und Tests für genau diesen Commit. Erst danach werden Tag, Release-Entwurf und Installationsarchiv angelegt; vorhandene Entwürfe und Assets werden über ihre IDs weiterverwendet. Abweichende Dateien oder Release-Texte werden nicht überschrieben. Nach Veröffentlichung werden Tag, Release und Assets erneut geprüft.

Fortsetzungsmarker: `.publication/reviewed-release-v1.1.0.json`. Bei einem Abbruch dasselbe Skript erneut starten. Unbekannte Änderungen zuerst sichern/klären; das Skript setzt sie nicht zurück. Bereits vorhandene Prüfsummen werden vor dem Erzeugen neuer Prüfsummen unter einem eindeutigen Namen im vorhandenen `dist`-Ordner erhalten. Es wird kein separater Archivpfad vorausgesetzt. Der HACS-Antrag https://github.com/hacs/default/pull/11851 bleibt bestehen; ein zweiter Antrag wird nicht erstellt.

Danach in HACS aktualisieren, HA neu starten, die vorhandene Ressource auf `/card_library/card-library.js?v=1.1.0` ändern und den Browser vollständig neu laden. Bibliotheksspeicher und Integrationseinträge erhalten.

Für Entwickler erstellt `python3 scripts/make_update_script.py /ABSOLUTER/AUSGABEPFAD/update_library_card_v1_1_0.py` das eigenständige Skript aus einem fertig geprüften Quellstand. Der Ausgabepfad darf keine vorhandene Datei ersetzen. `scripts/update_publication.py` ist dessen interne Vorlage und enthält selbst keinen Nutzdatenblock.

## English

The single `update_library_card_v1_1_0.py` contains all reviewed project source and needs no additional downloads from this chat. Older scripts, archives and the existing HACS application are preserved. The baseline commit is `eadf38532c6680805e2efeec6163e85a641b8b09` (v1.0.0).

Save the script to `/home/ubuntu/Downloads` on Ubuntu and run `python3 /home/ubuntu/Downloads/update_library_card_v1_1_0.py`. Requirements are Git, GitHub CLI authenticated as Baeka89, Node.js 22+ and Python 3.12+. The default project is `/home/ubuntu/Projekte/Projekt Library-Card`. Use `--project-dir` for another actual location. `--check-only` reads and checks the package and baseline without applying changes.

The workflow verifies local edits, fetch/push remotes, all published numeric versions and existing tags. It updates source and runs local checks using isolated Python dependencies. It then commits, pushes without force and waits for HACS, Hassfest and tests for that exact commit. Only afterwards are the tag, draft release and installation archive created; existing drafts and assets are reused by ID. Divergent files or release notes are not overwritten. Tag, release and assets are checked again after publication.

Resume marker: `.publication/reviewed-release-v1.1.0.json`. Restart the same script after interruption. Preserve or resolve unknown local edits first; the script does not reset them. Existing checksums are retained under a unique name in the existing `dist` directory before new checksums are generated. No separate archive location is assumed. The existing HACS application https://github.com/hacs/default/pull/11851 is retained; no second application is created.

Afterwards update in HACS, restart HA, change the existing resource to `/card_library/card-library.js?v=1.1.0` and fully reload the browser. Preserve library storage and integration entries.

Developers can generate the self-contained script from fully checked source with `python3 scripts/make_update_script.py /ABSOLUTE/OUTPUT/PATH/update_library_card_v1_1_0.py`. Existing output files are never replaced. `scripts/update_publication.py` is the internal template and contains no payload itself.
