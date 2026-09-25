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
