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
  // Give up after a while so families never sit on a spinner. Uploads get longer.
  const limit = /^submit/.test(action) ? 120000 : 45000;
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), limit);
  let res, out;
  try {
    res = await fetch(SUBMIT_URL, {method: 'POST', body: JSON.stringify(Object.assign({action, idToken}, data)), signal: stop.signal});
  } catch (e) {
    clearTimeout(timer);
    console.error('BRYC portal: request failed', action, e);
    throw new Error(e?.name === 'AbortError' ? 'BRYC is taking too long to respond. Please try again in a minute.' : "We couldn't reach BRYC. Check your internet connection and try again.");
  }
  clearTimeout(timer);
  const text = await res.text();
  try { out = JSON.parse(text); }
  catch (e) {
    console.error('BRYC portal: unexpected response', action, res.status, text.slice(0, 500));
    throw new Error('BRYC sent back an unexpected response. Please try again, or contact BRYC admissions if this keeps happening.');
  }
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
  // Coming from Apply (or another signed-in page): new families need an account.
  // Coming from Sign in: returning families need the sign-in form.
  if (name === 'account') showAuth(pending ? 'signup' : 'signin');
  lastView = name;
});

/* ---------- account page ---------- */

function showAuth(which) {
  $$('#account .tab').forEach(t => { const on = t.dataset.tab === which || (which === 'reset' && t.dataset.tab === 'signin'); t.setAttribute('aria-selected', String(on)); t.classList.toggle('active', on); });
  $$('#account .auth-form').forEach(f => { f.hidden = f.dataset.auth !== which; });
  $('#account-message').textContent = '';
}

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
  'Guardian First Name': 'hhGuardianFirst', 'Guardian Last Name': 'hhGuardianLast',
  'Guardian Relationship': 'hhRelationship', 'Guardian Phone': 'hhPhone', 'Guardian Email': 'hhEmail',
  'Street Address': 'hhStreet', 'Apartment or Unit': 'hhUnit', 'City': 'hhCity', 'State': 'hhState', 'ZIP Code': 'hhZip', 'Parish or County': 'hhParish',
  'Guardian 2 First Name': 'hhG2First', 'Guardian 2 Last Name': 'hhG2Last', 'Guardian 2 Relationship': 'hhG2Relationship',
  'Guardian 2 Phone': 'hhG2Phone', 'Guardian 2 Email': 'hhG2Email', 'Guardian 2 Different Address': 'hhG2Different',
  'Guardian 2 Street Address': 'hhG2Street', 'Guardian 2 Apartment or Unit': 'hhG2Unit', 'Guardian 2 City': 'hhG2City',
  'Guardian 2 State': 'hhG2State', 'Guardian 2 ZIP Code': 'hhG2Zip'
};
const hasSecondGuardian = hh => String(hh?.['Second Guardian'] || '').toLowerCase() === 'yes';

// Show the checked answer's follow-up questions after filling a form from saved data.
function syncReveals(root) {
  root.querySelectorAll('input[type="radio"][data-reveal]').forEach(r => {
    const t = $(r.dataset.reveal); if (t) t.hidden = root.elements.namedItem(r.name).value !== 'yes';
  });
}

// The household card's second guardian opens with a button and closes with Remove.
function showSecondGuardian(on) {
  const form = $('#household-form');
  $('#hh-g2').hidden = !on; $('#hh-add-g2').hidden = on;
  form.elements.hhSecondGuardian.value = on ? 'Yes' : '';
  if (!on) {
    $('#hh-g2').querySelectorAll('input,select').forEach(el => { if (el.type === 'radio') el.checked = false; else el.value = ''; });
    $('#hh-g2').querySelectorAll('select[data-other]').forEach(s => s.dispatchEvent(new Event('change')));
  }
  syncReveals(form);
}

let editingHousehold = false;
function renderHousehold(hh) {
  const form = $('#household-form'), summary = $('#household-summary');
  const editing = !hh || editingHousehold;
  form.hidden = !editing; summary.hidden = editing;
  $('#household-intro').hidden = !!hh && !editing;
  $('#edit-household').hidden = !hh || editing;
  form.querySelector('[data-cancel-household]').hidden = !hh;
  if (!hh) {
    // The account holder is the parent/guardian, so their email is the account's.
    if (!form.elements.hhEmail.value && user) form.elements.hhEmail.value = user.email;
    return;
  }
  const address = [hh['Street Address'], hh['Apartment or Unit']].filter(Boolean).join(', ');
  const place = [hh['City'], [hh['State'], hh['ZIP Code']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const rows = [
    ['Parent/guardian', `${hh['Guardian First Name'] || ''} ${hh['Guardian Last Name'] || ''}`.trim() + (hh['Guardian Relationship'] ? ` (${String(hh['Guardian Relationship']).replace(/^Other:\s*/, '')})` : '')],
    ['Phone', hh['Guardian Phone']], ['Email', hh['Guardian Email']],
    ['Home address', [address, place].filter(Boolean).join(', ')], ['Parish or county', hh['Parish or County']]
  ];
  if (hasSecondGuardian(hh)) {
    const rel = String(hh['Guardian 2 Relationship'] || '').replace(/^Other:\s*/, '');
    const diff = String(hh['Guardian 2 Different Address'] || '').toLowerCase() === 'yes';
    const g2Street = [hh['Guardian 2 Street Address'], hh['Guardian 2 Apartment or Unit']].filter(Boolean).join(', ');
    const g2Place = [hh['Guardian 2 City'], [hh['Guardian 2 State'], hh['Guardian 2 ZIP Code']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    rows.push(['Second parent/guardian', `${hh['Guardian 2 First Name'] || ''} ${hh['Guardian 2 Last Name'] || ''}`.trim() + (rel ? ` (${rel})` : '')],
      ['Phone', hh['Guardian 2 Phone']], ['Email', hh['Guardian 2 Email']],
      ['Address', diff ? [g2Street, g2Place].filter(Boolean).join(', ') : 'Same as home address']);
  }
  summary.replaceChildren(...rows.filter(r => r[1]).flatMap(([k, v]) => [el('dt', {class: k === 'Second parent/guardian' ? 'g2-start' : false, text: k}), el('dd', {text: String(v)})]));
  let add = $('#hh-summary-add-g2');
  if (!add) {
    add = el('button', {class: 'btn btn-secondary add-g2', id: 'hh-summary-add-g2', type: 'button', text: '+ Add second guardian', onclick: () => {
      editingHousehold = true; fillHouseholdForm(state.household); showSecondGuardian(true); renderHousehold(state.household);
      $('#household-form [name="hhG2First"]').focus();
    }});
    summary.after(add);
  }
  add.hidden = editing || hasSecondGuardian(hh);
}

// Set a form control by name, handling radios, "Other: ..." selects, and plain inputs.
function setField(form, name, value) {
  const field = form.elements.namedItem(name); if (!field) return;
  value = value == null ? '' : String(value);
  if (field instanceof RadioNodeList) {
    const want = value.toLowerCase();
    [...field].forEach(r => { r.checked = !!want && (r.value.toLowerCase() === want || (r.dataset.label || '').toLowerCase() === want); });
    return;
  }
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
  $('#hh-g2').hidden = !hasSecondGuardian(hh); $('#hh-add-g2').hidden = hasSecondGuardian(hh);
  form.elements.hhSecondGuardian.value = hasSecondGuardian(hh) ? 'Yes' : '';
  syncReveals(form);
}

function initHousehold() {
  const form = $('#household-form'), msg = $('#household-message');
  $('#edit-household').addEventListener('click', () => { editingHousehold = true; fillHouseholdForm(state.household); renderHousehold(state.household); form.querySelector('input:not([type="radio"])').focus(); });
  $('#hh-add-g2').addEventListener('click', () => { showSecondGuardian(true); form.elements.hhG2First.focus(); });
  $('#hh-remove-g2').addEventListener('click', () => { showSecondGuardian(false); $('#hh-add-g2').focus(); });
  form.querySelector('[data-cancel-household]').addEventListener('click', () => { editingHousehold = false; msg.textContent = ''; renderHousehold(state.household); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); const b = form.querySelector('[type="submit"]');
    const first = forms().formErrors(form);
    const zip = form.elements.hhZip;
    if (first) { msg.textContent = 'Please fix the highlighted questions.'; first.focus(); return; }
    if (!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim())) { msg.textContent = 'Please enter a valid ZIP code.'; zip.focus(); return; }
    const zip2 = form.elements.hhG2Zip;
    if (!zip2.closest('[hidden]') && !/^\d{5}(?:-\d{4})?$/.test(zip2.value.trim())) { msg.textContent = 'Please enter a valid ZIP code for the second guardian.'; zip2.focus(); return; }
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
  renderIncome();
  if (!state.students.length) {
    list.replaceChildren(el('div', {class: 'student-empty'},
      el('p', {text: state.household ? 'No applications yet. Start one for each student in your household.' : 'Save your household information first. Then you can start an application.'})));
    return;
  }
  list.replaceChildren(...state.students.map(studentCard));
}

// "Jordan", "Jordan and Riley", "Jordan, Riley, and Sam"
const listNames = names => names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];

// Income verification is done once per household by a parent/guardian, so it gets
// its own box at the top of the portal instead of sitting under each student.
function renderIncome() {
  const box = $('#income-card'); if (!box) return;
  const owners = (state?.students || []).filter(s => (s.tasks || []).some(t => t.key === 'income'));
  if (!owners.length) { box.hidden = true; box.replaceChildren(); return; }
  const taskOf = s => s.tasks.find(t => t.key === 'income');
  const owner = owners.find(s => !taskOf(s).done) || owners[0], task = taskOf(owner);
  const followUp = /more information/i.test(task.status || '');
  let action, note;
  if (task.done) {
    action = el('span', {class: 'task-state done', text: 'Done'});
    note = /verified|complete/i.test(task.status || '') ? 'Complete. There is nothing else you need to do.'
      : "We received it. We'll email you when our review is complete or if we need anything else.";
  } else if (task.open === false) {
    action = el('span', {class: 'task-state', text: task.waiting || 'Opens soon'});
  } else {
    action = el('button', {class: 'btn btn-primary', type: 'button', text: followUp ? 'Send more information' : 'Start',
      onclick: () => { taskCtx = {student: owner, key: 'income'}; go('task'); }});
    note = followUp ? task.status : 'It takes a few minutes, and you can upload a photo of your document.';
  }
  box.replaceChildren(
    el('span', {class: 'income-for', text: 'For parents/guardians'}),
    el('div', {class: 'income-head'},
      el('div', {},
        el('h2', {id: 'income-card-title', text: 'Household income verification'}),
        el('p', {text: `We verify income once per household. This covers ${listNames(owners.map(s => s.firstName || studentName(s)))}.`}),
        note ? el('p', {class: followUp ? 'income-note attention' : 'income-note', text: note}) : null),
      action));
  box.hidden = false;
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
    const steps = (s.tasks || []).filter(t => t.key !== 'income');
    if (steps.length) card.append(taskList(s, steps));
  }
  return card;
}

function taskList(s, tasks) {
  return el('div', {class: 'tasks'},
    el('h4', {text: 'Next steps'}),
    el('ul', {class: 'task-list'}, tasks.map(t => {
      let action;
      if (t.done) action = el('span', {class: 'task-state done', text: 'Done'});
      else if (!t.open) action = el('span', {class: 'task-state', text: t.waiting || 'Opens soon'});
      else action = el('button', {class: 'btn btn-secondary', type: 'button', text: 'Start', onclick: () => { taskCtx = {student: s, key: t.key}; go('task'); }});
      return el('li', {class: t.done ? 'done' : ''},
        el('div', {}, el('strong', {text: t.title}), t.status && !t.done ? el('small', {text: t.status}) : null), action);
    })));
}

function initPortal() {
  $('#portal-signout').addEventListener('click', signOut);
  $('#nav-signout').addEventListener('click', () => { $('.topbar nav')?.classList.remove('show'); signOut(); });
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
  homeCity: 'City', homeState: 'State', homeZip: 'ZIP Code', homeParish: 'Parish or County',
  secondGuardian: 'Second Guardian', g2First: 'Guardian 2 First Name', g2Last: 'Guardian 2 Last Name', g2Relationship: 'Guardian 2 Relationship',
  g2Phone: 'Guardian 2 Phone', g2Email: 'Guardian 2 Email', g2Different: 'Guardian 2 Different Address', g2Street: 'Guardian 2 Street Address',
  g2Unit: 'Guardian 2 Apartment or Unit', g2City: 'Guardian 2 City', g2State: 'Guardian 2 State', g2Zip: 'Guardian 2 ZIP Code'
};

function loadNew() {
  current = 'new'; appApi().reset();
  const form = appApi().form, hh = state?.household || {};
  Object.entries(APP_FROM_HOUSEHOLD).forEach(([name, col]) => { if (hh[col]) setField(form, name, hh[col]); });
  syncReveals(form);
  setDraftHead('New application', '');
}

function loadDraft(s) {
  current = s.studentKey; appApi().restore(s.answers || {});
  const form = appApi().form, hh = state?.household || {};
  Object.entries(APP_FROM_HOUSEHOLD).forEach(([name, col]) => { if (hh[col] && !form.elements.namedItem(name)?.value) setField(form, name, hh[col]); });
  syncReveals(form);
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
  // Income is verified once per household, so it's addressed to the parent/guardian.
  const guardian = [hh['Guardian First Name'], hh['Guardian Last Name']].filter(Boolean).join(' ');
  $('#task-kicker').textContent = `${TASK_KICKER[key] || 'Next steps'} for ${key === 'income' && guardian ? guardian : studentName(student)}`;
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
    if (key === 'onboarding') startOnboarding(f, (student.tasks || []).find(t => t.key === 'onboarding') || {});
    if (key === 'transportation') startTransportation(f, (student.tasks || []).find(t => t.key === 'transportation') || {});
    if (key === 'income') startIncome(f, student, (student.tasks || []).find(t => t.key === 'income') || {});
  });
  // Onboarding has its own Back/Continue buttons; the other forms use the single Submit.
  $('#task-submit').hidden = key === 'onboarding';
  $('#task-submit').disabled = false;
}

/* ---------- onboarding: confirm what we know, ask only what's new ---------- */

// Fills the form from the application, then shows each prefilled section as a
// short summary with an Edit button. Sections with missing answers open on their own.
let obStep = 0, obSchools = {};
const OB_NAMES = ['Accept', 'Student', 'Home and school', 'Family', 'Health', 'Sign'];

function startOnboarding(form, task) {
  const prefill = task.prefill || {};
  // Name the program year the grade is for, e.g. "Grade in 2027–2028".
  const year = taskCtx?.student?.programYear;
  $('#ob-grade-label').textContent = year ? `Grade in ${fmtYear(year)}` : 'Grade this school year';
  form.elements.obGrade.dataset.sum = year ? `Grade in ${fmtYear(year)}` : 'Grade';
  obSchools = {};
  (task.schools || []).forEach(([name, district, parish]) => { obSchools[name.toLowerCase().trim()] = {district, parish}; });
  $('#ob-school-list').replaceChildren(...(task.schools || []).map(([name]) => el('option', {value: name})));
  applyPrefill(form, prefill);
  syncReveals(form); syncShows(form); syncSecondGuardianAsk(form); syncSchool(form);
  $('#ob-decline').hidden = true;
  startCards(form, prefill, 'From your application');
  obStep = 0; showObStep(form);
}

function applyPrefill(form, prefill) {
  Object.entries(prefill).forEach(([col, value]) => {
    const control = form.querySelector(`[data-col="${CSS.escape(col)}"]`);
    if (control) setField(form, control.name, value);
  });
}

// Prefilled sections show as summaries; a section with a missing answer opens on its own.
function startCards(form, prefill, source) {
  form.querySelectorAll('[data-confirm]').forEach(card => {
    const known = [...card.querySelectorAll('.confirm-fields [data-col]')].some(c => prefill[c.dataset.col]);
    const gap = !!missingIn(card), note = card.querySelector('.confirm-note');
    note.hidden = !known;
    note.textContent = gap ? `${source}. Please fill in what’s missing.` : source;
    card.classList.toggle('has-prefill', known);
    setEditing(card, !known || gap);
  });
}

/* ---------- income verification ---------- */

// What to upload for each document, shown once they pick one.
const INCOME_HELP = {
  'IRS Form 1040 (preferred)': 'Upload page 1 of your most recent IRS Form 1040. It shows your name(s) and your adjusted gross income (AGI) on line 11.',
  'Unemployment benefits letter': 'Upload your most recent unemployment benefits letter. It should show your name and the date.',
  'Social Security Disability (SSDI) award letter': 'Upload your most recent SSDI award letter. It should show your name and the date.',
  'Supplemental Security Income (SSI) award letter': 'Upload your most recent SSI award letter. It should show your name and the date.',
  'SNAP benefits letter': 'Upload your most recent SNAP benefits letter. It should show your name and the date.',
  'Subsidized housing letter': 'Upload your most recent subsidized housing letter. It should show your name and the date.',
  'Most recent pay stub (no taxes filed in the last three years)': 'Upload your most recent pay stub. It should show your name and the pay period.'
};

function startIncome(form, student, task) {
  $('#inc-intro').textContent = 'We verify income once per household, so this covers every student in your household. It takes a few minutes, and you can upload a photo of your document.';
  const note = $('#inc-followup');
  note.hidden = !task.followUp;
  note.textContent = task.followUp ? `We need a little more information: ${task.followUp}` : '';
  applyPrefill(form, task.prefill || {});
  startCards(form, task.prefill || {}, 'From your onboarding form');
  syncIncomeDoc(form);
}

function syncIncomeDoc(form) {
  const type = form.elements.incDocType.value, help = $('#inc-help');
  help.textContent = INCOME_HELP[type] || '';
  help.hidden = !type;
  $('#inc-upload').hidden = !type;
  const is1040 = /^IRS Form 1040/.test(type);
  $('#inc-separate-line').hidden = !is1040;
  if (!is1040) { form.elements.incSeparate.checked = false; $('#inc-doc2').hidden = true; }
}

/* ---------- transportation ---------- */

let trRoutes = {};

function startTransportation(form, task) {
  trRoutes = {};
  (task.schools || []).forEach(([name, route]) => { trRoutes[name.toLowerCase().trim()] = !!route; });
  $('#tr-school-list').replaceChildren(...(task.schools || []).map(([name]) => el('option', {value: name})));
  $('#tr-period').textContent = task.period || 'for the program year';
  applyPrefill(form, task.prefill || {});
  syncReveals(form);
  startCards(form, task.prefill || {}, 'From your onboarding form');
  syncRoute(form);
}

// Tells the family right away whether their school has a route.
function syncRoute(form) {
  const school = form.elements.trSchool.value.trim(), box = $('#tr-route');
  if (!school) { box.textContent = ''; box.className = 'tr-route'; return; }
  const route = trRoutes[school.toLowerCase()];
  box.className = 'tr-route ' + (route ? 'has-route' : 'no-route');
  box.textContent = route
    ? `Good news: BRYC runs a route from ${school}.`
    : `${school} doesn’t have a BRYC route right now. If you sign up, we’ll review your request. We can’t promise a route, but we review every request.`;
}

// A school on the SCHOOLS list fills its district and parish; any other school asks for them.
function syncSchool(form) {
  const known = obSchools[form.elements.obSchool.value.toLowerCase().trim()];
  const extra = $('#ob-school-extra');
  if (known && known.district && known.parish) {
    form.elements.obDistrict.value = known.district; form.elements.obSchoolParish.value = known.parish; extra.hidden = true;
  } else {
    if (extra.hidden) { form.elements.obDistrict.value = known?.district || ''; form.elements.obSchoolParish.value = known?.parish || ''; }
    extra.hidden = !form.elements.obSchool.value.trim();
  }
}

function obSteps(form) { return [...form.querySelectorAll('.wizard-step')]; }

function showObStep(form) {
  const steps = obSteps(form), last = steps.length - 1;
  steps.forEach((st, i) => st.classList.toggle('active', i === obStep));
  $('#ob-count').textContent = `Step ${obStep + 1} of ${steps.length} · ${OB_NAMES[obStep]}`;
  form.querySelectorAll('.ob-milestones li').forEach((li, i) => {
    li.classList.toggle('active', i === obStep); li.classList.toggle('done', i < obStep);
    if (i === obStep) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  $('#ob-fill').style.width = ((obStep + 1) / steps.length * 100) + '%';
  $('#ob-back').hidden = obStep === 0;
  const declining = form.elements.obAccept.value === 'no';
  $('#ob-next').textContent = declining ? 'Submit our response' : obStep === last ? 'Submit' : 'Continue →';
  $('#ob-notice').textContent = '';
  const top = $('#task').getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({top: Math.max(0, top), behavior: 'instant'});
}

// Checks only the questions on one step (other steps are hidden from the check for a moment).
function obStepErrors(form, index) {
  const others = obSteps(form).filter((_, i) => i !== index);
  others.forEach(st => { st.hidden = true; });
  try { return forms().formErrors(form); } finally { others.forEach(st => { st.hidden = false; }); }
}

function obFail(form, first) {
  openFlagged(form);
  $('#ob-notice').textContent = 'Please fix the highlighted questions.';
  first.focus({preventScroll: true}); first.scrollIntoView({behavior: 'smooth', block: 'center'});
}

async function obNext(form) {
  const steps = obSteps(form), last = steps.length - 1;
  const declining = obStep === 0 && form.elements.obAccept.value === 'no';
  const first = obStepErrors(form, obStep);
  if (first) return obFail(form, first);
  if (!declining && obStep < last) { obStep++; showObStep(form); return; }
  // Submitting: a decline sends only the first step; an acceptance sends every step.
  if (!declining) {
    const anyError = forms().formErrors(form);
    if (anyError) { obStep = steps.findIndex(st => st.contains(anyError)); showObStep(form); return obFail(form, anyError); }
  }
  const fields = forms().collectAnswers(declining ? steps[0] : form);
  await sendTask(fields, [], $('#ob-next'), $('#ob-notice'));
}

// A select with data-show reveals its target when data-show-value is chosen.
function syncShows(root) {
  root.querySelectorAll('select[data-show]').forEach(sel => { const t = $(sel.dataset.show); if (t) t.hidden = sel.value !== sel.dataset.showValue; });
}

function syncSecondGuardianAsk(form) {
  const ask = $('#ob-g2-ask'); if (ask) ask.hidden = form.elements.obSecond?.value !== 'yes';
}

function setEditing(card, on) {
  card.classList.toggle('is-editing', on);
  const toggle = card.querySelector('.confirm-toggle');
  toggle.textContent = on ? 'Done' : 'Edit';
  toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
  toggle.hidden = on && !card.classList.contains('has-prefill');
  if (!on) renderSummary(card);
}

// Hidden inside the section itself (the whole form may still be hidden until they accept).
function hiddenIn(node, card) {
  for (let n = node; n && n !== card; n = n.parentElement) if (n.hidden) return true;
  return false;
}

// First required answer in a section's prefilled part that is still blank.
function missingIn(card) {
  const fields = card.querySelector('.confirm-fields');
  for (const c of fields.querySelectorAll('input,select,textarea')) {
    if (hiddenIn(c, card) || c.type === 'radio' || c.type === 'checkbox' || !c.required) continue;
    if (!c.value.trim()) return c;
  }
  for (const group of fields.querySelectorAll('[data-required-radio]')) {
    if (!hiddenIn(group, card) && !card.closest('form').elements.namedItem(group.dataset.requiredRadio).value) return group.querySelector('input');
  }
  return null;
}

function shownValue(el) {
  const form = el.form;
  if (el.type === 'radio') { const on = [...form.elements.namedItem(el.name)].find(r => r.checked); return on ? (on.dataset.label || on.value) : ''; }
  if (el.tagName === 'SELECT') {
    if (!el.value) return '';
    if (el.dataset.other && el.value === (el.dataset.otherValue || 'Other')) { const t = $(el.dataset.other)?.querySelector('input')?.value.trim(); if (t) return t; }
    return el.selectedOptions[0].text;
  }
  return el.value.trim();
}

function renderSummary(card) {
  const dl = card.querySelector('.confirm-summary'), rows = {};
  dl.replaceChildren();
  card.querySelectorAll('.confirm-fields [data-sum], .confirm-fields [data-join]').forEach(c => {
    // A radio with data-sum is only listed when it's the one picked ("Second parent/guardian: No").
    if ((hiddenIn(c, card) && !('sumAlways' in c.dataset && c.value)) || (c.type === 'radio' && !c.checked)) return;
    const value = shownValue(c);
    if (c.dataset.join) {
      const dd = rows[c.dataset.join];
      if (dd && value) dd.textContent = dd.textContent ? dd.textContent + (c.dataset.joinSep || ', ') + value : value;
      return;
    }
    rows[c.name] = el('dd');
    rows[c.name].textContent = value;
    dl.append(el('dt', {text: c.dataset.sum, class: 'sumBreak' in c.dataset ? 'sum-break' : false}), rows[c.name]);
  });
  dl.querySelectorAll('dd').forEach(dd => { if (!dd.textContent) { dd.textContent = 'Not provided'; dd.classList.add('empty'); } });
}

function initOnboarding() {
  // Clear the 'Please fix' message once they start fixing.
  $$('.task-form').forEach(f => f.addEventListener('input', () => { if ($('#task-message').textContent.startsWith('Please fix')) $('#task-message').textContent = ''; }));
  const inc = $('.task-form[data-task="income"]');
  if (inc) inc.elements.incDocType.addEventListener('change', () => syncIncomeDoc(inc));
  const tr = $('.task-form[data-task="transportation"]');
  if (tr) {
    tr.elements.trSchool.addEventListener('input', () => syncRoute(tr));
    tr.addEventListener('change', e => { if (e.target.name === 'trSchool') syncRoute(tr); });
  }
  const form = $('.task-form[data-task="onboarding"]'); if (!form) return;
  $$('.task-form [data-confirm]').forEach(card => card.querySelector('.confirm-toggle').addEventListener('click', () => {
    if (!card.classList.contains('is-editing')) {
      setEditing(card, true);
      card.querySelector('.confirm-fields input:not([type=radio]), .confirm-fields select')?.focus({preventScroll: true});
      return;
    }
    const gap = missingIn(card);
    if (gap) { gap.focus(); gap.scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
    setEditing(card, false);
    card.querySelector('.confirm-toggle').focus({preventScroll: true});
  }));
  form.addEventListener('change', e => {
    if (e.target.matches('select[data-show]')) syncShows(form);
    if (e.target.name === 'obSecond') syncSecondGuardianAsk(form);
    if (e.target.name === 'obSchool') syncSchool(form);
    if (e.target.name === 'obAccept') { $('#ob-decline').hidden = form.elements.obAccept.value !== 'no'; showObStep(form); }
  });
  form.elements.obSchool.addEventListener('input', () => syncSchool(form));
  $('#ob-back').addEventListener('click', () => { if (obStep > 0) { obStep--; showObStep(form); } });
  $('#ob-next').addEventListener('click', () => obNext(form));
}

// Open any section that holds an unanswered question so the family can see it.
function openFlagged(form) {
  form.querySelectorAll('[data-confirm]:not(.is-editing)').forEach(card => { if (card.querySelector('.confirm-fields [aria-invalid]')) setEditing(card, true); });
}

function initTasks() {
  initOnboarding();
  // A checkbox with data-reveal-check shows its target while checked.
  $$('[data-reveal-check]').forEach(c => c.addEventListener('change', () => { const t = $(c.dataset.revealCheck); if (t) t.hidden = !c.checked; }));
  $('#task-submit').addEventListener('click', async () => {
    if (!taskCtx) return;
    const form = $(`.task-form[data-task="${taskCtx.key}"]`), msg = $('#task-message'), b = $('#task-submit');
    const first = forms().formErrors(form);
    openFlagged(form);
    if (first) { msg.textContent = 'Please fix the highlighted questions.'; first.focus({preventScroll: true}); first.scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
    let files;
    try { files = await forms().collectFiles(form); } catch (err) { msg.textContent = err.message; return; }
    await sendTask(forms().collectAnswers(form), files, b, msg);
  });
}

async function sendTask(fields, files, b, msg) {
  if (!taskCtx) return;
  busy(b, true, 'Submitting…'); msg.textContent = '';
  try {
    const {student, key} = taskCtx;
    await api('submitTask', {studentKey: student.studentKey, task: key, fields, files});
    busy(b, false); taskCtx = null; go('portal');
    flash(key === 'income'
      ? 'Thank you. We received your household income verification. A confirmation email is on its way.'
      : `Thank you. We received the ${TASK_KICKER[key].toLowerCase()} form for ${student.firstName || 'your student'}. A confirmation email is on its way.`);
  } catch (err) { msg.textContent = err.message; busy(b, false); }
}

/* ---------- sign-in state ---------- */

function setNav() {
  const label = user ? 'My portal' : 'Sign in';
  $$('#nav-portal').forEach(n => { n.textContent = label; });
  $('#nav-signout').hidden = !user;
}

async function signOut() {
  if (dirty) await saveDraft().catch(() => {});
  store(cacheKey(), null);
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
  await loadPortal();
  if (applyAfterLoad && activeView() === 'portal' && chooseApplication()) go('apply', true);
}

// Load the portal; on failure, say why and offer a retry.
async function loadPortal() {
  const box = $('#portal-error');
  box.textContent = '';
  if (!state) $('#portal-loading').hidden = false;
  try { await api('load'); return true; }
  catch (err) {
    if (!state) $('#portal-loading').hidden = true;
    box.replaceChildren(el('span', {text: err.message + ' '}),
      el('button', {class: 'inline-link', type: 'button', text: 'Try again', onclick: () => loadPortal()}));
    return false;
  }
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
