# Grand RP DC Checker V107

Webseite + ACP v93.

## V107 Änderungen
- Fix für Archiv-Backup herunterladen/wiederherstellen.
- `index.html` lädt die aktuelle `app.js?v=107`, damit kein alter Browser-Cache die Backup-Buttons blockiert.
- Backup wartet auf das Laden des Archivs.
- Backup sammelt die dauerhaft gespeicherten Archiv-Einträge aus IndexedDB/Recovery-Snapshots und localStorage.
- Wiederherstellen öffnet die Dateiauswahl zuverlässig über `showPicker()` bzw. Fallback auf `click()`.
- Wiederherstellung wird nach localStorage und IndexedDB geschrieben und anschließend direkt im Archiv angezeigt.
- Automatische Löschungen des Archivs bleiben ausgeschlossen; Löschen erfolgt nur über die ausdrücklich vorhandenen Nutzeraktionen.

### Hinweis
Ein JSON-Backup enthält Archiv-Metadaten. Es kann lokale POV-Videodateien nicht neu erzeugen, wenn diese bereits vom Browser/Profil gelöscht wurden.


V111: Die Archiv-Wiederherstellung nutzt jetzt einen echten nativen Datei-Input direkt über dem sichtbaren Button. Dadurch ist kein programmgesteuertes input.click() für den Datei-Dialog nötig. ACP V93 bleibt unverändert.


V111 fixes the missing renderCsv function and persists the selected website tab via URL hash + storage. Archive restore uses a native label/file input. ACP remains V93.


## V114
- Fehlermeldung „renderCsv is not defined“ behoben; CSV-Rendering ist wieder vollständig vorhanden.
- Backup-Wiederherstellung liest die ausgewählte JSON-Datei vollständig per `File.text()` ein, entfernt UTF-8-BOM und akzeptiert `entries`, `archive` sowie `data.entries`.
- Das bisherige Recovery-Format `grandrp-recovery-backup` mit 35 Einträgen wird direkt unterstützt.
- Wiederherstellung führt Einträge nach ID mit dem dauerhaft gespeicherten Archiv zusammen und löscht niemals automatisch bestehende Daten.
- Der native Datei-Input liegt als transparente Fläche direkt über dem sichtbaren Wiederherstellen-Button; dadurch öffnet der normale Chrome-Dateidialog ohne `input.click()`-Workaround.
- Nach Auswahl wird der Dateiname angezeigt; nach erfolgreicher Einlesung wird die Anzahl der eingelesenen Einträge gemeldet.
- Der aktive Website-Tab wird über URL-Hash sowie Session-/Local-Storage wiederhergestellt.
- ACP bleibt V93 unverändert.


V114: Archiv-Backup wird nach Dateiauswahl sofort eingelesen; Datei-Input wird zurückgesetzt, damit dieselbe JSON erneut gewählt werden kann. Cache-Busting auf app.js/styles.css V114. Aktiver Tab wird zusätzlich vor Seitenwechsel/Refresh persistiert. ACP bleibt V93.


V114: Native Backup-Import mit lokaler Pending-Sicherung; Wiederherstellung setzt Filter/Suche zurück, zeigt das Archiv sofort und verarbeitet ausstehende Backups beim Boot. ACP V93 unverändert.
