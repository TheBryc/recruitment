// Family portal: accounts, household, application drafts, status, and follow-up forms.
// Families sign in with email and password (Firebase Auth, a separate app from staff
// sign-in). Everything they save goes to RAM HQ through the Apps Script web app,
// which checks their sign-in token on every request.
import {firebaseConfig} from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const SUBMIT_URL = (window.BRYC_PORTAL || {}).submitUrl || '';
const PROTECTED = ['apply', 'portal', 'task'];
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

// Family-facing wording for decisions. Edit here to change what families read.
const DECISION_TEXT = {
  'Admitted': first => `Congratulations! ${first} has been admitted to BRYC. Please complete the next steps below.`,
  'Waitlisted': first => `${first} is on our waitlist. We will reach out if a spot opens. If you have questions, email admissions@thebryc.org.`,
  'Not admitted': first => `We're not able to offer ${first} a spot this year. Thank you for applying. If you have questions, email admissions@thebryc.org.`,
  'Declined': first => `You let us know ${first} won't be joining BRYC this year. Thank you for telling us.`
};
const STAGES = ['Started', 'Submitted', 'Under review', 'Decision'];
const STAGE_INDEX = {draft: 0, received: 1, review: 2, decision: 3};

let A = null, auth = null, user = null, ready = false, state = null;
let current = null;      // student key of the open application, 'new', or null
let pending = null;      // where to go once sign-in finishes
let taskCtx = null;      // {student, key} for the open follow-up form
let lastView = null;
let wantApply = false;  // they asked to apply before saving a household

const go = (name, fromHistory) => window.BRYCView ? window.BRYCView(name, fromHistory) : null;
const activeView = () => $('.view.active')?.id || 'home';
const forms = () => window.BRYCForms;
const appApi = () => window.BRYCApp;

/* ---------- small helpers ---------- */

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(k => k != null && n.append(k));
  return n;
}
const fmtDate = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : ''; };
const fmtYear = y => String(y || '').replace('-', '–');
const studentName = s => [s.firstName, s.lastName].filter(Boolean).join(' ') || 'New student';
const cacheKey = () => user ? 'bryc-portal:' + user.uid : '';
function store(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function recall(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; } }

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'An account already exists for that email. Try signing in instead.',
  'auth/invalid-credential': "That email and password don't match. Try again or reset your password.",
  'auth/wrong-password': "That email and password don't match. Try again or reset your password.",
  'auth/user-not-found': "That email and password don't match. Try again or reset your password.",
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Please use a password with at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': "We couldn't connect. Check your internet connection and try again.",
  'auth/operation-not-allowed': 'Portal accounts are not turned on yet. Please contact BRYC admissions.'
};
const authMessage = err => AUTH_ERRORS[err?.code] || err?.message || 'Something went wrong. Please try again.';

async function api(action, data = {}) {
  if (!SUBMIT_URL) throw new Error('The portal is in preview mode. Nothing was saved.');
  if (!user) throw new Error('Please sign in again.');
  const idToken = await user.getIdToken();
  let out;
  try {
    const res = await fetch(SUBMIT_URL, {method: 'POST', body: JSON.stringify(Object.assign({action, idToken}, data))});
    out = await res.json();
  } catch (e) { throw new Error("We couldn't reach BRYC. Check your internet connection and try again."); }
  if (!out.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
  if (out.state) setState(out.state);
  return out;
}

function setState(next) { state = next; store(cacheKey(), state); renderPortal(); }

function flash(text) { const f = $('#portal-flash'); f.textContent = text; f.hidden = !text; }

/* ---------- routing ---------- */

// script.js asks this before opening a page, so signed-out visitors land on the
// account page and come back to where they were headed after signing in.
window.BRYCGuard = name => {
  if (!ready) {
    if (PROTECTED.includes(name)) { if (name !== 'portal' || !pending) pending = name; return 'portal'; }
    return name;
  }
  if (!user) {
    if (PROTECTED.includes(name)) { pending = name; return 'account'; }
    return name;
  }
  if (name === 'account') return 'portal';
  if (name === 'apply' && !current) { if (!state) { pending = 'apply'; return 'portal'; } return chooseApplication() ? 'apply' : 'portal'; }
  if (name === 'task' && !taskCtx) return 'portal';
  return name;
};

// "Apply" with no student picked: open the one draft in progress, or start the
// first application. Anything else goes to the portal so they can choose.
function chooseApplication() {
  if (!state?.household) { wantApply = true; flash('Start by telling us about your household. Then you can begin an application.'); return false; }
  const drafts = state.students.filter(s => s.stage === 'draft');
  if (drafts.length === 1) { loadDraft(drafts[0]); return true; }
  if (!state.students.length) { loadNew(); return true; }
  return false;
}

document.addEventListener('bryc:view', e => {
  const name = e.detail.name;
  if (lastView === 'apply' && name !== 'apply') saveSoon(0);
  if (lastView === 'portal' && name !== 'portal') flash('');
  if (name === 'task') renderTask();
  if (name === 'account') resetAccountForms();
  lastView = name;
});

/* ---------- account page ---------- */

function showAuth(which) {
  $$('#account .tab').forEach(t => { const on = t.dataset.tab === which || (which === 'reset' && t.dataset.tab === 'signin'); t.setAttribute('aria-selected', String(on)); t.classList.toggle('active', on); });
  $$('#account .auth-form').forEach(f => { f.hidden = f.dataset.auth !== which; });
  $('#account-message').textContent = '';
}
function resetAccountForms() { $('#account-message').textContent = ''; }

function busy(button, on, label) {
  if (on) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

function initAccount() {
  $$('#account [data-tab], #account [data-tab-link]').forEach(b => b.addEventListener('click', () => showAuth(b.dataset.tab || b.dataset.tabLink)));
  $$('#account [data-show-reset]').forEach(b => b.addEventListener('click', () => {
    $('#reset-form').elements.email.value = $('#signin-form').elements.email.value; showAuth('reset');
  }));
  const msg = $('#account-message');
  const fail = (form, text) => { msg.textContent = text; };

  $('#signup-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.target, b = form.querySelector('[type="submit"]');
    const first = forms().formErrors(form);
    const pw = form.elements.password, confirm = form.elements.confirm;
    if (first) { fail(form, 'Please fix the highlighted questions.'); first.focus(); return; }
    if (pw.value.length < 8) { fail(form, 'Please use a password with at least 8 characters.'); pw.focus(); return; }
    if (pw.value !== confirm.value) { fail(form, "The passwords don't match."); confirm.focus(); return; }
    if (!A) { fail(form, "The portal couldn't load. Please refresh the page and try again."); return; }
    busy(b, true, 'Creating your account…');
    try {
      store('bryc-portal:holder', form.elements.accountHolder.value);
      const cred = await A.createUserWithEmailAndPassword(auth, form.elements.email.value.trim(), pw.value);
      await sendVerification(cred.user);
      form.reset();
    } catch (err) { fail(form, authMessage(err)); }
    busy(b, false);
  });

  $('#signin-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.target, b = form.querySelector('[type="submit"]');
    const first = forms().formErrors(form);
    if (first) { fail(form, 'Please enter your email and password.'); first.focus(); return; }
    if (!A) { fail(form, "The portal couldn't load. Please refresh the page and try again."); return; }
    busy(b, true, 'Signing in…');
    try { await A.signInWithEmailAndPassword(auth, form.elements.email.value.trim(), form.elements.password.value); form.reset(); }
    catch (err) { fail(form, authMessage(err)); }
    busy(b, false);
  });

  $('#reset-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.target, b = form.querySelector('[type="submit"]');
    const first = forms().formErrors(form);
    if (first) { fail(form, 'Please enter your email address.'); first.focus(); return; }
    busy(b, true, 'Sending…');
    try {
      await A.sendPasswordResetEmail(auth, form.elements.email.value.trim());
      msg.textContent = 'If there is an account for that email, we sent a link to reset your password.';
    } catch (err) {
      msg.textContent = err?.code === 'auth/user-not-found' ? 'If there is an account for that email, we sent a link to reset your password.' : authMessage(err);
    }
    busy(b, false);
  });
}

async function sendVerification(u) {
  const url = location.origin + location.pathname + '#portal';
  try { await A.sendEmailVerification(u, {url}); }
  catch (e) { await A.sendEmailVerification(u); }
}

/* ---------- portal page ---------- */

function renderPortal() {
  const loading = $('#portal-loading'), body = $('#portal-body');
  $('#portal-account').textContent = user ? 'Signed in as ' + user.email : '';
  $('#portal-verify').hidden = !user || user.emailVerified;
  if (!state) { loading.hidden = false; body.hidden = true; return; }
  loading.hidden = true; body.hidden = false;
  const hh = state.household;
  $('#portal-title').textContent = hh ? 'Welcome back.' : 'Welcome to your portal.';
  renderHousehold(hh);
  renderStudents();
}

const HOUSEHOLD_INPUTS = {
  'Account Holder': 'hhAccountHolder', 'Guardian First Name': 'hhGuardianFirst', 'Guardian Last Name': 'hhGuardianLast',
  'Guardian Relationship': 'hhRelationship', 'Guardian Phone': 'hhPhone', 'Guardian Email': 'hhEmail',
  'Street Address': 'hhStreet', 'Apartment or Unit': 'hhUnit', 'City': 'hhCity', 'State': 'hhState', 'ZIP Code': 'hhZip', 'Parish or County': 'hhParish'
};

let editingHousehold = false;
function renderHousehold(hh) {
  const form = $('#household-form'), summary = $('#household-summary');
  const editing = !hh || editingHousehold;
  form.hidden = !editing; summary.hidden = editing;
  $('#household-intro').hidden = !!hh && !editing;
  $('#edit-household').hidden = !hh || editing;
  form.querySelector('[data-cancel-household]').hidden = !hh;
  if (!hh) {
    const holder = recall('bryc-portal:holder');
    if (holder && !form.elements.hhAccountHolder.value) setField(form, 'hhAccountHolder', holder);
    if (!form.elements.hhEmail.value && user && holder !== 'Student') form.elements.hhEmail.value = user.email;
    return;
  }
  const address = [hh['Street Address'], hh['Apartment or Unit']].filter(Boolean).join(', ');
  const place = [hh['City'], [hh['State'], hh['ZIP Code']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rows = [
    ['Parent or guardian', `${hh['Guardian First Name'] || ''} ${hh['Guardian Last Name'] || ''}`.trim() + (hh['Guardian Relationship'] ? ` (${String(hh['Guardian Relationship']).replace(/^Other:\s*/, '')})` : '')],
    ['Phone', hh['Guardian Phone']], ['Email', hh['Guardian Email']],
    ['Home address', [address, place].filter(Boolean).join(', ')], ['Parish or county', hh['Parish or County']]
  ];
  summary.replaceChildren(...rows.filter(r => r[1]).flatMap(([k, v]) => [el('dt', {text: k}), el('dd', {text: String(v)})]));
}

// Set a form control by name, handling radios, "Other: ..." selects, and plain inputs.
function setField(form, name, value) {
  const field = form.elements.namedItem(name); if (!field) return;
  value = value == null ? '' : String(value);
  if (field instanceof RadioNodeList) { [...field].forEach(r => { r.checked = r.value === value; }); return; }
  if (field.tagName === 'SELECT') {
    const options = [...field.options];
    const match = options.find(o => o.value === value) || options.find(o => o.text === value);
    if (match) field.value = match.value;
    else if (value && field.dataset.other) {
      field.value = field.dataset.otherValue || 'Other';
      field.dispatchEvent(new Event('change'));
      const other = $(field.dataset.other)?.querySelector('input'); if (other) other.value = value.replace(/^Other:\s*/, '');
      return;
    } else field.value = '';
    field.dispatchEvent(new Event('change'));
    return;
  }
  field.value = value;
}

function fillHouseholdForm(hh) {
  const form = $('#household-form'); form.reset();
  form.querySelectorAll('select[data-other]').forEach(s => s.dispatchEvent(new Event('change')));
  Object.entries(HOUSEHOLD_INPUTS).forEach(([col, name]) => setField(form, name, hh?.[col]));
}

function initHousehold() {
  const form = $('#household-form'), msg = $('#household-message');
  $('#edit-household').addEventListener('click', () => { editingHousehold = true; fillHouseholdForm(state.household); renderHousehold(state.household); form.querySelector('input:not([type="radio"])').focus(); });
  form.querySelector('[data-cancel-household]').addEventListener('click', () => { editingHousehold = false; msg.textContent = ''; renderHousehold(state.household); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); const b = form.querySelector('[type="submit"]');
    const first = forms().formErrors(form);
    const zip = form.elements.hhZip;
    if (first) { msg.textContent = 'Please fix the highlighted questions.'; first.focus(); return; }
    if (!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim())) { msg.textContent = 'Please enter a valid ZIP code.'; zip.focus(); return; }
    const isNew = !state?.household;
    busy(b, true, 'Saving…'); msg.textContent = '';
    try {
      await api('saveHousehold', {fields: forms().collectAnswers(form)});
      editingHousehold = false; renderPortal();
      flash(isNew ? 'Household saved. You can start an application now.' : 'Household updated.');
      if (isNew && wantApply) { wantApply = false; if (chooseApplication()) go('apply'); }
    } catch (err) { msg.textContent = err.message; }
    busy(b, false);
  });
}

function renderStudents() {
  const list = $('#student-list'), add = $('#add-student');
  add.disabled = !state.household;
  if (!state.students.length) {
    list.replaceChildren(el('div', {class: 'student-empty'},
      el('p', {text: state.household ? 'No applications yet. Start one for each student in your household.' : 'Save your household information first. Then you can start an application.'})));
    return;
  }
  list.replaceChildren(...state.students.map(studentCard));
}

function studentCard(s) {
  const stage = STAGE_INDEX[s.stage] ?? 0;
  const first = s.firstName || 'your student';
  const pillClass = s.stage === 'decision' ? 'pill decision-' + (s.decision || '').toLowerCase().replace(/[^a-z]+/g, '-') : 'pill stage-' + s.stage;
  const card = el('article', {class: 'student-card', 'data-student': s.studentKey},
    el('div', {class: 'student-card-head'},
      el('h3', {text: studentName(s)}),
      el('span', {class: pillClass, text: s.stage === 'decision' ? s.decision : s.status})),
    el('p', {class: 'student-meta', text: [s.programYear && fmtYear(s.programYear) + ' school year', s.submittedAt ? 'Submitted ' + fmtDate(s.submittedAt) : s.updated && 'Last saved ' + fmtDate(s.updated)].filter(Boolean).join(' · ')}),
    el('ol', {class: 'progress', 'aria-label': 'Application progress'},
      STAGES.map((label, i) => el('li', {class: i < stage ? 'done' : i === stage ? 'current' : '', 'aria-current': i === stage ? 'step' : false, text: label}))));

  if (s.stage === 'draft') {
    card.append(el('p', {text: 'Your answers save as you go. Documents need to be attached again before you submit.'}),
      el('button', {class: 'btn btn-primary', type: 'button', text: 'Continue application', onclick: () => { loadDraft(s); go('apply'); }}));
  } else if (s.stage === 'received') {
    card.append(el('p', {text: `We received ${first}'s application. We will email you when it moves forward.`}));
  } else if (s.stage === 'review') {
    card.append(el('p', {text: `Our team is reviewing ${first}'s application. We will email you when a decision is ready.`}));
  } else {
    const text = DECISION_TEXT[s.decision];
    card.append(el('p', {class: 'decision-text', text: text ? text(first) : 'Decision: ' + s.decision}));
    if (s.tasks?.length) card.append(taskList(s));
  }
  return card;
}

function taskList(s) {
  return el('div', {class: 'tasks'},
    el('h4', {text: 'Next steps'}),
    el('ul', {class: 'task-list'}, s.tasks.map(t => {
      let action;
      if (t.done) action = el('span', {class: 'task-state done', text: 'Done'});
      else if (!t.open) action = el('span', {class: 'task-state', text: 'Opens soon'});
      else action = el('button', {class: 'btn btn-secondary', type: 'button', text: 'Start', onclick: () => { taskCtx = {student: s, key: t.key}; go('task'); }});
      return el('li', {class: t.done ? 'done' : ''},
        el('div', {}, el('strong', {text: t.title}), t.status && !t.done ? el('small', {text: t.status}) : null), action);
    })));
}

function initPortal() {
  $('#portal-signout').addEventListener('click', signOut);
  $('#add-student').addEventListener('click', () => { if (!state?.household) return; loadNew(); go('apply'); });
  $('#verify-resend').addEventListener('click', async e => {
    const b = e.currentTarget; busy(b, true, 'Sending…');
    try { await sendVerification(user); $('#portal-verify-text').textContent = 'We sent a new link to ' + user.email + '. It can take a few minutes to arrive.'; }
    catch (err) { $('#portal-verify-text').textContent = authMessage(err); }
    busy(b, false);
  });
  $('#verify-check').addEventListener('click', async e => {
    const b = e.currentTarget; busy(b, true, 'Checking…');
    try {
      await refreshVerified();
      if (user.emailVerified) { flash('Thanks. Your email is confirmed.'); await api('load'); }
      else $('#portal-verify-text').textContent = "We don't see the confirmation yet. Open the link in the email we sent to " + user.email + ', then try again.';
    } catch (err) { $('#portal-verify-text').textContent = err.message; }
    busy(b, false); renderPortal();
  });
}

// A fresh token tells RAM HQ the email is now confirmed.
async function refreshVerified() {
  if (user.emailVerified) return;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
}

/* ---------- application drafts ---------- */

const APP_FROM_HOUSEHOLD = {
  guardianFirst: 'Guardian First Name', guardianLast: 'Guardian Last Name', guardianRelationship: 'Guardian Relationship',
  guardianPhone: 'Guardian Phone', guardianEmail: 'Guardian Email', homeStreet: 'Street Address', homeUnit: 'Apartment or Unit',
  homeCity: 'City', homeState: 'State', homeZip: 'ZIP Code', homeParish: 'Parish or County'
};

function loadNew() {
  current = 'new'; appApi().reset();
  const form = appApi().form, hh = state?.household || {};
  Object.entries(APP_FROM_HOUSEHOLD).forEach(([name, col]) => { if (hh[col]) setField(form, name, hh[col]); });
  if (hh['Account Holder'] === 'Student' && user) setField(form, 'studentEmail', user.email);
  setDraftHead('New application', '');
}

function loadDraft(s) {
  current = s.studentKey; appApi().restore(s.answers || {});
  const form = appApi().form, hh = state?.household || {};
  Object.entries(APP_FROM_HOUSEHOLD).forEach(([name, col]) => { if (hh[col] && !form.elements.namedItem(name)?.value) setField(form, name, hh[col]); });
  setDraftHead('For ' + studentName(s), s.updated ? 'Saved' : '');
}

function setDraftHead(forText, status) {
  const f = $('#draft-for'); f.textContent = forText; f.hidden = !forText;
  const p = $('#draft-status'); p.textContent = status; p.hidden = !status; p.classList.remove('error');
}

let saveTimer = null, saving = null, dirty = false;
function saveSoon(delay = 1500) {
  if (!current || !user) return;
  dirty = true; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveDraft().catch(() => {}); }, delay);
}

// One save at a time, so a new student never gets two keys.
async function saveDraft() {
  if (saving) { await saving.catch(() => {}); if (!dirty) return; }
  if (!current || !dirty) return;
  const answers = appApi().serialize();
  if (current === 'new' && !String(answers.studentFirst || '').trim()) return;
  dirty = false;
  const pill = $('#draft-status'); pill.hidden = false; pill.textContent = 'Saving…'; pill.classList.remove('error');
  const key = current;
  saving = (async () => {
    try {
      const out = await api('saveDraft', {studentKey: key === 'new' ? '' : key, answers,
        fields: {'Student First Name': answers.studentFirst || '', 'Student Last Name': answers.studentLast || '', 'Program Year': answers.academicYear || ''}});
      if (key === 'new' && current === 'new') current = out.studentKey;
      pill.textContent = 'Saved';
      updateLocalDraft(out.studentKey, answers);
    } catch (err) {
      dirty = true; pill.textContent = 'Not saved yet'; pill.classList.add('error'); pill.title = err.message; throw err;
    } finally { saving = null; }
  })();
  return saving;
}

// Keep the portal list in step without reloading everything.
function updateLocalDraft(key, answers) {
  if (!state) return;
  let s = state.students.find(x => x.studentKey === key);
  if (!s) { s = {studentKey: key, stage: 'draft', status: 'Application started', tasks: [], decision: ''}; state.students.push(s); }
  Object.assign(s, {answers, firstName: answers.studentFirst || '', lastName: answers.studentLast || '', programYear: answers.academicYear || '', updated: new Date().toISOString()});
  $('#draft-for').textContent = 'For ' + studentName(s); $('#draft-for').hidden = false;
  store(cacheKey(), state); renderPortal();
}

async function submitApplication(msg, button) {
  button.disabled = true;
  msg.textContent = 'Submitting your application. This can take a few seconds.';
  try {
    await refreshVerified();
    if (!user.emailVerified) throw new Error(`Please confirm your email address before submitting. Check ${user.email} for the link we sent, then come back to this page.`);
    dirty = true; clearTimeout(saveTimer);
    await saveDraft();
    if (!current || current === 'new') throw new Error("We couldn't save this application. Please check the student's name and try again.");
    const form = appApi().form;
    const fields = forms().collectAnswers(form), files = await forms().collectFiles(form);
    const first = fields['Student First Name'] || 'your student';
    await api('submitApplication', {studentKey: current, fields, files});
    current = null; appApi().reset(); setDraftHead('', ''); msg.textContent = ''; button.disabled = false;
    go('portal');
    flash(`${first}'s application was submitted. We sent a confirmation email, and you can follow its status here.`);
  } catch (err) {
    msg.textContent = err.message; button.disabled = false;
    msg.scrollIntoView({behavior: 'smooth', block: 'center'});
  }
}

function initApplication() {
  const form = appApi()?.form; if (!form || form.dataset.portalReady) return;
  form.dataset.portalReady = '1';
  ['input', 'change'].forEach(type => form.addEventListener(type, e => { if (e.target.type !== 'file') saveSoon(); }));
  window.addEventListener('pagehide', () => { if (dirty) saveDraft().catch(() => {}); });
}

window.BRYCPortal = {get active() { return !!user && !!current; }, submitApplication};

/* ---------- follow-up forms ---------- */

const TASK_KICKER = {onboarding: 'Onboarding', transportation: 'Transportation', income: 'Income verification'};

function renderTask() {
  if (!taskCtx) return;
  const {student, key} = taskCtx, hh = state?.household || {};
  $('#task-kicker').textContent = `${TASK_KICKER[key] || 'Next steps'} for ${studentName(student)}`;
  $('#task-message').textContent = '';
  $$('.task-form').forEach(f => {
    const on = f.dataset.task === key; f.hidden = !on; if (!on) return;
    f.reset(); f.querySelectorAll('.field-error').forEach(e => e.remove()); f.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    f.querySelectorAll('[data-reveal]').forEach(r => { const t = $(r.dataset.reveal); if (t) t.hidden = true; });
    f.querySelectorAll('[data-reveal-check]').forEach(c => { const t = $(c.dataset.revealCheck); if (t) t.hidden = true; });
    f.querySelectorAll('select[data-other]').forEach(s => s.dispatchEvent(new Event('change')));
    if ($('#ob-decline')) $('#ob-decline').hidden = true;
    const prefill = {incGuardianFirst: 'Guardian First Name', incGuardianLast: 'Guardian Last Name', incGuardianEmail: 'Guardian Email', incGuardianPhone: 'Guardian Phone'};
    Object.entries(prefill).forEach(([name, col]) => { if (hh[col]) setField(f, name, hh[col]); });
  });
  $('#task-submit').disabled = false;
}

function initTasks() {
  // A checkbox with data-reveal-check shows its target while checked.
  $$('[data-reveal-check]').forEach(c => c.addEventListener('change', () => { const t = $(c.dataset.revealCheck); if (t) t.hidden = !c.checked; }));
  // Declining admission skips the rest of onboarding and asks why.
  $$('input[name="obAccept"]').forEach(r => r.addEventListener('change', () => {
    const v = r.form.elements.obAccept.value; $('#ob-decline').hidden = v !== 'no';
    $('#task-submit').textContent = v === 'no' ? 'Submit our response' : 'Submit';
  }));
  $('#task-submit').addEventListener('click', async () => {
    if (!taskCtx) return;
    const form = $(`.task-form[data-task="${taskCtx.key}"]`), msg = $('#task-message'), b = $('#task-submit');
    const first = forms().formErrors(form);
    if (first) { msg.textContent = 'Please fix the highlighted questions.'; first.focus({preventScroll: true}); first.scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
    busy(b, true, 'Submitting…'); msg.textContent = '';
    try {
      const fields = forms().collectAnswers(form), files = await forms().collectFiles(form);
      const {student, key} = taskCtx;
      await api('submitTask', {studentKey: student.studentKey, task: key, fields, files});
      busy(b, false); taskCtx = null; go('portal');
      flash(`Thank you. We received the ${TASK_KICKER[key].toLowerCase()} form for ${student.firstName || 'your student'}.`);
    } catch (err) { msg.textContent = err.message; busy(b, false); }
  });
}

/* ---------- sign-in state ---------- */

function setNav() {
  const label = user ? 'My portal' : 'Sign in';
  $$('#nav-portal').forEach(n => { n.textContent = label; });
}

async function signOut() {
  if (dirty) await saveDraft().catch(() => {});
  store(cacheKey(), null); store('bryc-portal:holder', null);
  current = null; taskCtx = null; state = null; pending = null;
  appApi()?.reset(); setDraftHead('', '');
  try { await A.signOut(auth); } catch (e) {}
  go('home');
}

async function onUser(u) {
  const firstTime = !ready, before = user;
  user = u; ready = true; setNav();
  if (!u) {
    state = null; current = null; taskCtx = null;
    if (PROTECTED.includes(activeView()) || (firstTime && pending)) go('account', firstTime);
    else if (firstTime && activeView() === 'account') go('account', true);
    return;
  }
  if (before?.uid !== u.uid) { state = recall(cacheKey()); }
  renderPortal();
  // Go where they were headed, or to the portal if they just signed in.
  const target = pending || (activeView() === 'account' ? 'portal' : null);
  pending = null;
  let applyAfterLoad = false;
  if (target === 'apply') {
    if (state && chooseApplication()) go('apply', firstTime); else { go('portal', firstTime); applyAfterLoad = !state; }
  } else if (target) go(target, firstTime);
  try {
    $('#portal-error').textContent = '';
    await api('load');
  } catch (err) {
    $('#portal-error').textContent = err.message;
    if (!state) $('#portal-loading').hidden = true;
  }
  if (applyAfterLoad && activeView() === 'portal' && chooseApplication()) go('apply', true);
}

async function start() {
  initAccount(); initHousehold(); initPortal(); initTasks();
  if (appApi()) initApplication(); else document.addEventListener('bryc:app-ready', initApplication, {once: true});
  // Whatever page opened before this script loaded gets checked now.
  if (PROTECTED.includes(activeView())) { pending = activeView(); go('portal', true); }
  try {
    const [appSdk, authSdk] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
    A = authSdk;
    const fam = appSdk.getApps().find(a => a.name === 'family') || appSdk.initializeApp(firebaseConfig, 'family');
    auth = A.getAuth(fam);
    A.onAuthStateChanged(auth, u => { onUser(u); });
  } catch (err) {
    console.error(err);
    ready = true; user = null;
    if (PROTECTED.includes(activeView()) || pending) go('account', true);
    $('#account-message').textContent = "The portal couldn't load. Check your internet connection and refresh the page.";
  }
}

start();
