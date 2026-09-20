# Grand RP POV Checker V41

Fixes in V41:
- Defines the missing `setEditorValues()`, `setFieldStatus()` and `renderTitlePreview()` functions.
- Restores the POV review modal after OCR completes.
- Manual field selection can update the review window without runtime errors.
- Uses V41 cache/database/meta keys to avoid stale V37 browser state.
- Keeps the YouTube redirect OAuth flow and callback files.
- Keeps target-ID max 6 digits, closed reason list, SC ordering rule, offline handling and server 3 workflow.

Files:
- index.html
- app.js
- styles.css
- manual.html
- oauth-callback.html
- README.md


V41: SC and Discord ID manual-selection buttons are always available; their click handlers are wired directly in the editor.
