Grand RP DC Checker V132

YouTube/Drive OAuth is now isolated by explicit state prefixes and separate pending/result keys. Both flows use a stable root callback URL. YouTube requests only YouTube scopes; Drive requests only drive.file. ACP V93 unchanged.


V132: YouTube- und Google-Drive-OAuth verwenden den Google Identity Services Token-Popup-Flow ohne redirect_uri.

V132 Fix: Google Drive manifest updates no longer send the read-only `parents` field in PATCH requests. `parents` is sent only when creating the file.
