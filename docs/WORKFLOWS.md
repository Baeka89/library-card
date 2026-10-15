# Vorlagen und lokale Verwendungen / Templates and local uses

## Deutsch

### Vorlagen: Eingabefelder, Kategorien und Schutz

In **Konfiguration → Kartenvorlagen** nach Namen, Kategorie oder Kartentyp suchen.
Eine Kategorie unter **Kategorie und Eingabefelder** vergeben und zentral speichern.
Der Kategorienfilter findet auch Vorlagen ohne Kategorie. Die Nutzungsübersicht
hat einen eigenen Kategorienfilter.

Unter **Kategorie und Eingabefelder** pro Feld den Pfad, die Beschriftung und den
Typ festlegen: Entität, Text, Zahl, Schalter oder Auswahlliste. Optional Pflichtfeld,
Entitätsdomänen oder Auswahlwerte angeben. Beispiel: `variables.entity_cover`
mit Typ Entität und Domäne `cover`. Für Schlüssel mit Punkten JSON-Pfade verwenden,
z. B. `["colors","calendar.person_a"]`. Beim Einsetzen erscheinen diese Felder;
nur die dort geänderten Werte werden als lokale Ausnahmen gespeichert.

Die Vorlage darf leere Vorgaben enthalten. Eine tatsächliche Verwendung mit
fehlenden Pflichtwerten zeigt einen Hinweis und lässt sich über die Bibliothek
nicht speichern. Zentrale Gruppen-/Personenbindungen können nicht als örtliche
Eingabefelder definiert oder überschrieben werden.

**Vorlage schützen** sperrt direkte Vorlagenänderungen und Löschen, auch im Backend.
**Schutz aufheben** muss in einem eigenen zentralen Speicherschritt erfolgen;
andere ungespeicherte Änderungen vorher speichern oder verwerfen. Lokale
Verwendungen und eigene Hash-Ausnahmen bleiben bearbeitbar. Gemeinsame Werte
bleiben mit geschützten Vorlagen verbunden.

### Änderungsvorschau und gezielte Rücknahme

**Änderungsvorschau** neben dem zentralen Speichern zeigt geänderte Felder und
Auswirkungen auf bekannte lokale Verwendungen. Lokale Ausnahmen können eine
zentrale Änderung für eine Verwendung verdecken. Vorher-/Nachher-Vorschauen
werden erst beim Aufklappen erzeugt. Ohne vollständige Bestandsaufnahme wird die
Auswertung als unvollständig gekennzeichnet. Die Vorschau speichert nichts.

Unter **Werkzeuge → Verlauf und Wartung → Versionsverlauf** bietet jeder Stand
**Nur Vorlage zurücknehmen: …**. Das übernimmt ausschließlich diese Vorlage in
den Entwurf. Andere Vorlagen, Gruppen und Personen bleiben erhalten. Danach
zentral speichern. Referenzierte Gruppen/Personen müssen noch vorhanden sein;
geschützte Vorlagen vorher separat entsperren. Der Verlauf umfasst zehn Stände.

### Lokale Verwendungen ansehen, bearbeiten, vergleichen und duplizieren

Unter **Nutzungsübersicht** oder **Lokale Verwendungen** einer Vorlage:

- **Verwendung ansehen / bearbeiten** lädt den aktuellen Dashboard-Stand und
  öffnet den lokalen Vorlageneditor. Originale Karteneditoren, Eingabefelder,
  YAML und Styles bleiben verfügbar. Die Vorschau berücksichtigt auch
  `card_mod` auf einer normalen Dashboard-Verknüpfung.
- **Lokale Änderungen speichern** schreibt nur die gewählte Stelle eines
  gespeicherten UI-Dashboards. Entwürfe werden nicht automatisch gespeichert.
  Bei geänderter Bibliotheksrevision oder Dashboard-Konfiguration wird abgebrochen;
  die Verwendung neu öffnen. Platzierungsoptionen bleiben erhalten.
- **Verwendung vergleichen** bei zwei Fundstellen wählen. Die Ansicht zeigt
  Vorschauen, aufgelöste Kartenkonfigurationen, Platzierung und Felddifferenzen.
- **Verwendung duplizieren** übernimmt die Verknüpfung samt lokalen Einstellungen
  in die gewählte Ansicht oder den Abschnitt eines UI-Dashboards. Die Quelle
  bleibt erhalten. Volle Panel-Ansichten werden nicht um eine versteckte Karte erweitert.
- Lokale Ausnahmen und erkannte fehlende Entitäten werden an der Fundstelle
  angezeigt. JavaScript-/Jinja-Ausdrücke werden für die Entitätsprüfung nicht ausgeführt.

YAML-Dashboards können angesehen und bearbeitet werden; die Konfiguration zum
manuellen Übernehmen steht als YAML bereit. Direktes Speichern ist dort gesperrt.
Für Dashboard-Zugriffe und -Änderungen sind Administratorrechte erforderlich.

### Popup-Varianten

Ein gespeicherter eigener Hash bezeichnet eine zentrale Variante: Änderungen
seiner lokalen Ausnahmen wirken auf alle Buttons mit diesem Hash. Der zentrale
Vorlagen-Hash selbst hat keine lokalen Ausnahmen; dafür eine eigene
Hash-Verknüpfung anlegen. Beim Duplizieren wird ein eigener Hash erzeugt oder
der eingegebene neue Hash verwendet. Lokale Einstellungen und Popup-Optionen
werden mitgenommen; eingefügt wird ausschließlich ein navigierender Button.

Hash-Anlage und Dashboard-Einfügen betreffen zwei Speicher. Scheitert das Einfügen
nach erfolgreicher Hash-Anlage, meldet die Oberfläche ausdrücklich die erhaltene
Hash-Kopie. Sie kann nach erneuter Prüfung eingesetzt oder gezielt verwaltet werden.
Vorlagen bleiben geschützt, während unabhängige Hash-Ausnahmen verändert werden.

HA speichert Dashboard-Konfigurationen über seine native Lovelace-API. Die
Integration prüft vor dem Schreibaufruf den vollständigen aktuellen Stand und
serialisiert ihre eigenen Schreibvorgänge. Es gibt keine verteilte Transaktion
mit fremden Dashboard-Editoren oder zwischen Dashboard und Bibliothek.

## English

Search templates by name, category or card type. Define insertion fields with a
path, label, type, optional required flag, entity domains or choices. Empty central
defaults are allowed; missing/invalid required local values are reported. Shared
bindings remain authoritative.

Protected templates cannot be edited/deleted through saves, imports or history.
Unlocking requires a separate save. Local linked cards and independent hash
variants remain editable. Central shared values retain their bindings.

The change preview compares saved and draft values and resolves their effects
with each usage's local overrides. Previews load on expansion. History can restore
one template into the draft while preserving all other templates and shared data.

Open a usage to edit its original card editor, local variables, YAML and styles.
Save updates only that stored UI-dashboard location after checking the dashboard
fingerprint and library revision. YAML dashboards provide export rather than direct
saving. Compare two usages or duplicate one into a view/section. Missing entities
and local exceptions are marked; dynamic expressions are not executed for analysis.

Hash variants are shared by all buttons using that hash. Duplicating one creates
an independent hash and inserts only its navigation button. Hash creation and
insertion are separate saves; an insertion failure explicitly reports the preserved
hash variant. Native HA dashboard persistence is not a distributed transaction
with external editors. Dashboard operations require administrator access.

The existing icon is unchanged; a new icon remains a separate design discussion.
