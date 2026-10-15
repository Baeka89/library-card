# Library Card: Projekt-Logo

Das freigegebene Motiv verbindet einen Kartenstapel mit Kettenglied mit drei lokalen Karten.

- `custom_components/card_library/brand/icon.png`: 256 × 256 Pixel.
- `custom_components/card_library/brand/icon@2x.png`: 512 × 512 Pixel.
- Transparente PNGs; nur Größenanpassung des freigegebenen Motivs.
- Native lokale Logos: Home Assistant **2026.3 oder neuer**. Die Mindestversion für die übrige Integration bleibt 2024.7.
- Der HACS-Validator erkennt den lokalen `brand`-Ordner. Aktuelle HACS-Oberflächen verwenden Home Assistants Brand-Anzeige.
- Vor der Installation hängt die Anzeige vom jeweiligen Store-Index ab. Der aktuelle HA Marketplace bezieht lokale Logos unterstützter Integrationen aus deren veröffentlichtem Repository; Index- und Browsercache können verzögern. HACS-Aufnahme und Marketplace-Aufnahme sind separate Verfahren.
- Kein zusätzlicher `icon`-Eintrag im Manifest und keine zusätzliche Lovelace-Ressource nötig.
- Nach HACS-Update HA neu starten und Browser neu laden; ggf. Browsercache leeren.
- Ein GitHub-Release entsteht erst beim Ausführen des bereitgestellten Updateskripts auf dem PC.

Quellen (geprüft am 14.10.2026):

- https://developers.home-assistant.io/blog/2026/02/24/brands-proxy-api
- https://github.com/home-assistant/brands#marketplace-icons
- https://github.com/hacs/integration/blob/main/custom_components/hacs/validate/brands.py
