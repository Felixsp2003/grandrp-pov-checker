# Grand RP POV Checker V42

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


V42: YouTube-Verarbeitung ist jetzt ein harter Verarbeitungsschritt. Nach dem vollständigen Upload wird `videos.list(part=processingDetails,status)` gepollt und OCR startet erst bei `processingStatus = succeeded` bzw. `uploadStatus = processed`. Die OCR verwendet weiterhin die lokale Originaldatei, damit keine zusätzliche YouTube-Transkodierung die Pixelqualität verschlechtert.


V42 fixes: OCR is hard-gated on YouTube processingStatus=succeeded only (never uploadStatus=processed). Manual video picker keeps playback/seeking controls usable; drawing is an explicit mode.
