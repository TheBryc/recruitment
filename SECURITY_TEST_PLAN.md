# V19 sandbox permission test plan (do not publish without passing)

Test the STAGED rules in Rules Playground (or the Firebase Emulator Suite). Use an existing **fictional** demo document fixture and a valid `staffAccess/{uid}` with active=true, role=ram_admin, exact verified organization email.

Expected **ALLOW**:
1. Authenticated approved RAM admin `get` their own `/staffAccess/{uid}`.
2. Approved RAM admin `list` their own `/ramSandbox/{uid}/prospects` (also applications/tasks).
3. Approved RAM admin `create` a new `DEMO-P999` prospect with all expected demo fields and `isDemo: true`.
4. Approved RAM admin `update` ONLY the allowed `status` on their existing demo prospect.
5. Approved RAM admin `update` ONLY `done` on their existing demo task.

Expected **DENY**:
6. Signed-out read/write on sandbox.
7. Unapproved / inactive BRYC user read or write sandbox.
8. A `staff` role (not `ram_admin`) read or write sandbox.
9. Approved admin read another UID's sandbox.
10. Anyone create/update/delete `staffAccess` through client SDK.
11. Approved admin write a non-demo ID, missing `isDemo`, or a name without fictional indicator.
12. Approved admin change any prospect field OTHER THAN status (e.g. name, school).
13. Approved admin delete sandbox document.
14. Approved admin read/write `/applications/test`, `/fellows/test`, `/incomeVerification/test`, `/inquiries/test`.
15. Unauthenticated reader any `/staffAccess/{uid}`.

**Caution:** A simple Rules Playground simulation of CREATE must include request fields and authenticating claims. Emulator rules unit tests are preferred for verifying these exact outcomes. No server-side access is attempted. Do not deploy live rules based on a handful of Playground cases alone.

After deployment, test with synthetic records only. Firestore reads/writes persist only after the appropriate permissions are deployed. Never enable public submissions until separate rules, abuse controls, data protection review, and secure document collection have been completed.
