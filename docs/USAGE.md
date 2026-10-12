# Bedienung

**Konfiguration** verwaltet zentrale Vorlagen, gemeinsame Einstellungen und
Personen. **Vorlagen einsetzen** wählt eine Vorlage und legt lokale Ausnahmen fest.

## Karten und YAML

Eine vollständige Karte einschließlich `type` und Einstellungen unter
**Vorlage hinzufügen → Karte aus YAML** einfügen. Auch `horizontal-stack`,
`vertical-stack` und `grid` mit ihren Unterkarten sind möglich. Fuß-/Kopfzeilen
mit `card:` und optionalem numerischem `max_width:` werden übernommen.
JSON-Import/Export ist für ganze Bibliotheken mit Gruppen und Personen.
YAML-Kommentare, `!include` und externe Dateiverweise werden nicht übernommen.

## Verknüpfungen und lokale Ausnahmen

Zentrale Änderungen gelten für alle Verwendungen. Lokale Änderungen speichern
nur Unterschiede. Mit **Feld wieder aus Vorlage übernehmen** wird ein Feld
erneut verbunden. Gemeinsame Gruppen-/Personenbindungen bleiben verbindlich.

Designfelder zunächst in der zentralen Vorlage markieren. **Nur markiertes
Design übernehmen** verbindet diese Felder; übrige vorhandene Werte werden
lokal festgehalten. Der Modus muss nach geänderten Designmarkierungen erneut
angewendet werden. Neue Felder außerhalb lokaler Bereiche werden übernommen.

Für komplexe Styles **Zusätzliche lokale Styles** oder **Vollständige lokale
Konfiguration (YAML)** verwenden. Originaleditoren behalten ihre eigene Gestaltung.

## Speichern und Entfernen

Normale lokale Kartenänderungen im HA-Dashboard speichern. Zentrale Vorlagen
über **Zentrale Änderungen speichern** übernehmen. Eigene Hash-Verknüpfungen
unter „Vorlagen einsetzen“ werden direkt in der Integration gespeichert;
die zentrale Verwaltung übernimmt sie zunächst in ihren Entwurf.

Vorlagenaktionen bieten Duplizieren und Löschen. Bekannte Dashboard-Verwendungen
verhindern das Löschen. Nicht erreichbare Dashboards werden ausdrücklich gemeldet.
Die Prüfung ist eine Bestandsaufnahme und keine transaktionssichere Sperre.

Ein HA-Verbindungs-/Revisionswechsel kann ungespeicherte Entwürfe blockieren:
bei Bedarf exportieren und den aktuellen Stand neu laden. Sehr spezielle ältere
rohe Listen-Overrides lassen sich nicht immer feldweise zurückverknüpfen; dann
den ganzen Listenbereich übernehmen oder vollständiges lokales YAML verwenden.

Vorschaukarten sind echte Karten; ihre Aktionen sind aktiv.
