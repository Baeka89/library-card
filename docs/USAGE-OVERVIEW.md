# Nutzungsübersicht / Usage overview

## Deutsch

In der Kartenbibliothek unter **Konfigurationsbereich → Nutzungsübersicht** öffnen.
Alternativ **Werkzeuge → Nutzungsübersicht** wählen. Beim ersten Öffnen werden
lesbare, gespeicherte Dashboards eingelesen. **Übersicht aktualisieren** liest erneut.
Normale Kartenanzeigen starten keinen zusätzlichen Dashboard-Scan.

Jede Vorlage zeigt die Zahl der gefundenen Stellen. Aufklappen zeigt getrennt:

- **Kartenverknüpfungen:** gespeicherte `custom:library-card`-Verwendungen.
- **Popup-Aufrufe:** statische Hash-/Popup-Aktionen; Tap und Hold zählen jeweils.
- **Fundstellen:** Dashboard, Ansicht und Konfigurationspfad.
- **Vorlage bearbeiten:** zurück zur zentralen Bearbeitung.

**Ansicht öffnen** öffnet einen neuen Tab. HA bietet keinen stabilen Direktlink
mit automatischem Scrollen zu einer einzelnen Karte. **Popup öffnen** verwendet
bei einem erkannten Bibliotheks-Hash den entsprechenden Popup-Link.
Aufrufe ohne festen Hash führen zur Ansicht.

Das ist eine Bestandsaufnahme, kein Zähler tatsächlicher Öffnungen. Prüfzeit und
fehlgeschlagene Zugriffe werden angezeigt. Bei unvollständiger Prüfung bedeutet
null Fundstellen nicht sicher ungenutzt. Nicht gespeicherte, dynamisch erzeugte
Dashboards und durch JavaScript/Jinja berechnete Aktionen sind nicht vollständig
auswertbar. Unverknüpfte Kopien einer Kartenkonfiguration zählen nicht als Verwendung.

## English

Open the library's configuration-area selector and choose the usage overview,
or use its tools shortcut. Readable saved dashboards are scanned on first use;
refresh explicitly when needed. Normal card rendering does not start this scan.

Expand each template to see its linked card count, static popup action count,
dashboard/view locations and editing shortcut. Links open views or recognized
hash popups in a new tab. Home Assistant has no stable deep link that scrolls
to a specific individual card.

Counts represent configuration locations, not actual opens. Incomplete scans are
marked; zero found locations does not prove that an inaccessible dashboard has
no uses. Unsaved/generated dashboards, computed JavaScript/Jinja actions and
unlinked copies cannot be counted reliably as library references.
