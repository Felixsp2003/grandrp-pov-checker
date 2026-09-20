# Grand RP POV Checker V26

Stabilitätsrelease der browserbasierten Grand-RP-POV-OCR-App.

## V26-Fixes
- fehlende `extractServerFromOcr`-Funktion ergänzt
- Server-OCR akzeptiert ausschließlich eine einzelne Ziffer `1–4`
- Ziel-ID darf ausschließlich 1–6 Ziffern enthalten; >6 Ziffern werden verworfen statt gekürzt
- Administrator-ID vor `hat` wird nicht als Ziel-ID verwendet
- SC/RID: IP zuerst, SC als zweite lange Hex-Kennung; Offline ohne IP => SC leer
- Hex-Normalisierung erhält echte A-F-Zeichen und verändert gültige `B`/`C`/`D`/`E`/`F` nicht
- Parser-/Fehlermeldungen stabilisiert
- Cache-Buster auf `app.js?v=26`
