Grand RP POV Checker V30

YouTube OAuth fixes:
- Google Identity Services is loaded synchronously before app.js.
- OAuth waits for google.accounts.oauth2 and shows a visible status/error.
- The button calls requestAccessToken() from the user's click, which is what opens Google's consent/login popup.
- app.js and CSS use cache-buster v30.
- connect handler no longer starts POV processing; it only authenticates YouTube.

Workflow remains: YouTube upload -> 100% -> local OCR -> manual review -> final filename/title.
