# Grand RP POV Checker V25

Rebuilt OCR pipeline focused on correctness:
- Target ID is strictly 1–6 digits and comes from the target after `hat ... [ID] ... für`.
- Administrator IDs are never accepted as target IDs.
- Reason is classified only against the allowed list.
- SC is the second long identifier after the IP inside the same ban block; offline players may have no IP/SC.
- Server is read from the yellow top-right badge only.
- Date is read from the bottom-right HUD.
- Missing/ambiguous values remain empty and can be checked from a new POV tab at the relevant timestamp.
- POV is only renamed after the record is fully processed and saved.
- CSV export: Proof, Datum, ID, SOC(blank), RID=SC, Discord ID, Familie(blank), Grund.
