# BRYC Admissions — Version 18 / RAM Workspace

Built on Version 17. The public Admissions website and public form logic are unchanged.

## New internal workspace
- Authorized Google sign-in + UID-based Firestore `staffAccess` verification inherited from V17.
- Recruitment dashboard, pipeline counts, filters, fictional prospects and applications, and review drawer.
- In-page demo status/decision changes; follow-up completion; school directory search.
- Fellows tab remains intentionally empty until vetted migration.

## Security boundary (important)
**All demo records are hard-coded fictional objects in `ram-workspace.js`. They are NOT Firestore documents.** No sample student records are transmitted, saved, or uploaded. Changing a status resets on refresh. Public inquiry/application submissions remain preview-only and disabled. `firestore.rules` is a reference file, not a deployment action. Do not overwrite your deployed, tested `staffAccess` rules with any zip rule file.

Real record authorization is NOT implemented. The HTML and hardcoded fictional data are present in a public repository; login hides their UI but is not protection for secrets. Never put genuine student data in client-side code. Authentication and database authorization must be enforced in Firestore rules before any real-data features are added.

## Deploy
1. Unzip and upload the **contents** to GitHub `development/recruitment-hub` branch; overwrite matching files.
2. GitHub Pages should serve that branch's root; allow deployment to complete.
3. Open the GitHub Pages HTTPS URL, Staff Access, sign in with your previously-approved BRYC Google account.
4. Try filters, review drawers, changing demo status, completing a demo follow-up. Refresh and verify changes reset.
5. Sign out and verify the workspace is hidden.

**Cost:** No added paid service; GitHub Pages and Firebase Spark remain in use.
