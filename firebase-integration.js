// BRYC Admissions V16: Authentication + authorization gate (fictional UI only).
// Firebase's SDK loads only after public web-app config is filled in.
// Staff authorization requires a valid UID-keyed /staffAccess/{uid} Firestore document.
// Every other Firestore collection remains inaccessible under the STAGED rules.
import { firebaseConfig } from './firebase-config.js';

const loginScreen = document.getElementById('staff-login-screen');
const workspace = document.getElementById('staff-protected');
const status = document.getElementById('login-security-status');
const staffStatus = document.getElementById('auth-status');
const loginButton = document.getElementById('auth-login');
const logoutButtons = [document.getElementById('auth-logout'), document.getElementById('login-logout')];
let currentAuth = null;
let signOutFn = null;
let lastCheck = 0;

function message(text, kind = '') { status.textContent = text; status.className = kind; }
function lock(text, kind = '') {
  window.BRYCStaffAuth=null;
  window.dispatchEvent(new CustomEvent('bryc:workspace-locked'));
  workspace.hidden = true;
  loginScreen.hidden = false;
  message(text, kind);
}
function unlock(user, staff) {
  window.BRYCStaffAuth={uid:user.uid,role:staff.role};
  window.dispatchEvent(new CustomEvent('bryc:workspace-authorized', {detail:window.BRYCStaffAuth}));
  workspace.hidden = false;
  loginScreen.hidden = true;
  // Safe to show only because these are static, fabricated placeholder cards.
  staffStatus.textContent = `${staff.role} preview · ${user.email} · Fictional metrics only. No real records loaded.`;
}
logoutButtons.forEach(button => button?.addEventListener('click', async () => {
  if (currentAuth && signOutFn) await signOutFn(currentAuth);
  lock('Signed out. Sign in with an authorized BRYC account.');
}));

const validConfig = ['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof firebaseConfig[k] === 'string' && firebaseConfig[k].trim());
if (!validConfig) {
  lock('SETUP NEEDED: Add the public Firebase web app configuration to firebase-config.js. Sign-in is disabled until then.');
} else {
  try {
    const [{initializeApp, getApps, getApp}, authSdk, dbSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = dbSdk.getFirestore(app);
    currentAuth = auth; signOutFn = authSdk.signOut;
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account', hd:'thebryc.org'});
    loginButton.disabled = false;
    loginButton.addEventListener('click', async () => {
      loginButton.disabled = true;
      message('Opening Google sign-in…');
      try { await authSdk.signInWithPopup(auth, provider); }
      catch(e) { message(`Google sign-in could not complete (${e.code || 'error'}).`, 'error'); }
      finally { loginButton.disabled = false; }
    });
    authSdk.onAuthStateChanged(auth, async user => {
      const attempt = ++lastCheck;
      if (!user) { loginButton.hidden = false; logoutButtons[1].hidden = true; lock('Sign in with your authorized BRYC Google account.'); return; }
      loginButton.hidden = true; logoutButtons[1].hidden = false;
      lock('Google sign-in successful. Checking separate BRYC staff authorization…');
      if (!user.emailVerified || !user.email?.toLowerCase().endsWith('@thebryc.org')) {
        lock('Access denied: this is not a verified BRYC organization email.', 'error');
        return;
      }
      try {
        const ref = dbSdk.doc(db, 'staffAccess', user.uid);
        const snap = await dbSdk.getDoc(ref);
        if (attempt !== lastCheck) return;
        const data = snap.exists() ? snap.data() : null;
        if (!data || data.active !== true || data.email !== user.email || !['ram_admin','staff'].includes(data.role)) {
          lock('Access denied: this account has not been explicitly approved for the RAM Workspace.', 'error');
          return;
        }
        unlock(user, data);
      } catch (err) {
        if (attempt !== lastCheck) return;
        // Rules reject reads of a missing staffAccess record, so an unapproved account lands here too.
        if (err?.code === 'permission-denied') lock('Access denied: this account has not been approved for the RAM Workspace. Contact the RAM administrator if you need access.', 'error');
        else lock('Could not verify staff access. Check your connection and try again.', 'error');
      }
    });
  } catch(e) { lock('Firebase SDK could not load. Check your network and public Firebase configuration.', 'error'); }
}
