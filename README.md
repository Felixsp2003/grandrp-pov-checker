# Grand RP POV Checker

Online-friendly static web app for GitHub Pages.

## Funktionen
- mehrere POVs gleichzeitig auswählen/drag & drop
- vollständige Datei wird zuerst gelesen, danach OCR der letzten 40 Sekunden
- OCR-Bereiche: links oben Bannzeile + SC, rechts oben Server, rechts unten Datum
- manuelle Korrektur, wenn Pflichtdaten fehlen
- mehrere Banntypen gleichzeitig
- Perma-Bann / Nicht gebannt
- automatische Dateinamenvorschau `ID, Grund, DD.MM.YYYY.ext`
- lokales Archiv mit IndexedDB für die Videodateien
- YouTube OAuth + Upload als `unlisted`

## GitHub Pages
Repository → Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## YouTube
In Google Cloud ein Projekt anlegen, YouTube Data API v3 aktivieren und einen OAuth-Client für eine Webanwendung konfigurieren. Die Client-ID in Einstellungen eintragen.

Hinweis: GitHub Pages ist statisch. Die POVs werden nicht auf GitHub gespeichert; die Browser-App liest die lokale Datei und lädt bei aktivierter YouTube-Verbindung direkt zu YouTube hoch. Archivdateien bleiben lokal im Browser.
