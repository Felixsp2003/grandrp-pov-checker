# Grand RP DC Checker V93 + ACP Bridge V88

## Website V93
- ACP-Ablauf zweistufig: zuerst Social Club aus Authorization, Tab schließen, danach Character-Info neu öffnen und BannGrund aus dem roten Bannbereich übernehmen.
- 2,5 Sekunden Ladezeit vor dem BannGrund-Scan.
- Queue: `Prüfen` und `Nächste POV` bleiben bedienbar, sobald OCR-Ergebnisse vorhanden sind; der Status der laufenden Verarbeitung wird separat geprüft.
- Warteschlange/Archiv/POV-Dateien/YouTube-Verbindungen werden lokal dauerhaft gespeichert.
- Drei YouTube-Verbindungen mit Fallback bleiben erhalten.

## ACP Bridge V88
- Character-ID aus `characterid` und aus `/character/info/<ID>`.
- BannGrund wird gezielt aus dem roten/orangefarbenen "Important information"-Block gelesen, bevorzugt über die `Reason:`/`Grund:`-Zeile.
- Bridge-Tabs werden über den Service Worker geschlossen; `window.close()` wird dafür nicht benötigt.

ACP-Bridge-Dateien: `acp-v88/`.
