Grand RP POV Checker V35

YouTube-Verbindung wurde auf einen robusten Full-Page-Redirect umgestellt. Kein Popup, kein GIS-Token-Client nötig.

EINMALIG IN GOOGLE CLOUD
Autorisierte JavaScript-Quelle:
https://felixsp2003.github.io

Autorisierte Weiterleitungs-URI (EXAKT):
https://felixsp2003.github.io/grandrp-pov-checker/oauth-callback.html

Die Weiterleitungs-URI muss Zeichen für Zeichen mit der Google-OAuth-Konfiguration übereinstimmen.

ABLAUF
1. Client-ID eintragen.
2. Mit YouTube verbinden.
3. Die Website öffnet die Google-Autorisierung im aktuellen Tab.
4. Nach Freigabe geht es zu oauth-callback.html.
5. Das Zugriffstoken wird für diese Browsersitzung gespeichert.
6. Danach zurück zur Website.
7. Erst beim echten POV-Upload wird die YouTube-API mit dem Token benutzt.

Hinweis: Der direkte Token-Redirect ist ein Legacy-Webflow. Für eine moderne OAuth-Code/PKCE-Implementierung wäre ein Backend nötig. Diese statische GitHub-Pages-Variante bleibt bewusst ohne Server.
