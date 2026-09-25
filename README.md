# Grand RP DC Checker V119

Webseite: V119
ACP: V93 (unverändert)

## Reparaturen
- Archiv-Backup-Wiederherstellung arbeitet unabhängig von der übrigen Settings-Initialisierung.
- JSON-Backup wird direkt eingelesen und als autoritativer Archivstand gespeichert.
- Kompatibilität mit `grandrp-recovery-backup` und 35-Einträge-Recovery-Datei geprüft.
- Backup-Download liest dauerhaft gespeicherte Archivdaten und erzeugt eine JSON-Datei.
- Lokales Archiv-Löschen ist weiterhin ausschließlich durch expliziten Benutzerklick möglich.
- Einzelnes Löschen im Archiv hat eine öffentliche Fallback-Brücke.
- Aktiver Tab wird über Hash + SessionStorage + localStorage gespeichert und nach Reload wiederhergestellt.
- Cache-Busting: `app.js?v=119`, `styles.css?v=119`.

## Durchgeführte Tests
- `node --check app.js`: OK
- Recovery-Datei: gültiges JSON, Format `grandrp-recovery-backup`, 35/35 gültige IDs
- Standalone-Backup-Controller-Test: Restore 35 Einträge, Download-Payload 35 Einträge, Einzel-Löschen 34, Komplett-Löschen 0
- ACP-V93-Dateien: bytegenau unverändert gegenüber V118
