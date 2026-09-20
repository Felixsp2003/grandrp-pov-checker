# Grand RP POV Checker V38

Fixes in V38:
- Defines the missing `setEditorValues()`, `setFieldStatus()` and `renderTitlePreview()` functions.
- Restores the POV review modal after OCR completes.
- Manual field selection can update the review window without runtime errors.
- Uses V38 cache/database/meta keys to avoid stale V37 browser state.
- Keeps the YouTube redirect OAuth flow and callback files.
- Keeps target-ID max 6 digits, closed reason list, SC ordering rule, offline handling and server 3 workflow.

Files:
- index.html
- app.js
- styles.css
- manual.html
- oauth-callback.html
- README.md
