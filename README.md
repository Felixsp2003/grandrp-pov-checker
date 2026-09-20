Grand RP POV Checker V33

YouTube OAuth V33:
- Uses Google Identity Services token client.
- Main connect button requests an access token with prompt="" after the user has already granted access.
- A separate re-authorize action can force consent.
- No await occurs between the button click and requestAccessToken().
- Visible diagnostic status is shown below the YouTube button.
- Cache-buster is V33 in index.html.

Workflow: YouTube upload -> 100% -> local OCR -> manual review -> final filename/title.
