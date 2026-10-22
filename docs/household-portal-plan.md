# Household portal plan

Decisions as of October 22, 2026. Update this file as decisions change.

## Decided
- **Approval:** The CEO approved storing family data in the portal.
- **Cost must be $0.** Stay on Firebase's free Spark plan, with no card on file.
  - Accounts, applications, and statuses: Firebase Auth and Firestore (free).
  - Google Sheets sync: Google Apps Script attached to the sheet (included with Google Workspace).
  - Document uploads: a restricted Google Drive folder through Apps Script, not Firebase Storage (Storage requires the paid plan). The script verifies the family's Firebase login before accepting a file.
- **Current records live in Google Sheets.** The sheet stays the team's working view.
- **Two-way sync between the sheet and the RAM Workspace**, with these guardrails:
  - A hidden record ID column matches rows, so sorting and filtering are safe.
  - Only staff columns are editable in the sheet. Family-submitted columns are locked.
  - Status cells use dropdowns limited to the official values.
  - When both change at once, the most recent change wins. A "Change log" tab records every change.
  - Deleting a sheet row does not delete a record.
- **Only Forrest can change application status**, in both the sheet (protected range) and the workspace (security rules).
- **Not using Google Forms.** It can't do family accounts, status tracking, or uploads without a Google sign-in.

## Phases
1. **Accounts, applications, and status.** Families create an account, add one or more students, apply, and track each application. Staff work in the RAM Workspace, synced with the sheet.
2. **Onboarding.** After admission, families complete a checklist in the portal. Staff see completion.
3. **Income verification.** The family uploads the 1040, and staff confirm the AGI. The portal keeps only the AGI amount, the result, the verifier, and the date. The document is deleted automatically after a short window (proposed: 30 days).

## Open items
- [ ] Merge TheBryc/recruitment#2 (public redesign, household interest form, guardian relationship on the application).
- [ ] Confirm the sheet columns staff can edit. Proposed: status (Forrest only), assigned staff, next step, notes.
- [ ] Share the current Google Sheet's column headers, so the import and export match what the team uses today.
- [ ] School list: is "McKanstry Prepatory School" spelled correctly? Are "EBR Virtual K–12" and "East Baton Rouge Virtual Academy" the same school?
- [ ] Before real data: deploy the tested security rules, and test the full flow with fictional records only.
