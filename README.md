# Grand RP POV Checker

Online-freundliche Web-App für den persönlichen Grand-RP-POV-Workflow.

## Präzisions-OCR

Die Analyse wartet, bis die komplette Videodatei geladen werden kann, und untersucht anschließend nur die letzten 40 Sekunden. Für die Grand-RP-Oberfläche werden getrennte Bereiche verwendet:

- links oben: Administrator-/Bannzeile, Ziel-ID, Grund und SC
- rechts oben: gelbe Server-Plakette
- rechts unten: Datum

Die Erkennung wird über mehrere Frames wiederholt. Werte werden nur automatisch übernommen, wenn die Übereinstimmung ausreichend ist; ansonsten öffnet sich die manuelle Prüfung. Eine OCR kann technisch nie eine 100%-Garantie geben, daher wird bei Unsicherheit bewusst nicht geraten.

## YouTube

OAuth-Client-ID in den Einstellungen eintragen und mit dem YouTube-Konto verbinden. Uploads werden als `unlisted` angelegt.
