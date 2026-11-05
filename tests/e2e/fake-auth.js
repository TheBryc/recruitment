// Fake Firebase Auth. Accounts live in localStorage; tokens are base64 JSON
// {uid, email, verified}, which the mock Apps Script server accepts.
const db = () => JSON.parse(localStorage.getItem('fake-accounts') || '{}');
const save = d => localStorage.setItem('fake-accounts', JSON.stringify(d));
const err = code => Object.assign(new Error(code), {code});
const auths = {};
function makeUser(rec) {
  return { uid: rec.uid, get email() { return rec.email; }, emailVerified: rec.verified,
    async getIdToken() { return btoa(JSON.stringify({uid: rec.uid, email: rec.email, verified: this.emailVerified})); },
    async reload() { const r = db()[rec.email]; this.emailVerified = !!r?.verified; } };
}
window.__fakeVerify = email => { const d = db(); d[email].verified = true; save(d); };
window.__fakeMails = window.__fakeMails || [];
export function getAuth(app) {
  const name = app?.name || '[DEFAULT]';
  if (!auths[name]) {
    const a = auths[name] = {name, currentUser: null, listeners: []};
    const uid = name === 'family' && localStorage.getItem('fake-session');
    if (uid) { const rec = Object.values(db()).find(r => r.uid === uid); if (rec) a.currentUser = makeUser(rec); }
  }
  return auths[name];
}
function set(a, u) { a.currentUser = u; if (a.name === 'family') { if (u) localStorage.setItem('fake-session', u.uid); else localStorage.removeItem('fake-session'); } a.listeners.forEach(f => f(u)); }
export function onAuthStateChanged(a, f) { a.listeners.push(f); setTimeout(() => f(a.currentUser), 50); return () => {}; }
export async function createUserWithEmailAndPassword(a, email, password) {
  const d = db(); if (d[email]) throw err('auth/email-already-in-use'); if (password.length < 6) throw err('auth/weak-password');
  d[email] = {uid: 'uid-' + Math.random().toString(36).slice(2, 10), email, password, verified: false}; save(d);
  const u = makeUser(d[email]); set(a, u); return {user: u};
}
export async function signInWithEmailAndPassword(a, email, password) {
  const r = db()[email]; if (!r || r.password !== password) throw err('auth/invalid-credential');
  const u = makeUser(r); set(a, u); return {user: u};
}
export async function sendEmailVerification(u, opts) { window.__fakeMails.push({type: 'verify', email: u.email, opts}); }
export async function sendPasswordResetEmail(a, email) { window.__fakeMails.push({type: 'reset', email}); }
export async function signOut(a) { set(a, null); }
export function GoogleAuthProvider() {} export function signInWithPopup() { throw err('auth/popup-blocked'); }
