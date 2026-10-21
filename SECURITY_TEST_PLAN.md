# Security test plan — V16 (no real student information)

## Phase A — existing live deny-all policy
Do not publish new rules for this phase. In Firestore > Rules > Rules Playground, verify GET and CREATE denied, each with authentication off and on. BRYC completed these four tests.

## Phase B — test the staged staff access policy BEFORE deploying
Use Rules Playground against `firestore.staff-access.STAGED.rules` if supported, or the Firebase Emulator Suite. Create **fictional** authorization fixtures with UIDs and BRYC email addresses.

Expected permissions:
- Unauthenticated GET `/staffAccess/uid-A`: denied
- Signed-in uid-B GET `/staffAccess/uid-A`: denied
- uid-A GET `/staffAccess/uid-A` when document absent: denied
- uid-A GET their record with active=false: denied
- uid-A GET their record with email mismatch: denied
- uid-A GET their record with role not ram_admin/staff: denied
- uid-A GET their active record, matching verified BRYC email and permitted role: allowed
- Any client attempts to list, create, edit, delete staffAccess: denied
- Any user including approved staff tries read or write `/fellows/example`, `/applications/example`, `/inquiries/example`: denied

## Before activating staff-only access
1. Confirm Spark plan (no linked billing).
2. Test all staged rules above, and have BRYC staff review the authorization policy.
3. Deploy rules **only after** testing; previously deployed deny-all is still the safest default.
4. In Authentication > Users, obtain the approved tester's UID (do not share it publicly).
5. Manually create Firestore document `staffAccess/{UID}` via Firebase console with **active (boolean) true**, **email (string)** matching the Google account and **role (string)** `ram_admin` or `staff`. Console administrative access must be restricted.
6. Add the app's GitHub Pages domain to Authentication > Settings > Authorized domains.
7. Staff access check should unlock ONLY fictional dashboard UI. No Fellow or application records are connected.

## Scope and limitations
- The Google domain hint is a UX hint only, not a security policy.
- This authorization is verified via Firestore rules, not trusted from editable website JavaScript.
- The browser contains public layout markup and placeholder metrics; hiding it is only a UI measure. Future record queries require Firestore rules for each collection.
- Authentication does not prove production readiness. Threat modeling, browser testing, least privilege, audit strategy, spam defense and confidential document uploads remain unresolved.
- Signing in uses browser session persistence managed by Firebase Auth; applications remain no-save.
