Grand RP POV Checker V34

YouTube OAuth uses a robust same-page Google redirect fallback so it does not depend on browser popups.

ONE-TIME GOOGLE CLOUD SETUP
Add this exact Authorized redirect URI to the Web application OAuth client:
https://felixsp2003.github.io/grandrp-pov-checker/

The Authorized JavaScript origin remains:
https://felixsp2003.github.io

After Google redirects back, the app reads the access token from the URL fragment, validates state, removes the fragment, and stores the token for the current browser session.

The app keeps YouTube uploads unlisted. OCR starts only after the upload reaches 100%.
