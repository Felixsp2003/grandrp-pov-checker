# Grand RP POV Checker

Eine kostenlose, lokal laufende Web-App für deinen persönlichen POV-Workflow.

## Was sie kann

- POV per Drag & Drop / Dateiauswahl
- wartet auf die komplette Datei, bevor die Analyse startet
- analysiert die letzten 40 Sekunden
- OCR lokal im Browser (Tesseract.js)
- sucht links oben nach Bannzeile
- versucht Ziel-ID, Grund und SC zu erkennen
- versucht rechts oben die Servernummer zu erkennen
- versucht rechts unten das Datum zu erkennen
- wenn die OCR nichts Sicheres findet: Felder bleiben offen und können manuell ausgefüllt werden
- Bann-Typ: Hardban, Soc-Ban, Cheater, Negativ
- Perma-Bann / Nicht gebannt
- Titel automatisch: `ID, Grund, Datum`
- Archiv und Suche lokal im Browser
- optionaler YouTube-Upload als **nicht gelistet**

## Wichtig zu YouTube

Die App ist absichtlich ohne eigenen Server gebaut. Deine POV bleibt bei der OCR auf deinem PC. Für YouTube brauchst du einmalig ein Google-Cloud-Projekt und einen OAuth-Client.

1. Google Cloud Console öffnen.
2. Ein Projekt anlegen.
3. YouTube Data API v3 aktivieren.
4. OAuth-Client für eine Webanwendung anlegen.
5. Als "Authorized JavaScript origins" die URL eintragen, unter der du die Website betreibst.
6. Die Client-ID in `Einstellungen` eintragen.
7. "Mit YouTube verbinden" drücken.
8. Google-Zugriff auf `youtube.upload` erlauben.

Die App setzt beim Upload `privacyStatus: unlisted`.

### Wenn du sie kostenlos online stellen willst

Du kannst die drei Dateien `index.html`, `styles.css` und `app.js` z. B. auf GitHub Pages veröffentlichen. Es wird kein eigener Server und keine Datenbank benötigt.

### Einschränkungen

- OCR ist abhängig von Auflösung, Schrift, Kompression und Overlay.
- Bei sehr langen/großen POVs kann die lokale OCR CPU/RAM benötigen.
- Die OCR wird aktuell auf 10 Frames verteilt über die letzten 40 Sekunden ausgeführt. Das lässt sich unter Einstellungen erhöhen.
- Für sehr große Dateien verwendet der YouTube-Teil resumable uploads.
- Google kann für API-Projekte Einschränkungen für Uploads bzw. Verifizierung/Quota anwenden. Das ist eine YouTube/Google-Regel und kein Kostenpunkt der Website.

## Anpassung an dein Overlay

Die OCR-Crops sind in `app.js` definiert:

- links oben: `x:0,y:0,w:.62,h:.38`
- rechts oben: `x:.62,y:0,w:.38,h:.30`
- rechts unten: `x:.68,y:.70,w:.32,h:.30`

Wenn dein Grand-RP-Overlay an einer anderen Stelle sitzt, können diese drei Bereiche angepasst werden.
