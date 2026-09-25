Grand RP DC Checker V109

Website-Fix für Archiv-Backups:
- Restore verwendet einen echten nativen input[type=file] innerhalb des sichtbaren Buttons. Dadurch öffnet Chrome direkt den Windows-Dateiauswahldialog.
- Kein programmgesteuertes input.click() mehr für die Restore-Schaltfläche.
- Backup-Download und Restore-Funktionen werden sofort global bereitgestellt und sind nicht von der restlichen Einstellungs-Initialisierung abhängig.
- Download hat zusätzlich einen localStorage-Fallback, falls das Archivobjekt gerade noch nicht im UI geladen ist.
- ACP bleibt auf V93 und wird nicht verändert.

Wichtig: Ein JSON-Backup enthält Archiv-Metadaten. Es kann lokale POV-Dateiblobs nicht neu erzeugen, falls Chrome diese bereits aus dem Browserprofil gelöscht hat.
