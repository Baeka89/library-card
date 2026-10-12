# HACS-Prüfbericht · öffentliche Version v0.5.0

Geprüft am 12.10.2026 anhand der aktuellen primären Quellen:

- [Allgemeine Anforderungen](https://www.hacs.xyz/docs/publish/start/)
- [Integration veröffentlichen](https://www.hacs.xyz/docs/publish/integration/)
- [Standardaufnahme](https://www.hacs.xyz/docs/publish/include/)
- [Aktuelle Antragsvorlage](https://github.com/hacs/default/blob/master/.github/PULL_REQUEST_TEMPLATE.md)
- [HACS-Brand-Prüfung](https://github.com/hacs/integration/blob/main/custom_components/hacs/validate/brands.py)
- [HA-Manifest](https://developers.home-assistant.io/docs/creating_integration_manifest/)

## Ergebnis

Der lokale Projektstand ist für die Veröffentlichung vorbereitet. Eine Aussage
„alle Anforderungen bereits zu 100 % erfüllt“ wäre vor Repository-Erstellung,
erfolgreichen GitHub-Prüfungen und Release falsch. Das Skript macht diese offenen
Schritte zu verbindlichen Voraussetzungen und reicht vorher keinen Antrag ein.

| Anforderung | Lokaler Stand / Skriptprüfung |
| --- | --- |
| Eine Integration pro Repository, Laufzeitdateien im Integrationsordner | `custom_components/card_library` enthält Backend, sieben Frontend-Module, Übersetzungen und Brand-Dateien |
| Gültiges Manifest mit Name, Domain, Version, Doku, Issues und Codeowner | Vorbereitet; tatsächliche GitHub-Identität und URLs werden vor Upload gesetzt und geprüft |
| HACS-Metadaten im Repository-Root | `hacs.json` mit Name und HA-API-Minimum, Standard-Integrationsstruktur |
| Brand-Icon | Originale PNGs in `custom_components/card_library/brand`; der aktuelle HACS-Validator akzeptiert diese lokalen Assets |
| Kein Override einer HA-Core-Integration | Domain `card_library`; echte Hassfest-Prüfung meldet keine Kollision |
| Öffentliches aktives GitHub-Repository | Wird erstellt; vorhandene private/archivierte/fremde Repositories werden nicht übernommen |
| Beschreibung, Topics und Issues | Werden per GitHub-API gesetzt; HACS prüft die Remote-Metadaten |
| HACS Action ohne ignorierte Prüfungen | Workflow vorhanden, kein `ignore`; erfolgreiche Jobs für denselben Commit erforderlich |
| Hassfest | Echte aktuelle Hassfest-Containerprüfung lokal bestanden; zusätzlicher erfolgreicher GitHub-Lauf erforderlich |
| Vollständiges Release nach erfolgreichen Actions | Skript prüft Tag/Commit, stabile Veröffentlichung, Dateien, Prüfsummen und Zeitfolge |
| Berechtigter Einreicher und editierbarer PR | Automatisierung verwendet dein persönliches authentifiziertes Konto; Fork liegt dort, Standardbearbeitung durch Maintainer bleibt erlaubt |
| Neuer Branch von `master`, alphabetischer Integrationseintrag | Skript prüft aktuelle Upstream-Struktur und ergänzt genau einen Eintrag; kein Force-Push |
| Vollständige aktuelle Checkliste und Beleglinks | Erst nach allen Nachweisen ausgefüllt; unbekannte Checklistenänderungen brechen ab |
| Lizenz | MIT wie vom Autor gewählt; keine fremden Kartenquellen oder privaten Screenshots gebündelt |
| Länderbeschränkung | Software ist nicht auf Länder beschränkt; kein `country` erforderlich |

## Bekannte Abgrenzungen

Ein weiterer PR zu `home-assistant/brands` ist nach dem aktuell geprüften lokalen
Brand-Verfahren nicht erforderlich. Die erste öffentliche Nummer wird als
`v0.5.0` veröffentlicht, Manifest/Modul-URLs enthalten `0.5.0`.
Die Integration behält ihre vorhandene Domain und Speicherstruktur.

Originale Kalenderbeispiele wurden konsistent auf generische Personen- und
Kalenderkennungen umgestellt. Ältere interne Entwicklungsberichte und ein privater
Kalender-Screenshot sind nicht Teil des öffentlichen Pakets. Die eigenen Karten
und deren Verhalten bleiben erhalten; die öffentlichen Metadaten und der
Einrichtungstext heißen „Library Card“.

GitHub-Anmeldung, Konto-Berechtigungen, Rate Limits und spätere Richtlinienänderungen
lassen sich nicht offline bestätigen. Die Aufnahmeentscheidung liegt bei HACS.
Das Skript überspringt keine fehlgeschlagenen offiziellen Prüfungen und beantragt
keine Reviews bei Maintainer-Personen.
