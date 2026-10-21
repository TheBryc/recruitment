# BRYC Admissions — V17 Firebase login test

The Firebase **public web-app config** is now wired in. This is still a **fictional-data-only**, no-submissions testing release with zero paid components.

## Test safely
1. Test from an HTTPS web origin (e.g., the project's GitHub Pages development preview), not a local file (`file://`). Google popup auth usually requires a web origin.
2. In Firebase Console > Authentication > Sign-in method, confirm Google provider enabled. In Authentication > Settings > Authorized domains, confirm the exact test hostname (e.g. `thebryc.github.io` if using GitHub Pages) is authorized; do not authorize untrusted domains.
3. Click **Staff access**, then **Sign in with Google**.
4. A verified `@thebryc.org` identity may sign in, but **RAM workspace access must still be denied** because current Firestore production security rules remain deny-all. This is EXPECTED.
5. Test a non-BRYC Google identity: RAM workspace must remain locked.
6. Click Sign out.

## Important safeguards
- **Do not change Firestore rules** for the login smoke test. The staging rules file (`firestore.staff-access.STAGED.rules`) is NOT automatically deployed and requires separate review/testing.
- **Do not use real student or guardian information**, because local application preview isn't a production storage workflow.
- No actual student data is in the ZIP. The staff workspace only has fictional static cards.
- Google authentication may create an Authentication user entry in Firebase for the test account; this is not a Firestore document.
- Google sign-in does **not** authorize RAM access. Email/domain checks are supplementary; the UID-keyed Firestore authorization document and server-enforced security rules must also pass.
- GitHub Pages is public; do not place credentials, student data or sensitive records in this ZIP or repo.
- Existing GitHub branch/hosted site has **not** been updated.

The Firebase web API key is an app identifier commonly included in publicly served browser code; it is **not** a server-admin key. Firebase Auth and Firestore rules are the actual access controls.
