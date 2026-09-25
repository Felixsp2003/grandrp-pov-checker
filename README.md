# Grand RP DC Checker V120 + ACP V93

## V120 Änderungen
- Der zuletzt aktive Tab wird über URL-Hash sowie localStorage/sessionStorage gespeichert und beim Reload wiederhergestellt.
- Zusätzlich wird der aktive Tab bei `visibilitychange`, `pagehide`, `hashchange` und `beforeunload` persistiert.
- Lokale Archivdaten bleiben geschützt und werden nicht automatisch gelöscht.
- Für eine Aufbewahrung über eine Browser-Deinstallation hinaus gibt es jetzt eine browserunabhängige Google-Drive-Sicherung.
- Google Drive speichert das Archiv-Manifest und lokale POV-Dateien. Große Dateien werden per resumable upload übertragen.
- Nach einer Neuinstallation: dieselbe Google OAuth Client-ID verwenden, Google Drive erneut autorisieren und bei leerem lokalen Archiv wird das Cloud-Archiv automatisch zur Wiederherstellung angeboten/geladen.

## Einmalige Google-Drive-Einrichtung
1. In Google Cloud beim verwendeten OAuth-Projekt die Google Drive API aktivieren.
2. In der Website unter Einstellungen eine vorhandene Google OAuth Client-ID verwenden.
3. `Google Drive verbinden` klicken und die Drive-Berechtigung bestätigen.
4. Mit `Jetzt alles sichern` können bereits vorhandene lokale POVs vollständig in Drive gespiegelt werden. Danach wird bei neuen gespeicherten POVs automatisch nachgesichert.

Wichtig: Browser-localStorage und IndexedDB können eine Browser-Deinstallation nicht überleben. Deshalb muss für browserunabhängige Aufbewahrung die Cloud-Sicherung genutzt werden. Die Dateien bleiben in deinem Google-Drive-Konto erhalten, unabhängig vom lokalen Browserprofil.

ACP V93 wurde gegenüber der vorherigen Version nicht verändert.
