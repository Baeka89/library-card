# Vertiefte Prüfung des lokalen Entwicklungsstands

Prüfdatum: 14.10.2026. Zum Prüfzeitpunkt war **v0.5.1** öffentlich veröffentlicht.
Diese Prüfung betrifft den lokalen Projektstand einschließlich der bereits beauftragten,
noch unveröffentlichten Funktionen. Es wurde keine Versionsnummer geändert und nichts
auf GitHub veröffentlicht. Die bereits vor dieser Prüfung vorhandene lokale
Versionskennzeichnung ist kein neues veröffentlichtes Release.

## Behobene Fehler und Auffälligkeiten

### Oberfläche und Originaleditoren

- Der lokale Originaleditor wird bei Änderungen an unbeteiligten Vorlagen oder
  gemeinsamen Werten nicht mehr neu eingebaut. Eingabefokus und lokale YAML-Entwürfe
  bleiben erhalten. Änderungen der ausgewählten Vorlage, ihrer Bindungen und Metadaten
  sowie Namen in der Auswahl werden weiter berücksichtigt.
- Entfernte Karten, Editor- und Verwaltungsflächen nehmen keine Bibliothekslistener
  erneut auf und rendern keine abgehängte Oberfläche bei einem Verbindungswechsel.
- Geschlossene übergeordnete Menüs verhindern das vorzeitige Laden ihrer geöffnet
  gespeicherten Untermenüs, Vorschauen und Editoren.
- Ausgeblendete Bibliotheksfelder bleiben auch bei Flex-/Grid-Layout tatsächlich
  verborgen. Originaleditoren fremder Karten erhalten keine solchen CSS-Regeln.
- Aktualisierte native Auswahlfelder ersetzen ihre alten Optionen.
- Eingabefeld-Entwürfe bleiben auf die ausgewählte Vorlage beschränkt.

### Verwendungen, Vorschauen und Popups

- Lokale Vorschauen erhalten aktuelle HA-Zustände, verwenden unveränderte Karten weiter
  und reagieren auf das Nachladen nativer Karten.
- Hash-Speicherbestätigungen aktualisieren den gemeinsamen Bibliotheksstand sofort,
  auch wenn die Subscription noch keine Meldung liefert. Ungültige Antworten ersetzen
  keinen Stand; verspätete Antworten verdrängen keinen neueren Stand.
- Popup-Vergleich und Änderungsvorschau berücksichtigen lokale Hash-Ausnahmen,
  Popup-Titel, Breiten und Style-Optionen sowie neue Pflichtfelder.
- Entfernte Vorlagen/Hashes führen zu verständlichen Meldungen statt zum Abbruch
  der gesamten Vergleichsansicht.
- Änderungen von Pflichtfeldern werden auch für sichtbare eigenständige native
  Bubble-Popups erneut geprüft. Veralteter ungültiger Inhalt wird entfernt; nach
  Korrektur kann derselbe Hash wieder geöffnet werden.
- YAML-/JSON-Importe und Löschprüfungen dürfen Antworten einer vorherigen HA-Verbindung
  nicht auf den neuen Bibliotheksstand übertragen.
- Dashboard-Schreibvorgänge validieren wirksame, über gemeinsame Bindungen gesetzte
  Popup-Hashes. Eine explizite Hash-Zuordnung ersetzt den nativen Hash korrekt.
- Pflichtwerte und unzulässig verschachtelte Bubble-Popups werden vor dem Einfügen
  ihrer Buttons geprüft.
- Schreibvorgänge durch wiederverwendete YAML-Alias-Strukturen ändern nur den
  ausgewählten Zweig, nicht andere Vorkommen oder Quelldaten.

### Geschwindigkeit und Abläufe

- Gespeicherte Dashboard-Bestandsaufnahmen werden einmal nach Karten und Aktionen
  indiziert. Jeder Vorlagen-Eintrag nutzt diesen Index, statt alle Dashboards erneut
  zu durchlaufen. Die Zuordnung zu aktuellen Popup-Hashes bleibt dynamisch.
- Ressourcenabfrage und Dashboard-Abfragen laufen unabhängig voneinander.
- Fehlerhafte Ansichten/Abschnitte verdecken keine lesbaren Verwendungen anderer
  Bereiche desselben Dashboards; die unvollständige Prüfung wird angezeigt.
- Rechenintensive Bibliotheksvalidierung und Historiennormalisierung laufen im HA-
  Executor. Sperren, dauerhafte Speicherung und Aktivierung der vollständigen neuen
  Revision bleiben geordnet. Während der Vorbereitung sehen Leser den alten Stand.
- Karten prüfen weiterhin zuerst die benötigte Vorlage und ihre tatsächlichen
  Bindungen. Unbeteiligte Vorlagenänderungen erzeugen keine neuen Karten.

### Icons und Veröffentlichungsvorbereitung

- Die freigegebenen transparenten Icons bleiben unverändert: 256 × 256 und 512 × 512.
- Die PNG-Prüfung kontrolliert vollständige Dateien, CRCs, Bilddaten und Größe;
  beschädigte kurze Dateien verursachen keine ungefangene Ausnahme.
- Das Installationsarchiv wird zuerst vollständig gebaut und geprüft und anschließend
  ersetzt. Fehlgeschlagene Quelldatei-Lesevorgänge lassen bisherige Artefakte erhalten.
- Ungültige Versionspfade und symbolische Links werden vor dem Archivieren abgewiesen.
- Veröffentlichungsvorbereitung übernimmt keine HA-Speicherdateien, Logs oder
  Umgebungsdateien und verwendet keine fremden Veröffentlichungsmarker.
- Quell- und Push-Remote werden vor GitHub-Schreibvorgängen geprüft. Zeitlimits müssen
  positiv sein. Auch Workflow-Jobs auf weiteren API-Seiten werden kontrolliert.
- Fehlt bei einem Release-Asset die GitHub-Prüfsumme, wird die heruntergeladene Datei
  anhand ihrer tatsächlichen Bytes geprüft.
- Keine dieser GitHub-Schreibfunktionen wurde für diese Prüfung ausgeführt.

## Prüfergebnisse

**742 bestandene Funktionstests: 590 JavaScript- und 152 Python-Tests.**

| Suite | Bestanden |
| --- | ---: |
| Kernfunktionen | 74 |
| Dashboard-Werkzeuge | 15 |
| Verwaltungsabläufe | 17 |
| Oberfläche mit Browser-Testelementen | 189 |
| Oberfläche mit nativen HA-Testelementen | 197 |
| Ressourcen | 5 |
| Kalender-Kompatibilität | 3 |
| Popup-Abläufe | 79 |
| Popup mit tatsächlicher Hauptressource | 11 |
| Python: Modell, Backend, Veröffentlichung, Validierungsparität | 152 |

Alle neun WebSocket-Schemas wurden mit echten voluptuous- und probatio-Validatoren
geprüft. Lokale Verpackungsprüfung bestanden. Der offizielle Hassfest-Container
meldet **1 Integration, 0 ungültige Integrationen**.

Die neuen Thread-Tests verwenden echte Worker und prüfen, dass Validierung außerhalb
der Ereignisschleife läuft und parallele Leser bis zur Aktivierung die alte vollständige
Revision erhalten. Der minimale Testadapter pollt Worker-Ergebnisse, weil die Cloud-
Sandbox lokale Socket-Signale sperrt; die produktive HA-Executor-Anbindung bleibt unverändert.

## Kontrollierte Geschwindigkeitsmessungen

| Szenario | Vorher | Danach |
| --- | ---: | ---: |
| 50 Vorlagen, 3.000 eingelesene Karten: gefundene Verwendungen | 2.000 | 2.000 |
| Dabei gelesene Konfigurations-Typfelder | 300.000 | 6.000 |
| CPU-Auswertung dieser Bestandsaufnahme | 457,35 ms | 18,92 ms |
| 20 Referenzen mit 1.000 Entitäten: neue Karten durch 3 unbeteiligte Updates | 0 | 0 |
| Zwei Vorlagen mit 1.000 Zeilen, fünf Menürenderings: neue Originaleditoren | 1 | 1 |
| Derselbe Menülauf: erzeugte geschlossene Vorschaukarten | 0 | 0 |

Die Indizierung reduziert in diesem Szenario die wiederholten Typfeld-Lesevorgänge
um 98 %. Die Messungen verwenden echte Frontend-Module mit simuliertem DOM/HA;
sie sind keine Messung der Ladezeit deines HA-Geräts oder Netzwerks.

## Bezug zur veröffentlichten Version

Auch in der archivierten v0.5.1 vorhanden waren die Verbindungsschwächen bei Import
und Löschprüfungen, vorzeitig geladene Untermenüs, unnötige lokale Editor-Neuaufbauten
und die Behandlung abgehängter Oberflächen. Einige weitere Fehler betrafen die
unveröffentlichten neuen Verwendungs- und Eingabefeld-Abläufe. Die korrigierten lokalen
Quellen werden separat bereitgestellt; vorhandene Release-Archive und alte Skripte
in `/workspace/library-files` bleiben erhalten und enthalten weiterhin ihren früheren
Stand. Das Archivverzeichnis wurde nicht verlegt.

## Grenzen der Prüfung

Originalkarten, native Komponenten und Dashboard-Persistenz werden automatisiert
teilweise mit Testdoubles geprüft. Ein Browserlauf auf deinem echten HA, mit allen
installierten Custom Cards, Themes und Mobilgeräten, wurde nicht durchgeführt.
Fehlerfreiheit für jede Fremdkarte lässt sich daraus nicht garantieren.

Das native lokale Logo benötigt HA 2026.3 oder neuer. Die Sichtbarkeit vor der
Installation hängt vom jeweiligen HACS-/Marketplace-Index ab; öffentliche Aufnahme
und Veröffentlichung werden durch lokale Dateien nicht ersetzt.

Die anschließende Veröffentlichungsvorbereitung bündelt den geprüften Stand in **v0.5.2**. Alte vorbereitete Versionsnummern bleiben in den getrennten Archiven erhalten.
