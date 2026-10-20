# BRYC Recruitment Hub — GitHub staging candidate

This is a **design-only preview** intended for a development branch and team review. It is not ready for public collection of personal information.

## Included
- `index.html` public portal and staff preview
- `styles.css` responsive styles; Proxima Nova uses BRYC's Adobe Fonts web kit `oyd0hvb` (subject to authorized domains/licensing)
- `script.js` local navigation, student/guardian inquiry branching and application step navigation
- `firebase-integration.js` intentionally disabled until security review
- `firestore.rules` deny-all rule sample, **not deployed**
- `bryc-logo.png` official BRYC logo

## GitHub safety
- Upload to `development/recruitment-hub` branch, NOT `main`. The repository is PUBLIC and `main` may be served via GitHub Pages.
- Do not enable GitHub Pages or Firebase Hosting for this candidate, or merge into `main`, until reviewed.
- Do not upload spreadsheets, student names, contact lists, admin SDK keys, service account JSON or other secrets.
- The old onboarding portal should remain preserved on `main` and ideally a backup branch.

## Verification before launch
- Firebase Auth sign-in restricted by backend security rules (Google Sign-In alone is not enough)
- private applications and guardian information; server validated public submissions with abuse safeguards
- separate staging project or emulator with fictional data; permission tests
- verified School list and PY28 eligibility / actual application questions
- accessibility/mobile testing, privacy/consent policy, retention and audit process
- Cloud Storage restrictions and organizational approval
