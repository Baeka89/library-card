# Changelog

All notable changes to this project are documented here. / Alle wesentlichen Projektänderungen sind hier dokumentiert.

## [0.5.0]

### English 🇺🇸

#### Added

- First public release of Library Card for Home Assistant.
- Central templates for built-in cards, installed custom cards, complete stacks and supported header/footer configurations.
- Original graphical card editors, direct YAML input and import of existing dashboard cards.
- Linked reuse: central template changes update every linked use while preserving local exceptions.
- Flexible inheritance of complete configurations, marked design fields or selected fields, with local entity and style overrides.
- Shared groups and person colors across multiple templates.
- Original Bubble Card popups opened through hash buttons without an extra dashboard card; multiple hash links with individual local settings.
- JSON library import/export, history, restoration and checks for known dashboard uses before deleting templates.
- Separate insertion and configuration workspaces, with German and English library UI.
- HACS/Hassfest validation workflows and JavaScript/Python regression tests.

#### Documentation

- Bilingual README with language navigation, HACS installation, template and popup guides, support links and technical components.
- Bilingual changelog and matching release notes.

#### Requirements

- Home Assistant 2024.7.0 or newer. Install custom cards and card-mod separately when used.
- Bubble popups require Bubble Card 3.2.0 or newer with standalone popup support.
- Existing library data retain the `card_library` domain and storage format. Resource: `/card_library/card-library.js?v=0.5.0`.

### Deutsch 🇩🇪

#### Hinzugefügt

- Erste öffentliche Veröffentlichung von Library Card für Home Assistant.
- Zentrale Vorlagen für HA-Karten, installierte Custom Cards, vollständige Stacks und unterstützte Kopf-/Fußzeilen.
- Originale grafische Karteneditoren, direkte YAML-Eingabe und Übernahme vorhandener Dashboard-Karten.
- Verknüpfte Verwendung: zentrale Änderungen aktualisieren alle Verwendungen; örtliche Ausnahmen bleiben erhalten.
- Flexible Übernahme vollständiger Konfigurationen, markierter Designfelder oder ausgewählter Felder mit örtlichen Entitäts- und Style-Ausnahmen.
- Gemeinsame Gruppen und Personenfarben für mehrere Vorlagen.
- Originale Bubble-Card-Popups über Hash-Buttons ohne zusätzliche Dashboard-Karte; mehrere Hash-Verknüpfungen mit eigenen örtlichen Einstellungen.
- JSON-Import/Export der Bibliothek, Verlauf, Wiederherstellung und Prüfung bekannter Dashboard-Verwendungen vor dem Löschen.
- Getrennte Arbeitsbereiche für Einsetzen und Konfiguration sowie deutsche und englische Bibliotheksoberfläche.
- HACS-/Hassfest-Prüfungen und JavaScript-/Python-Regressionstests.

#### Dokumentation

- Zweisprachige README mit Sprachwahl, HACS-Installation, Vorlagen- und Popup-Anleitungen, Unterstützung und technischen Komponenten.
- Zweisprachiges Changelog und dazu passende Release-Beschreibung.

#### Voraussetzungen

- Home Assistant ab 2024.7.0. Genutzte Custom Cards und card-mod separat installieren.
- Bubble-Popups benötigen Bubble Card ab 3.2.0 mit Standalone-Popup-Unterstützung.
- Bestehende Bibliotheksdaten behalten Domain und Speicherformat `card_library`. Ressource: `/card_library/card-library.js?v=0.5.0`.
