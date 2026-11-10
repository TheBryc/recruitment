/* =========================================================
   BRYC FAMILY PORTAL
   Accounts sign in with Firebase (email and password). Every request
   carries the family's Firebase ID token; this file checks it with
   Google, then reads and writes only that household's rows.

   Lives in the same Apps Script project as Code.gs.
   ========================================================= */

const PORTAL = {
  householdsSheet: 'HOUSEHOLDS',
  draftsSheet: 'PORTAL_DRAFTS',
  emailLogSheet: 'EMAIL_LOG',
  listsSheet: 'LISTS',

  // Public Firebase web key (the same one in firebase-config.js). Used only
  // to ask Google whether a sign-in token is real.
  firebaseApiKey: 'AIzaSyCUCmN1yFAyfnooIPiJL5jSfo5A3ra8sNI',

  portalUrl: 'https://thebryc.github.io/recruitment/#portal',
  applyUrl: 'https://thebryc.github.io/recruitment/#apply',
  senderName: 'BRYC Admissions',
  replyTo: 'admissions@thebryc.org',
  helpLine: 'If you have questions, reply to this email or call or text Mr. Forrest at (225) 283-1083.',

  householdPrefix: 'HH-',
  maxDraftChars: 45000,

  // Program years families can apply for. Keep in step with portal-config.js.
  openProgramYears: ['2026-2027', '2027-2028'],

  // Follow-up forms. A closed form shows as "opens soon" in the portal.
  tasks: {
    onboarding: { sheet: 'ONBOARDING_RAW', open: false, title: 'Accept your spot and complete onboarding' },
    transportation: { sheet: 'TRANSPORTATION_RAW', open: false, title: 'Reserve transportation' },
    income: { sheet: 'INCOME_RAW', open: true, title: 'Verify household income', uploadColumns: ['Document 1', 'Document 2'] }
  },

  headers: {
    HOUSEHOLDS: ['Household ID', 'Account UID', 'Account Email', 'Account Holder', 'Guardian First Name', 'Guardian Last Name',
      'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'Street Address', 'Apartment or Unit', 'City', 'State',
      'ZIP Code', 'Parish or County', 'Created', 'Updated'],
    PORTAL_DRAFTS: ['Student Key', 'Household ID', 'Student First Name', 'Student Last Name', 'Program Year', 'Draft',
      'Created', 'Updated', 'Submitted At', 'BRYC ID'],
    EMAIL_LOG: ['Sent At', 'Type', 'To', 'Subject', 'BRYC ID', 'Household ID', 'Result']
  },

  // Optional second parent/guardian, on the household and the application.
  secondGuardianFields: ['Second Guardian', 'Guardian 2 First Name', 'Guardian 2 Last Name', 'Guardian 2 Relationship', 'Guardian 2 Phone',
    'Guardian 2 Email', 'Guardian 2 Different Address', 'Guardian 2 Street Address', 'Guardian 2 Apartment or Unit',
    'Guardian 2 City', 'Guardian 2 State', 'Guardian 2 ZIP Code'],
  secondGuardianAddress: ['Guardian 2 Street Address', 'Guardian 2 Apartment or Unit', 'Guardian 2 City', 'Guardian 2 State', 'Guardian 2 ZIP Code'],

  householdFields: ['Account Holder', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone',
    'Guardian Email', 'Street Address', 'Apartment or Unit', 'City', 'State', 'ZIP Code', 'Parish or County'],
  householdRequired: ['Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email',
    'Street Address', 'City', 'State', 'ZIP Code']
};


/* =========================================================
   REQUESTS
   ========================================================= */

class PortalError extends Error {}

function handlePortal(payload) {

  try {

    const user = verifyUser(payload.idToken);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actions = { load: portalLoad, saveHousehold: portalSaveHousehold, saveDraft: portalSaveDraft,
      submitApplication: portalSubmitApplication, submitTask: portalSubmitTask };
    const action = actions[payload.action];
    if (!action) throw new PortalError('Unknown request.');

    return jsonResponse(Object.assign({ ok: true }, action(ss, user, payload)));

  } catch (err) {

    if (err instanceof PortalError) return jsonResponse({ ok: false, error: err.message });
    console.error(err);
    return jsonResponse({ ok: false, error: 'Something went wrong on our end. Please try again or contact BRYC admissions.' });

  }
}


// Asks Google who owns this sign-in token. Results are cached for five
// minutes so a busy portal session doesn't ask on every click.
function verifyUser(idToken) {

  if (!idToken || typeof idToken !== 'string') throw new PortalError('Please sign in again.');

  const cache = CacheService.getScriptCache();
  const key = 'tok-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + PORTAL.firebaseApiKey, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });

  const account = res.getResponseCode() === 200 ? (JSON.parse(res.getContentText()).users || [])[0] : null;
  if (!account || !account.localId || !account.email) throw new PortalError('Your sign-in expired. Please sign in again.');

  const user = { uid: account.localId, email: String(account.email).toLowerCase(), verified: account.emailVerified === true };
  cache.put(key, JSON.stringify(user), 300);
  return user;
}


function portalLoad(ss, user) {

  return { state: portalState(ss, user) };
}


function portalSaveHousehold(ss, user, payload) {

  const fields = cleanPortalFields(payload.fields, PORTAL.householdFields.concat(PORTAL.secondGuardianFields));
  const missing = PORTAL.householdRequired.filter(h => isBlank(fields[h]));
  if (missing.length) throw new PortalError('Please complete: ' + missing.join(', '));
  clearSecondGuardian(fields);

  withLock(() => {
    const sheet = portalSheet(ss, PORTAL.householdsSheet);
    const found = findRow(sheet, 'Account UID', user.uid);
    const now = new Date();

    if (found) {
      writeRow(sheet, found.row, Object.assign({}, fields, { 'Account Email': user.email, Updated: now }));
    } else {
      appendByHeader(sheet, Object.assign({}, fields, {
        'Household ID': nextHouseholdId(sheet), 'Account UID': user.uid, 'Account Email': user.email, Created: now, Updated: now
      }));
    }
  });

  return { state: portalState(ss, user) };
}


// Saves application progress. A new student gets a key the first time.
function portalSaveDraft(ss, user, payload) {

  const household = requireHousehold(ss, user);
  const draft = JSON.stringify(payload.answers || {});
  if (draft.length > PORTAL.maxDraftChars) throw new PortalError('This application is too long to save. Please shorten your answers.');

  const names = cleanPortalFields(payload.fields || {}, ['Student First Name', 'Student Last Name', 'Program Year']);

  let studentKey = cleanValue(payload.studentKey);

  withLock(() => {
    const sheet = portalSheet(ss, PORTAL.draftsSheet);
    const now = new Date();

    if (studentKey) {
      const found = findOwnedDraft(sheet, studentKey, household);
      if (!isBlank(found.values['Submitted At'])) throw new PortalError('This application was already submitted.');
      writeRow(sheet, found.row, Object.assign({}, names, { Draft: draft, Updated: now }));
    } else {
      studentKey = 'S-' + Utilities.getUuid().slice(0, 8).toUpperCase();
      appendByHeader(sheet, Object.assign({}, names, {
        'Student Key': studentKey, 'Household ID': household['Household ID'], Draft: draft, Created: now, Updated: now
      }));
    }
  });

  return { studentKey: studentKey };
}


function portalSubmitApplication(ss, user, payload) {

  if (!user.verified) throw new PortalError('Please confirm your email address before submitting. Check your inbox for the link we sent.');

  const household = requireHousehold(ss, user);
  const studentKey = cleanValue(payload.studentKey);
  const fields = cleanPayloadFields(payload.fields);

  if (!PORTAL.openProgramYears.includes(fields['Program Year'])) {
    throw new PortalError('Applications for that school year are closed.');
  }

  const missing = CONFIG.forms.application.required.filter(h => isBlank(fields[h]));
  if (missing.length) throw new PortalError('Missing required answers: ' + missing.join(', '));

  withLock(() => {
    const drafts = portalSheet(ss, PORTAL.draftsSheet);
    const found = findOwnedDraft(drafts, studentKey, household);
    if (!isBlank(found.values['Submitted At'])) throw new PortalError('This application was already submitted.');

    const now = new Date();
    Object.assign(fields, { Timestamp: now, 'Household ID': household['Household ID'], 'Student Key': studentKey });

    (payload.files || [])
      .filter(file => CONFIG.uploadColumns.includes(file.column))
      .forEach(file => { fields[file.column] = saveUpload(file, fields); });

    appendByHeader(ss.getSheetByName(CONFIG.forms.application.sheet), fields);
    writeRow(drafts, found.row, {
      'Student First Name': fields['Student First Name'], 'Student Last Name': fields['Student Last Name'],
      'Program Year': fields['Program Year'], 'Submitted At': now, Updated: now
    });
  });

  sendFamilyEmail(ss, 'Application received', familyRecipients(user.email, household, fields['Guardian Email']), {
    subject: `We received ${fields['Student First Name']}'s BRYC application`,
    greeting: household['Guardian First Name'],
    lines: [
      `Thank you for applying to BRYC. We received ${fields['Student First Name']}'s application for the ${displayYear(fields['Program Year'])} school year.`,
      'You can check its status anytime in your BRYC portal. We will email you when it moves forward.'
    ],
    button: 'View your portal',
    householdId: household['Household ID']
  });

  return { state: portalState(ss, user) };
}


// Follow-up forms for admitted students.
function portalSubmitTask(ss, user, payload) {

  const household = requireHousehold(ss, user);
  const taskKey = cleanValue(payload.task);
  const task = PORTAL.tasks[taskKey];
  if (!task) throw new PortalError('Unknown form.');
  if (!task.open) throw new PortalError('This form is not open yet.');

  const student = portalState(ss, user).students.find(s => s.studentKey === cleanValue(payload.studentKey));
  const item = student && (student.tasks || []).find(t => t.key === taskKey);
  if (!item) throw new PortalError('This form is not available for this student.');
  if (item.done) throw new PortalError('This form was already submitted.');

  const fields = cleanPayloadFields(payload.fields);
  const now = new Date();
  Object.assign(fields, { Timestamp: now, 'BRYC ID': student.brycId, 'Household ID': household['Household ID'], 'Student Key': student.studentKey });

  withLock(() => {
    (payload.files || [])
      .filter(file => (task.uploadColumns || []).includes(file.column))
      .forEach(file => {
        fields[file.column] = saveUpload(file, Object.assign({ 'Student Last Name': student.lastName, 'Student First Name': student.firstName }, fields),
          taskKey === 'income' ? 'INCOME_FOLDER_ID' : 'UPLOAD_FOLDER_ID');
      });

    appendByHeader(portalSheet(ss, task.sheet), fields);
    updateMasterAfterTask(ss, student.brycId, taskKey, fields, now);
  });

  return { state: portalState(ss, user) };
}


function updateMasterAfterTask(ss, brycId, taskKey, fields, now) {

  const master = ss.getSheetByName(CONFIG.masterSheet);
  const headers = getHeaderMap(master);
  const row = findMasterRow(master, headers[normalizeHeader('BRYC ID')], brycId);
  if (!row) return;

  if (taskKey === 'onboarding') {
    const declined = /^no/i.test(cleanValue(fields['Accepts Admission']));
    if (declined) {
      // The family told us themselves, so no "decision is ready" email follows.
      setMasterValue(master, row, headers, 'Decision', 'Declined');
      setMasterValue(master, row, headers, 'Family Notified', 'decision:Declined');
    } else {
      setMasterValue(master, row, headers, 'Onboarding Status', 'Complete');
      setMasterValue(master, row, headers, 'Onboarding Date', now);
    }
  }

  if (taskKey === 'income') setMasterValue(master, row, headers, 'Income Verification Status', 'Submitted');

  setMasterValue(master, row, headers, 'Last Activity', now);
  recalculateOperationalFields(master, row);
}


/* =========================================================
   WHAT THE FAMILY SEES
   ========================================================= */

function portalState(ss, user) {

  const household = findHousehold(ss, user);
  const state = { account: { email: user.email, verified: user.verified }, household: household, students: [],
    openProgramYears: PORTAL.openProgramYears };
  if (!household) return state;

  const drafts = readObjects(portalSheet(ss, PORTAL.draftsSheet))
    .filter(d => d['Household ID'] === household['Household ID']);
  const master = readObjects(ss.getSheetByName(CONFIG.masterSheet));
  const labels = familyLabels(ss);

  state.students = drafts.map(d => studentView(d, master.find(m => !isBlank(d['BRYC ID']) && m['BRYC ID'] === d['BRYC ID']), labels, ss));
  return state;
}


function studentView(draft, master, labels, ss) {

  let answers = {};
  try { answers = JSON.parse(draft.Draft || '{}'); } catch (e) { answers = {}; }

  const view = {
    studentKey: draft['Student Key'],
    firstName: cleanValue(draft['Student First Name']),
    lastName: cleanValue(draft['Student Last Name']),
    programYear: cleanValue(draft['Program Year']),
    brycId: cleanValue(draft['BRYC ID']),
    updated: isoDate(draft.Updated),
    submittedAt: isoDate(draft['Submitted At']),
    answers: isBlank(draft['Submitted At']) ? answers : null,
    stage: 'draft',
    status: 'Application started',
    decision: '',
    tasks: []
  };

  if (!view.submittedAt) return view;

  view.stage = 'received';
  view.status = 'Application received';
  if (!master) return view;

  const appStatus = cleanValue(master['Application Status']);
  if (labels.status[appStatus]) view.status = labels.status[appStatus];
  if (!['Application started', 'Application received'].includes(view.status)) view.stage = 'review';

  const decision = cleanValue(master.Decision);
  if (isReleased(master['Decision Released']) && decision) {
    view.stage = 'decision';
    view.decision = labels.decision[decision] || decision;
    if (/admitted/i.test(decision)) view.tasks = studentTasks(master, view, ss);
  }

  return view;
}


function studentTasks(master, view, ss) {

  const has = taskKey => readObjects(portalSheet(ss, PORTAL.tasks[taskKey].sheet)).some(r => r['Student Key'] === view.studentKey);
  const tasks = [];

  const onboarding = normalizeText(master['Onboarding Status']);
  tasks.push({ key: 'onboarding', title: PORTAL.tasks.onboarding.title, open: PORTAL.tasks.onboarding.open,
    done: onboarding.includes('complete') || has('onboarding'), status: onboarding.includes('complete') ? 'Complete' : '' });

  tasks.push({ key: 'transportation', title: PORTAL.tasks.transportation.title, open: PORTAL.tasks.transportation.open,
    done: has('transportation'), status: '' });

  if (normalizeText(master['Income Verification Required']) === 'yes') {
    const income = cleanValue(master['Income Verification Status']);
    const done = /submitted|verified|complete|not required/i.test(income);
    tasks.push({ key: 'income', title: PORTAL.tasks.income.title, open: PORTAL.tasks.income.open,
      done: done, status: /needs follow/i.test(income) ? 'We need a little more information. Please check your email.' : (done ? income : '') });
  }

  return tasks;
}


// Reads the "Family Sees" columns on LISTS so staff control the wording.
function familyLabels(ss) {

  const rows = readObjects(ss.getSheetByName(PORTAL.listsSheet));
  const status = {}, decision = {};
  rows.forEach(r => {
    if (!isBlank(r['Application Status'])) status[cleanValue(r['Application Status'])] = cleanValue(r['Family Sees (Status)']);
    if (!isBlank(r.Decision)) decision[cleanValue(r.Decision)] = cleanValue(r['Family Sees (Decision)']);
  });
  return { status: status, decision: decision };
}


function isReleased(value) {

  return value === true || /^(true|yes|released)$/i.test(cleanValue(value));
}


/* =========================================================
   LINKING AND EMAILS (called from processPending in Code.gs)
   ========================================================= */

// After an application gets its BRYC ID, record it on the family's draft
// and mark the received email as already sent.
function linkPortalApplication(ss, response, brycId) {

  const studentKey = cleanValue(pick(response, ['Student Key']));
  if (!studentKey) return;

  const drafts = portalSheet(ss, PORTAL.draftsSheet);
  const found = findRow(drafts, 'Student Key', studentKey);
  if (found) writeRow(drafts, found.row, { 'BRYC ID': brycId });

  const master = ss.getSheetByName(CONFIG.masterSheet);
  const headers = getHeaderMap(master);
  const row = findMasterRow(master, headers[normalizeHeader('BRYC ID')], brycId);
  if (row) setMasterIfBlank(master, row, headers, 'Family Notified', 'status:Application received');
}


// Emails families when what they would see in the portal changes:
// review, a released decision, or a request for income verification.
function sendStatusEmails(ss) {

  const master = ss.getSheetByName(CONFIG.masterSheet);
  if (!master || master.getLastRow() < 2) return;

  ['Household ID', 'Decision Released', 'Family Notified', 'Income Request Sent'].forEach(h => ensureHeader(master, h));
  const map = getHeaderMap(master);
  const rows = readObjects(master);
  const households = readObjects(portalSheet(ss, PORTAL.householdsSheet));
  const labels = familyLabels(ss);

  rows.forEach((m, i) => {

    const householdId = cleanValue(m['Household ID']);
    if (!householdId) return;
    const household = households.find(h => h['Household ID'] === householdId);
    if (!household) return;

    const row = i + 2;
    const first = cleanValue(m['Fellow First Name']);
    const to = familyRecipients(household['Account Email'], household, m['Guardian Email']);
    const decision = cleanValue(m.Decision);
    const released = isReleased(m['Decision Released']) && decision;
    const key = released ? 'decision:' + decision : 'status:' + (labels.status[cleanValue(m['Application Status'])] || 'Application received');
    const base = { greeting: household['Guardian First Name'], button: 'View your portal', brycId: m['BRYC ID'], householdId: householdId };

    if (key !== cleanValue(m['Family Notified'])) {
      let sent = true;
      if (key === 'status:Under review') {
        sent = sendFamilyEmail(ss, 'Under review', to, Object.assign({}, base, {
          subject: `${first}'s BRYC application is under review`,
          lines: [`Our admissions team is now reviewing ${first}'s application.`, 'We will email you as soon as a decision is ready.']
        }));
      } else if (released) {
        sent = sendFamilyEmail(ss, 'Decision released', to, Object.assign({}, base, {
          subject: `A decision is ready for ${first}'s BRYC application`,
          lines: [`A decision on ${first}'s application is ready.`, 'Please sign in to your BRYC portal to view it and see any next steps.']
        }));
      }
      if (sent) master.getRange(row, map[normalizeHeader('Family Notified')]).setValue(key);
    }

    const incomeAsked = released && /admitted/i.test(decision) && normalizeText(m['Income Verification Required']) === 'yes';
    if (incomeAsked && isBlank(m['Income Request Sent']) && PORTAL.tasks.income.open) {
      const sent = sendFamilyEmail(ss, 'Income verification request', to, Object.assign({}, base, {
        subject: `One more step for ${first}: income verification`,
        lines: [`To finish ${first}'s enrollment, we need to verify your household income.`,
          'Sign in to your BRYC portal and open "Verify household income." It takes a few minutes, and you can upload a photo of your document.']
      }));
      if (sent) master.getRange(row, map[normalizeHeader('Income Request Sent')]).setValue(new Date());
    }
  });
}


function familyRecipients(accountEmail, household, applicationGuardianEmail) {

  const emails = [accountEmail, household && household['Guardian Email'], applicationGuardianEmail]
    .map(e => normalizeEmail(e)).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return emails.filter((e, i) => emails.indexOf(e) === i);
}


// Sends one plain, short email and logs it. Returns false if it could not send.
// Sent once per interest form, when it's processed. The information sheet link
// comes from the script property INFO_SHEET_URL (a Drive or website link), so it
// can change without touching the code. Without it, the email points to the
// application instead.
function sendInquiryEmail(ss, response, brycId) {

  try {
    const student = cleanValue(pick(response, ['Student First Name']));
    const guardian = cleanValue(pick(response, ['Guardian First Name']));
    const to = familyRecipients(pick(response, ['Student Email']), null, pick(response, ['Guardian Email']));
    const sheetUrl = cleanValue(PropertiesService.getScriptProperties().getProperty('INFO_SHEET_URL'));

    const lines = [`Thank you for your interest in BRYC. We received ${student ? student + "'s" : 'your'} information, and someone from our admissions team will reach out soon.`];
    if (sheetUrl) lines.push('Our information sheet has an overview of BRYC. You can open it with the button below.');
    lines.push(`When you're ready to apply, a parent/guardian can create a household account at ${PORTAL.applyUrl}.`);

    sendFamilyEmail(ss, 'Inquiry received', to, {
      subject: 'Thanks for your interest in BRYC',
      greeting: guardian || student,
      lines: lines,
      button: sheetUrl ? 'View the BRYC information sheet' : 'Start an application',
      buttonUrl: sheetUrl || PORTAL.applyUrl,
      brycId: brycId
    });
  } catch (err) {
    console.error('Inquiry email failed: ' + err.message);
  }
}


function sendFamilyEmail(ss, type, to, msg) {

  const log = portalSheet(ss, PORTAL.emailLogSheet);
  const entry = { 'Sent At': new Date(), Type: type, To: to.join(', '), Subject: msg.subject, 'BRYC ID': msg.brycId || '', 'Household ID': msg.householdId || '' };

  if (!to.length) {
    appendByHeader(log, Object.assign(entry, { Result: 'Skipped: no email address' }));
    return true;
  }

  try {
    if (MailApp.getRemainingDailyQuota() < to.length) throw new Error('Daily email limit reached');

    const hello = msg.greeting ? `Hi ${msg.greeting},` : 'Hello,';
    const link = msg.buttonUrl || PORTAL.portalUrl;
    const text = [hello, ''].concat(msg.lines.map(l => l + '\n'), [`${msg.button}: ${link}`, '', PORTAL.helpLine, '', 'BRYC Admissions']).join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#161616;max-width:560px">`
      + `<p>${escapeHtml(hello)}</p>` + msg.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')
      + `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${escapeHtml(msg.button)}</a></p>`
      + `<p style="color:#5d5f66">${escapeHtml(PORTAL.helpLine)}</p><p>BRYC Admissions</p></div>`;

    MailApp.sendEmail({ to: to.join(','), subject: msg.subject, body: text, htmlBody: html, name: PORTAL.senderName, replyTo: PORTAL.replyTo });
    appendByHeader(log, Object.assign(entry, { Result: 'Sent' }));
    return true;

  } catch (err) {
    console.error('Email failed: ' + err.message);
    appendByHeader(log, Object.assign(entry, { Result: 'Failed: ' + err.message }));
    return false;
  }
}


/* =========================================================
   HELPERS
   ========================================================= */

function findHousehold(ss, user) {

  const found = findRow(portalSheet(ss, PORTAL.householdsSheet), 'Account UID', user.uid);
  return found ? found.values : null;
}


function requireHousehold(ss, user) {

  const household = findHousehold(ss, user);
  if (!household) throw new PortalError('Please add your household information first.');
  return household;
}


function findOwnedDraft(sheet, studentKey, household) {

  const found = studentKey && findRow(sheet, 'Student Key', studentKey);
  if (!found || found.values['Household ID'] !== household['Household ID']) throw new PortalError('We could not find that application.');
  return found;
}


function nextHouseholdId(sheet) {

  let highest = 0;
  readObjects(sheet).forEach(r => {
    const m = String(r['Household ID'] || '').match(/^HH-(\d+)$/);
    if (m) highest = Math.max(highest, Number(m[1]));
  });
  return PORTAL.householdPrefix + String(highest + 1).padStart(4, '0');
}


// Creates a portal tab with its headers the first time it's needed.
function portalSheet(ss, name) {

  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = PORTAL.headers[name];
    if (headers) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}


function readObjects(sheet) {

  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues().map(values => {
    const obj = {};
    headers.forEach((h, i) => { if (h && !(h in obj)) obj[h] = values[i]; });
    return obj;
  });
}


function findRow(sheet, header, value) {

  if (isBlank(value) || sheet.getLastRow() < 2) return null;
  const rows = readObjects(sheet);
  const i = rows.findIndex(r => cleanValue(r[header]) === cleanValue(value));
  return i < 0 ? null : { row: i + 2, values: rows[i] };
}


function writeRow(sheet, row, fields) {

  const map = getHeaderMap(sheet);
  Object.entries(fields).forEach(([header, value]) => {
    const column = map[normalizeHeader(header)];
    if (column) sheet.getRange(row, column).setValue(value);
  });
}


// Blank answers are dropped before saving, so a removed second guardian (or a
// second address they no longer need) is cleared here on purpose.
function clearSecondGuardian(fields) {

  const has = normalizeText(fields['Second Guardian']) === 'yes';
  fields['Second Guardian'] = has ? 'Yes' : 'No';
  const clear = has ? (normalizeText(fields['Guardian 2 Different Address']) === 'yes' ? [] : PORTAL.secondGuardianAddress)
    : PORTAL.secondGuardianFields.filter(h => h !== 'Second Guardian');
  clear.forEach(h => { fields[h] = ''; });
  if (has && !clear.length) fields['Guardian 2 Different Address'] = 'Yes';
  else if (has) fields['Guardian 2 Different Address'] = 'No';
}


function cleanPortalFields(raw, allowed) {

  const cleaned = cleanPayloadFields(raw);
  const out = {};
  allowed.forEach(h => { if (h in cleaned) out[h] = cleaned[h]; });
  return out;
}


function withLock(fn) {

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}


function isoDate(value) {

  if (isBlank(value)) return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}


function displayYear(value) {

  return cleanValue(value).replace('-', '–');
}


function escapeHtml(value) {

  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
