// Safe preview mode: does not connect to Firebase or read/write personal information.
// IMPORTANT: Production integration must include an approved staff authorization model,
// Firestore rules, server-side validation and privacy/security review.
const status = document.getElementById('auth-status');
if (status) status.textContent = 'Preview only — Firebase data access and staff login are disabled pending security review.';
