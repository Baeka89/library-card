# Library Card for Home Assistant

<p align="center"><img src="custom_components/card_library/brand/icon@2x.png" alt="Library Card" width="160" height="160"></p>

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Baeka89&repository=library-card&category=integration)
[![Maintainer](https://img.shields.io/badge/Maintainer-Baeka89-blue.svg)](https://github.com/Baeka89)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/misomazo)
[![Release](https://img.shields.io/github/v/release/Baeka89/library-card)](https://github.com/Baeka89/library-card/releases/latest)

[Deutsch](#deutsch) | [English](#english) | [Changelog](CHANGELOG.md)

---

<a name="deutsch"></a>

## Deutsch 🇩🇪

### Über dieses Projekt

**Library Card** ist eine zentrale Kartenbibliothek für Home Assistant. Gestalte eine Karte einmal, speichere sie als Vorlage und verwende sie an beliebig vielen Stellen als **Verknüpfung**. Änderungen an der Vorlage werden automatisch auf die verknüpften Karten übertragen; örtliche Ausnahmen bleiben erhalten.

Beispiel: Kalender auf dem Dashboard und im Bildschirmschoner zeigen unterschiedliche Informationen, verwenden aber dieselben zentral gepflegten Personenfarben.

Die Integration benötigt Home Assistant **2024.7.0** oder neuer. Das mitgelieferte Logo wird von Home Assistant ab **2026.3** lokal unterstützt; ältere Versionen zeigen gegebenenfalls ein Standardsymbol. Einrichtung und Bibliotheksoberfläche unterstützen Deutsch und Englisch. Fremde Karten behalten ihre eigenen Übersetzungen und Editoren.

### Unterstützte Karten

* **Home-Assistant-Karten:** integrierte Kartentypen über die HA-Kartenhelfer verwenden.
* **Installierte Custom Cards:** vorhandene Karten und deren grafische Editoren nutzen, soweit diese einen Editor bereitstellen.
* **Vollständige Stacks:** beispielsweise `horizontal-stack`, `vertical-stack` und `grid` einschließlich Unterkarten speichern.
* **Kopf- und Fußzeilen:** Konfigurationen mit `card:` und optionalem numerischem `max_width:` übernehmen.
* **Bubble Card Popups:** vollständige Popup-Vorlagen direkt über einen Hash öffnen.

Custom Cards müssen separat installiert und als Ressourcen geladen sein. Eine vollständige Kompatibilität mit jedem fremden Kartentyp ist nicht zugesichert.

### Features

* **Zentrale Vorlagen:** fertige Karten speichern, später bearbeiten, duplizieren und löschen. Zentrale Änderungen erreichen alle Verknüpfungen.
* **Native HA-Oberfläche:** Menüs, Buttons und Felder folgen dem Home-Assistant-Theme; Originaleditoren behalten ihre eigene Oberfläche.
* **Originale Karteneditoren:** den vorhandenen grafischen Editor der jeweiligen Karte nutzen; alternativ vollständige Karten-YAML direkt einfügen.
* **Button-Card-Templates:** `button_card_templates` importieren und Entitäten/Variablen erst beim Einsetzen festlegen.
* **Flexible Übernahme:** alles, nur markierte Designfelder oder ausgewählte Felder übernehmen; Entitäten je Verwendung anpassen.
* **Gemeinsame Einstellungen:** beispielsweise Personenfarben zentral verwalten und mit mehreren Vorlagen verbinden.
* **Örtliche Ausnahmen:** Entitäten, Gestaltung, `card_mod` und kartenspezifische Styles je Verknüpfung ändern.
* **Popups ohne zusätzliche Dashboard-Karte:** ein Button öffnet die Bibliotheksvorlage über `#Hash`.
* **Mehrere Popup-Verknüpfungen:** verschiedene Hashes mit eigenen örtlichen Einstellungen für dieselbe Vorlage speichern.
* **Vorlagen organisieren:** definierte Eingabefelder, Kategorien/Suche, Vorlagenschutz, gezielte Rücknahme und Änderungsvorschau.
* **Lokale Verwendungen:** ansehen/bearbeiten, vergleichen und mit lokalen Ausnahmen duplizieren; fehlende Entitäten und Ausnahmen erkennen.
* **Nutzungsübersicht:** Fundstellen je Vorlage sehen und Dashboard-Ansichten oder erkannte Popups direkt öffnen.
* **Bibliotheksverwaltung:** JSON-Import/Export, Verlauf, Wiederherstellung und Prüfung bekannter Dashboard-Verwendungen.

### Zwei getrennte Arbeitsbereiche

* **Konfiguration / Kartenbibliothek:** zentrale Vorlagen, gemeinsame Einstellungen und Personen verwalten. Änderungen mit **Zentrale Änderungen speichern** übernehmen.
* **Vorlagen einsetzen / Vorlagenkarte:** eine Vorlage auswählen und örtliche Ausnahmen festlegen. Normale Karten anschließend im Dashboard speichern.

Eigene Hash-Verknüpfungen werden unter **Vorlagen einsetzen** direkt in der Integration gespeichert. In der zentralen Verwaltung gehören sie zunächst zum Entwurf und werden mit den zentralen Änderungen gespeichert.

### Unterstützung

Wenn dir diese Integration hilft, freue ich mich über eine kleine Unterstützung für die Weiterentwicklung:

👉 **[Spende via PayPal](https://paypal.me/misomazo)**

---

<a name="english"></a>

## English 🇺🇸

### About this Project

**Library Card** provides a central card library for Home Assistant. Design a card once, save it as a template and reuse it anywhere as a **linked card**. Template changes automatically update its linked uses while preserving local exceptions.

Example: a dashboard calendar and a screensaver calendar display different information while sharing centrally managed person colors.

The integration requires Home Assistant **2024.7.0** or newer. Setup and the library interface support German and English. Third-party cards retain their own translations and editors.

### Supported Cards

* **Home Assistant cards:** use built-in card types through Home Assistant's card helpers.
* **Installed custom cards:** reuse existing cards and their graphical editors when provided.
* **Complete stacks:** save `horizontal-stack`, `vertical-stack` and `grid` configurations including their child cards.
* **Headers and footers:** import configurations wrapped in `card:` with an optional numeric `max_width:`.
* **Bubble Card popups:** open complete popup templates directly through a hash.

Custom cards must be installed separately and loaded as resources. Compatibility with every third-party card type is not guaranteed.

### Features

* **Central templates:** save, edit, duplicate and delete cards. Central changes reach all linked uses.
* **Native HA interface:** menus, buttons and fields follow the Home Assistant theme; original editors keep their own interface.
* **Original card editors:** use the card's existing graphical editor or paste complete card YAML directly.
* **Button Card templates:** import `button_card_templates` and set entities/variables when inserting a linked card.
* **Flexible inheritance:** inherit everything, marked design fields or selected fields; change entities per use.
* **Shared settings:** centrally manage values such as person colors and link them to multiple templates.
* **Local exceptions:** change entities, design, `card_mod` and card-specific styles per linked card.
* **Popups without an extra dashboard card:** open a library template through a `#Hash` button.
* **Multiple popup links:** assign different hashes and local settings to the same template.
* **Template organization:** defined inputs, categories/search, protection, selective rollback and change previews.
* **Local uses:** inspect/edit, compare and duplicate linked variants; identify missing entities and local exceptions.
* **Usage overview:** see references per template and open dashboard views or detected popups.
* **Library management:** JSON import/export, history, restoration and checks for known dashboard uses.

### Two Separate Workspaces

* **Configuration / card library:** manage central templates, shared settings and people. Commit changes with the central save button.
* **Insert templates / template card:** select a template and define local exceptions. Save regular cards in the dashboard afterward.

Custom hash links are saved directly to the integration from the insertion workspace. In central management, they remain part of the draft until central changes are saved.

### Support

If you find this integration useful, please consider supporting its development:

👉 **[Donate via PayPal](https://paypal.me/misomazo)**

---

## How to Install / Installation

Der [HACS-Standardantrag](https://github.com/hacs/default/pull/11851) ist eingereicht. Bis zur Aufnahme als benutzerdefiniertes Repository installieren. / The [HACS default-repository application](https://github.com/hacs/default/pull/11851) has been submitted. Until inclusion, install as a custom repository.

1. **Repository hinzufügen / Add repository:** In HACS → ⋮ → Benutzerdefinierte Repositories / Custom repositories, add `https://github.com/Baeka89/library-card`. Kategorie / Category: **Integration**.
2. **Installieren / Install:** Download **Library Card** in HACS.
3. **Neustart / Restart:** Restart Home Assistant.
4. **Einrichten / Setup:** Einstellungen / Settings → Geräte & Dienste / Devices & Services → Integration hinzufügen / Add integration → **Library Card**.
5. **Ressource / Resource:** Enable advanced mode in your HA profile. Einstellungen / Settings → Dashboards → ⋮ → Ressourcen / Resources: add `/card_library/card-library.js?v=0.5.2` as **JavaScript-Modul / JavaScript module**.
6. **Browser neu laden / Reload browser:** In the dashboard card picker, choose **Kartenbibliothek** (card library) to manage templates or **Vorlagenkarte** (template card) to insert a linked card.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Baeka89&repository=library-card&category=integration)

**Manuell / Manual:** Copy `custom_components/card_library` to `/config/custom_components/card_library`, then follow steps 3–6.

---

## Create and Reuse Templates / Vorlagen erstellen und einsetzen

### Deutsch 🇩🇪

1. **Kartenbibliothek** öffnen → **Konfiguration → Vorlage hinzufügen**.
2. Karte auswählen, eine vorhandene Dashboard-Karte übernehmen oder vollständige YAML einfügen. Auch ganze Stacks sind möglich.
3. Im Originaleditor bearbeiten, Vorlage benennen und **Zentrale Änderungen speichern**.
4. Am gewünschten Dashboard-Platz eine **Vorlagenkarte** hinzufügen → **Vorlagen einsetzen** → Vorlage auswählen.
5. Übernahme festlegen und bei Bedarf **Örtliche Anpassungen** ändern. Danach das Dashboard speichern.

Designfelder zuerst zentral markieren. **Nur markiertes Design übernehmen** verknüpft diese Felder; andere vorhandene Werte bleiben lokal. Nach geänderten Designmarkierungen den Modus erneut anwenden. Mit **Feld wieder aus Vorlage übernehmen** eine örtliche Ausnahme aufheben. Gruppen- und Personenbindungen bleiben verbindlich.

### English 🇺🇸

1. Open the card library → **Configuration → Add template**.
2. Select a card, import an existing dashboard card or paste its complete YAML. Whole stacks are supported.
3. Edit with the original editor, name the template and save central changes.
4. Add a template card at the desired dashboard location → insertion workspace → select the template.
5. Choose inheritance and adjust local settings if needed. Save the dashboard afterward.

Mark design fields centrally first. Inheriting only marked design links these fields while retaining other existing values locally. Reapply this mode after changing design markers. Restore inheritance for a field to remove its local exception. Group and person bindings remain authoritative.

---

## Bubble Card Popups / Bubble-Card-Popups

### Deutsch 🇩🇪

Bubble Card ab **3.2.0** mit Standalone-Popups separat installieren. Eine vollständige Bubble-Popup-Karte in der Bibliothek speichern. Ihr zentraler Hash, beispielsweise `#Menu`, wird automatisch erkannt.

Unter **Als Bubble-Popup verwenden** den wirksamen zentralen Hash und Button-Code ansehen. Unter **Eigene Popup-Verknüpfung** zusätzliche Hashes wie `#Menu-Wohnzimmer` oder `#Menu-Flur` mit örtlichen Ausnahmen speichern.

**Nur der öffnende Button kommt ins Dashboard.** Die Bibliotheksressource lädt die passende Popup-Vorlage im Hintergrund. Es wird keine zusätzliche Popup- oder Vorlagenkarte auf der Zielseite benötigt.

### English 🇺🇸

Install Bubble Card **3.2.0** or newer with standalone popup support separately. Save a complete Bubble popup card in the library. Its central hash, such as `#Menu`, is detected automatically.

The popup section shows the effective central hash and button configuration. Custom popup links provide additional hashes such as `#Menu-Wohnzimmer` or `#Menu-Flur` with local exceptions.

**Place only the opening button on the dashboard.** The library resource loads the matching popup template in the background. No additional popup or template card is required on the target page.

```yaml
type: button
name: Menü / Menu
tap_action:
  action: navigate
  navigation_path: '#Menu-Wohnzimmer'
```

Der Hash muss zuvor in der Bibliothek gespeichert sein. / Save this hash in the library first.

[Popup-Anleitung / Popup guide](BUBBLE-POPUPS.md) · [Button-Card-Vorlagen / Button Card templates](docs/BUTTON-TEMPLATES.md)

---

## Styles and Shared Settings / Gestaltung und gemeinsame Einstellungen

**Deutsch:** Gemeinsame Gruppen und Personenfarben zentral pflegen. Unter **Zusätzliche lokale Styles** oder **Vollständige lokale Konfiguration (YAML)** örtliche Gestaltung ändern. `card_mod` setzt card-mod voraus; andere Style-Felder müssen vom jeweiligen Kartentyp unterstützt werden. Die Bibliothek übergibt diese Einstellungen an die Karte.

**English:** Manage shared groups and person colors centrally. Use additional local styles or complete local YAML for local design changes. `card_mod` requires card-mod; other styling keys must be supported by the target card. The library passes these settings to the card.

---

## Maintenance and Limits / Verwaltung und Grenzen

* **Berechtigungen / Permissions:** Administrators manage central templates and hash links. All authenticated HA users can read the library.
* **Daten / Data:** Templates are stored in HA `.storage`. Replace program files during updates; existing templates remain. Reload the browser and update the resource version when it changes.
* **Import / Export:** Complete card configurations use YAML; full libraries with groups and people use JSON. YAML comments, `!include` and external file references are not retained.
* **Löschen / Deleting:** Template actions provide deletion. Known dashboard uses block it; inaccessible dashboards are reported. The check is a snapshot rather than a transactional lock.
* **Grenzen / Limits:** The library and each resolved card are limited to 2 MB. Unsaved strategy dashboards and standalone screensavers cannot be fully imported.
* **Vorschau / Preview:** Previews are real cards with active actions. Do not store access credentials in templates.

[Neue Arbeitsabläufe / Workflows](docs/WORKFLOWS.md) · [Nutzungsübersicht / Usage overview](docs/USAGE-OVERVIEW.md) · [Weitere Bedienhinweise / More usage details](docs/USAGE.md) · [Tests und Prüfgrenzen / Tests and verification limits](docs/TESTS.md)

---

### Technical Components / Technische Komponenten

* `custom_components/card_library/`: Home Assistant integration, setup, storage and WebSocket API.
* `custom_components/card_library/frontend/`: Template card, library manager, original editor integration and popup handling.
* `custom_components/card_library/brand/`: Local HACS branding.
* `tests/`: JavaScript and Python regression tests.
* `publish.py`: First-publication workflow; documentation in [docs/PUBLISH.md](docs/PUBLISH.md).

See [CHANGELOG.md](CHANGELOG.md) for release notes. / Änderungen stehen in [CHANGELOG.md](CHANGELOG.md).

### Development / Entwicklung

```bash
python -m pip install -r requirements-dev.txt
npm test
python -m unittest discover -s tests -p 'test_*.py' -v
python tests/check_websocket_schemas.py
```

[HACS audit / HACS-Prüfbericht](docs/HACS-AUDIT.md)

### Thanks / Danke

Maintained by **[@Baeka89](https://github.com/Baeka89)**. Thanks to Home Assistant and the authors of the original card editors, [Bubble Card](https://github.com/Clooos/Bubble-Card) and [Family Calendar Card](https://github.com/Baeka89/family-calendar-card).

### License / Lizenz

[MIT License](LICENSE). External cards retain their own licenses. / Fremde Karten behalten ihre eigenen Lizenzen.

### Projekt-Logo / Project icon

Das freigegebene Logo liegt als `brand/icon.png` (256 px) und `brand/icon@2x.png` (512 px) in der Integration. Home Assistant 2026.3+ lädt diese lokalen Dateien für die Integrationsübersicht. Aktuelle HACS-Versionen nutzen die HA-Brand-Anzeige. Nach Installation oder Aktualisierung HA neu starten und den Browsercache bei Bedarf leeren. Die Sichtbarkeit vor der Installation hängt vom verwendeten HACS-/Marketplace-Index ab; ein lokales Projektupdate veröffentlicht das Logo noch nicht.

The approved icon ships inside the integration as `brand/icon.png` (256 px) and `brand/icon@2x.png` (512 px). HA 2026.3+ serves these local assets for the integrations overview. Current HACS versions use HA branding. Restart HA after updating and clear the browser cache if necessary. Visibility before installation depends on the HACS/Marketplace index; updating this local project does not publish the icon.
