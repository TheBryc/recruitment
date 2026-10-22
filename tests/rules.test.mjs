// Automated version of SECURITY_TEST_PLAN.md, run against the Firestore emulator.
// Usage (from /tests): npm test
import {test, before, after, beforeEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch} from 'firebase/firestore';

const RULES = process.env.RULES_FILE || '../firestore.ram-sandbox.STAGED.rules';
const ADMIN = {uid: 'admin-uid', email: 'admin@thebryc.org'};
const STAFF = {uid: 'staff-uid', email: 'staff@thebryc.org'};
const INACTIVE = {uid: 'inactive-uid', email: 'inactive@thebryc.org'};
const UNLISTED = {uid: 'unlisted-uid', email: 'unlisted@thebryc.org'};
const OTHER_ADMIN = {uid: 'other-admin-uid', email: 'other@thebryc.org'};
const OUTSIDER = {uid: 'outsider-uid', email: 'admin@gmail.com'};

const prospect = {id: 'DEMO-P001', name: 'Jordan Sample', school: 'Baton Rouge Magnet High School', grade: 9, source: 'Inquiry', status: 'New', action: 'Send application link', due: '2026-10-22', isDemo: true};
const task = {id: 'DEMO-T01', name: 'Jordan Sample', action: 'Send application link', priority: 'High', owner: 'RAM Team', due: '2026-10-22', done: false, isDemo: true};

let env;
const as = (u, verified = true) => env.authenticatedContext(u.uid, {email: u.email, email_verified: verified}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({projectId: 'bryc-rules-test', firestore: {rules: readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080}});
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'staffAccess', ADMIN.uid), {email: ADMIN.email, role: 'ram_admin', active: true});
    await setDoc(doc(db, 'staffAccess', OTHER_ADMIN.uid), {email: OTHER_ADMIN.email, role: 'ram_admin', active: true});
    await setDoc(doc(db, 'staffAccess', STAFF.uid), {email: STAFF.email, role: 'staff', active: true});
    await setDoc(doc(db, 'staffAccess', INACTIVE.uid), {email: INACTIVE.email, role: 'ram_admin', active: false});
    await setDoc(doc(db, 'staffAccess', OUTSIDER.uid), {email: OUTSIDER.email, role: 'ram_admin', active: true});
    await setDoc(doc(db, 'ramSandbox', ADMIN.uid, 'prospects', prospect.id), prospect);
    await setDoc(doc(db, 'ramSandbox', ADMIN.uid, 'tasks', task.id), task);
    await setDoc(doc(db, 'ramSandbox', OTHER_ADMIN.uid, 'prospects', prospect.id), prospect);
  });
});

// ---- Expected ALLOW ----
test('1. approved admin can get own staffAccess', () => assertSucceeds(getDoc(doc(as(ADMIN), 'staffAccess', ADMIN.uid))));
test('1b. approved staff (non-admin) can get own staffAccess', () => assertSucceeds(getDoc(doc(as(STAFF), 'staffAccess', STAFF.uid))));
test('2. approved admin can list own sandbox groups', async () => {
  for (const g of ['prospects', 'applications', 'tasks']) await assertSucceeds(getDocs(collection(as(ADMIN), 'ramSandbox', ADMIN.uid, g)));
});
test('3. approved admin can create a demo prospect', () =>
  assertSucceeds(setDoc(doc(as(ADMIN), 'ramSandbox', ADMIN.uid, 'prospects', 'DEMO-P999'), {...prospect, id: 'DEMO-P999', name: 'Pat Test'})));
test('4. approved admin can update only prospect status', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'ramSandbox', ADMIN.uid, 'prospects', prospect.id), {status: 'Contacted'})));
test('5. approved admin can update only task done', () =>
  assertSucceeds(updateDoc(doc(as(ADMIN), 'ramSandbox', ADMIN.uid, 'tasks', task.id), {done: true})));
test('5b. full Initialize batch (20 docs, same as the workspace button) succeeds', async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'staffAccess', ADMIN.uid), {email: ADMIN.email, role: 'ram_admin', active: true}));
  const src = readFileSync('../ram-workspace.js', 'utf8');
  const grab = name => Function('return ' + src.match(new RegExp(`const ${name}=(\\[[\\s\\S]*?\\]);`))[1])();
  const db = as(ADMIN), batch = writeBatch(db);
  const seeds = {prospects: grab('prospectSeed'), applications: grab('applicationSeed'), tasks: grab('taskSeed')};
  for (const [g, rows] of Object.entries(seeds)) rows.forEach(x => batch.set(doc(db, 'ramSandbox', ADMIN.uid, g, x.id), {...x, isDemo: true}));
  await assertSucceeds(batch.commit());
});

// ---- Expected DENY ----
test('6. signed-out user cannot read or write sandbox', async () => {
  await assertFails(getDocs(collection(anon(), 'ramSandbox', ADMIN.uid, 'prospects')));
  await assertFails(setDoc(doc(anon(), 'ramSandbox', ADMIN.uid, 'prospects', 'DEMO-P998'), {...prospect, id: 'DEMO-P998'}));
});
test('7. inactive or unlisted BRYC user cannot use sandbox', async () => {
  for (const u of [INACTIVE, UNLISTED]) {
    await assertFails(getDocs(collection(as(u), 'ramSandbox', u.uid, 'prospects')));
    await assertFails(setDoc(doc(as(u), 'ramSandbox', u.uid, 'prospects', 'DEMO-P998'), {...prospect, id: 'DEMO-P998'}));
  }
});
test('7b. unlisted user cannot read a staffAccess record (no record exists)', () => assertFails(getDoc(doc(as(UNLISTED), 'staffAccess', UNLISTED.uid))));
test('7c. unverified email is denied', () => assertFails(getDocs(collection(as(ADMIN, false), 'ramSandbox', ADMIN.uid, 'prospects'))));
test('7d. non-thebryc.org email is denied even with an access record', () => assertFails(getDocs(collection(as(OUTSIDER), 'ramSandbox', OUTSIDER.uid, 'prospects'))));
test('8. staff role cannot read or write sandbox', async () => {
  await assertFails(getDocs(collection(as(STAFF), 'ramSandbox', STAFF.uid, 'prospects')));
  await assertFails(setDoc(doc(as(STAFF), 'ramSandbox', STAFF.uid, 'prospects', 'DEMO-P998'), {...prospect, id: 'DEMO-P998'}));
});
test('9. admin cannot read or write another UID sandbox', async () => {
  await assertFails(getDocs(collection(as(ADMIN), 'ramSandbox', OTHER_ADMIN.uid, 'prospects')));
  await assertFails(updateDoc(doc(as(ADMIN), 'ramSandbox', OTHER_ADMIN.uid, 'prospects', prospect.id), {status: 'Applied'}));
});
test('9b. admin cannot read another staffAccess record', () => assertFails(getDoc(doc(as(ADMIN), 'staffAccess', STAFF.uid))));
test('10. nobody can create/update/delete staffAccess from the client', async () => {
  const db = as(ADMIN);
  await assertFails(setDoc(doc(db, 'staffAccess', 'new-uid'), {email: 'x@thebryc.org', role: 'ram_admin', active: true}));
  await assertFails(updateDoc(doc(db, 'staffAccess', ADMIN.uid), {role: 'ram_admin', active: true}));
  await assertFails(deleteDoc(doc(db, 'staffAccess', ADMIN.uid)));
  await assertFails(getDocs(collection(db, 'staffAccess')));
});
test('11. admin cannot write non-demo ID, missing isDemo, or non-fictional name', async () => {
  const db = as(ADMIN), ref = id => doc(db, 'ramSandbox', ADMIN.uid, 'prospects', id);
  await assertFails(setDoc(ref('REAL-001'), {...prospect, id: 'REAL-001'}));
  const {isDemo, ...noFlag} = prospect;
  await assertFails(setDoc(ref('DEMO-P997'), {...noFlag, id: 'DEMO-P997'}));
  await assertFails(setDoc(ref('DEMO-P996'), {...prospect, id: 'DEMO-P996', name: 'Jordan Smith'}));
  await assertFails(setDoc(ref('DEMO-P995'), {...prospect, id: 'DEMO-P995', ssn: '000-00-0000'}));
});
test('12. admin cannot change prospect fields other than status', async () => {
  const ref = doc(as(ADMIN), 'ramSandbox', ADMIN.uid, 'prospects', prospect.id);
  await assertFails(updateDoc(ref, {name: 'Jordan Smith'}));
  await assertFails(updateDoc(ref, {school: 'Other School'}));
  await assertFails(updateDoc(ref, {status: 'Admitted'})); // not a prospect status
});
test('13. admin cannot delete sandbox documents', () => assertFails(deleteDoc(doc(as(ADMIN), 'ramSandbox', ADMIN.uid, 'prospects', prospect.id))));
test('14. admin cannot touch any non-sandbox collection', async () => {
  const db = as(ADMIN);
  for (const c of ['applications', 'fellows', 'incomeVerification', 'inquiries']) {
    await assertFails(getDoc(doc(db, c, 'test')));
    await assertFails(setDoc(doc(db, c, 'test'), {x: 1}));
  }
});
test('15. unauthenticated user cannot read any staffAccess record', () => assertFails(getDoc(doc(anon(), 'staffAccess', ADMIN.uid))));
