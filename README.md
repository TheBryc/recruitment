# BRYC Admissions — Version 19 (fictional-data persistence test)

This ZIP includes the public Version 15 application, approved Version 18 fictional RAM workspace, working Google authentication and authorization, and a new **opt-in Firestore sandbox**. The public application still collects nothing.

## Strict boundaries
- Do not upload real students, documents, guardian information, or confidential data.
- `firestore.rules` remains the original deny-all illustrative file from earlier versions. **It does NOT reflect current live rules. Never publish it.**
- `firestore.ram-sandbox.STAGED.rules` is a proposed *full replacement* preserving staffAccess and denying all real data. It is not deployed and must be audited and tested before publishing.
- Only a verified `@thebryc.org` user with a matching, active, UID-bound `ram_admin` record can read and write their own sandbox.
- Seed fixture insertion requires an explicit click. Other staff cannot access the sandbox. No public database submissions are enabled.
- The sandbox is account-scoped, not a shared production admissions database. It is not suitable for actual student records.

## Intended sequence
1. Update the GitHub development branch with extracted contents (do not upload real data or any keys).
2. Confirm public site and existing staff login still work. With existing deployed rules, the RAM dashboard will continue in session-only mode.
3. Use `SECURITY_TEST_PLAN.md` to audit the staged rules and test Firestore permissions; do NOT publish before passing all tests.
4. After independently testing and publishing the approved replacement policy, reload staff workspace, click **Initialize fictional test records**, change one sample decision and reload to verify persistence.

No Cloud Functions, Storage, Blaze billing, or service account is used. Firebase Spark quotas and availability limits still apply.

## Automated rules tests
`tests/rules.test.mjs` covers every case in `SECURITY_TEST_PLAN.md` (plus the full Initialize batch) against the Firestore emulator. Requires Node and Java.

```
cd tests && npm install && npm test
```
All 21 tests must pass before deploying `firestore.ram-sandbox.STAGED.rules`. `firebase.json` at the root only configures the emulator for these tests.
