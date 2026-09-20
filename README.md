# Grand RP POV Checker V50

Fixes in V40:
- Defines the missing `setEditorValues()`, `setFieldStatus()` and `renderTitlePreview()` functions.
- Restores the POV review modal after OCR completes.
- Manual field selection can update the review window without runtime errors.
- Uses V40 cache/database/meta keys to avoid stale V37 browser state.
- Keeps the YouTube redirect OAuth flow and callback files.
- Keeps target-ID max 6 digits, closed reason list, SC ordering rule, offline handling and server 3 workflow.

Files:
- index.html
- app.js
- styles.css
- manual.html
- oauth-callback.html
- README.md


V40: SC and Discord ID manual-selection buttons are always available; their click handlers are wired directly in the editor.


V46: YouTube-Verarbeitung ist jetzt ein harter Verarbeitungsschritt. Nach dem vollständigen Upload wird `videos.list(part=processingDetails,status)` gepollt und OCR startet erst bei `processingStatus = succeeded` bzw. `uploadStatus = processed`. Die OCR verwendet weiterhin die lokale Originaldatei, damit keine zusätzliche YouTube-Transkodierung die Pixelqualität verschlechtert.


V46 fixes: OCR is hard-gated on YouTube processingStatus=succeeded only (never uploadStatus=processed). Manual video picker keeps playback/seeking controls usable; drawing is an explicit mode.


V46: YouTube OAuth now requests both youtube.upload and youtube.readonly. The processing gate polls videos.list?part=processingDetails,status and will never start OCR when the read scope is missing. Existing V42 tokens must be reauthorized once via ‘Berechtigung erneut’.

- Banntypen: Hardban, Soc-Ban, Cheater, Negativ, Verweigert, PC-Check.


V50 LAST FIX / Systemtest:
- OCR scan uses both normal grayscale and orange-chat OCR, with a wider chat ROI and additional precision frames.
- Target-ID parser tolerates OCR variants such as `fur`, `fiir`, `fuer` and also works when the target ID brackets are missed. Admin IDs before `hat` are excluded.
- Reason detection also works when OCR misses `Grund:`.
- SC extraction removes the IPv6 address before searching and avoids joining arbitrary reason text into a 40-character SC.
- YouTube upload is resumable in 16 MiB chunks and explicitly tracks the exact source byte size. OCR still starts only after YouTube processing succeeds.
- After YouTube processing, the API file size is compared with the original source size when YouTube exposes it.
- Final local filename creation is byte-size checked so renaming cannot silently change the uploaded file.
- Manual picker displays original file size and video resolution.

Automated tests performed: JS syntax check, OCR parser regression tests for Ziel-ID/Grund/SC/offline cases, a generated 1280x720 MP4 frame OCR test, and a byte-for-byte File rename size check.


V50 additional fixes:
- General OCR and restricted SC/date OCR now use separate Tesseract workers, so a whitelist cannot leak into the next target-ID/reason scan.
- YouTube resumable upload now resumes from the server-confirmed byte offset instead of ever skipping a partially received chunk; transient network/5xx/429 failures are retried.
- Source byte size is displayed in the archive and remains checked before/after final local naming.
- Added reasons: PC Check Trolling and ACC 1.4 (Twink).

V50 tests:
- `node --check` für app.js und alle Inline-Skripte in index.html, manual.html und oauth-callback.html: OK.
- Parser-Regressionsfälle: Ziel-ID 172718, PC Check Verweigert, PC Check Trolling, ACC 1.4 (Twink), Offline ohne SC: OK.
- Test-POV 1280×720 / 2 s per System-OCR ausgewertet; Ziel-ID und Grund wurden aus der breiteren Ban-ROI korrekt erkannt, SC/Online-Erkennung vorhanden: OK.
- Resumable-Upload-Simulation mit 8 MiB Chunks und absichtlichem 308-Teilempfang: Bytefolge nach Resume 1:1 identisch zur Quelldatei: OK.


V50: Dateigrößen werden als echte Byte-Größe aus der Quelldatei/IndexedDB geprüft. Vor dem YouTube-Upload wird die lokale Kopie gegen Größe sowie Anfang/Ende der Datei verifiziert; während des resumable Uploads wird die Quellgröße nicht verändert und nach der YouTube-Verarbeitung mit fileDetails.fileSize verglichen. Die Archivanzeige repariert alte, veraltete sourceSize-Werte aus der tatsächlich gespeicherten POV-Datei.


V50 OAuth-Fix: YouTube-Access-Tokens werden vor Ablauf überwacht und bei HTTP 401 automatisch per Google Identity Services erneuert. Upload, Upload-Status, Verarbeitungsprüfung und Titel-Update verwenden danach den neuen Token.
