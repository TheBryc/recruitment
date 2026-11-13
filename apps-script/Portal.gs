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
  // School, School District, School Parish. Staff keep it current; onboarding fills district and parish from it.
  schoolsSheet: 'SCHOOLS',

  // Public Firebase web key (the same one in firebase-config.js). Used only
  // to ask Google whether a sign-in token is real.
  firebaseApiKey: 'AIzaSyCUCmN1yFAyfnooIPiJL5jSfo5A3ra8sNI',

  portalUrl: 'https://thebryc.github.io/recruitment/#portal',
  applyUrl: 'https://thebryc.github.io/recruitment/#apply',
  referUrl: 'https://thebryc.github.io/recruitment/#refer',
  senderName: 'BRYC Admissions',
  replyTo: 'admissions@thebryc.org',
  helpLine: 'If you have questions, reply to this email or call or text Mr. Forrest at (225) 283-1083.',

  householdPrefix: 'HH-',
  maxDraftChars: 45000,

  // When each school year takes applications (Central time, whole days).
  // opens/closes are the first and last days; seniorsClose is the last day for
  // students who will be in 12th grade that year. Add next year's row here.
  applicationWindows: [
    { year: '2026-2027', opens: '2026-08-01', closes: '2027-01-22' },
    { year: '2027-2028', opens: '2027-02-01', closes: '2027-06-15', seniorsClose: '2027-04-30' }
  ],
  timeZone: 'America/Chicago',

  // Follow-up forms. A closed form shows as "opens soon" in the portal.
  tasks: {
    onboarding: { sheet: 'ONBOARDING_RAW', open: true, title: 'Accept your spot and complete onboarding' },
    transportation: { sheet: 'TRANSPORTATION_RAW', open: true, title: 'Reserve transportation' },
    income: { sheet: 'INCOME_RAW', open: true, title: 'Verify household income', uploadColumns: ['Document 1', 'Document 2'] }
  },

  // Onboarding starts from what the family already told us. Each pair is
  // [onboarding column, where it comes from]. Address and guardian answers
  // come from the household first (the family keeps it current), then the
  // application. Everything else comes from the application.
  onboardingPrefill: [
    ['Student First Name', 'Student First Name'], ['Student Last Name', 'Student Last Name'],
    ['Student Gender', 'Student Gender Identity'], ['Student Email', 'Student Email'], ['Student Phone', 'Student Phone'],
    ['Street Address', 'Street Address', 'household'], ['Apartment or Unit', 'Apartment or Unit', 'household'],
    ['City', 'City', 'household'], ['State', 'State', 'household'], ['ZIP Code', 'ZIP Code', 'household'],
    ['Parish', 'Parish or County', 'household'],
    ['Grade in Program Year', 'Grade in Program Year'], ['School', 'School'],
    ['Guardian First Name', 'Guardian First Name', 'household'], ['Guardian Last Name', 'Guardian Last Name', 'household'],
    ['Guardian Relationship', 'Guardian Relationship', 'household'], ['Guardian Phone', 'Guardian Phone', 'household'],
    ['Guardian Email', 'Guardian Email', 'household'],
    ['Second Guardian', 'Second Guardian', 'household'],
    ['Second Guardian First Name', 'Guardian 2 First Name', 'household'], ['Second Guardian Last Name', 'Guardian 2 Last Name', 'household'],
    ['Second Guardian Relationship', 'Guardian 2 Relationship', 'household'], ['Second Guardian Phone', 'Guardian 2 Phone', 'household'],
    ['Second Guardian Email', 'Guardian 2 Email', 'household'],
    ['Second Guardian Same Address', 'Guardian 2 Different Address', 'household'],
    ['Second Guardian Street Address', 'Guardian 2 Street Address', 'household'],
    ['Second Guardian Apartment or Unit', 'Guardian 2 Apartment or Unit', 'household'],
    ['Second Guardian City', 'Guardian 2 City', 'household'], ['Second Guardian State', 'Guardian 2 State', 'household'],
    ['Second Guardian ZIP Code', 'Guardian 2 ZIP Code', 'household'],
    ['Primary Language', 'Home Language'], ['Household Income Range', 'Household Income Range'],
    ['Family BRYC Graduate Names', 'Relative Names']
  ],

  // Every column the onboarding form can send. Anything else is dropped, and
  // missing columns are added to ONBOARDING_RAW the first time they're used.
  onboardingColumns: ['Accepts Admission', 'Decline Reason',
    'Student First Name', 'Student Last Name', 'Student Gender', 'Student Email', 'Student Phone',
    'Student Preferred First Name', 'Student Pronouns', 'Student Race / Ethnicity', 'Race / Ethnicity Description',
    'Student Birthday', 'T-Shirt Size',
    'Street Address', 'Apartment or Unit', 'City', 'State', 'ZIP Code', 'Parish',
    'Grade in Program Year', 'School', 'School District', 'School Parish', 'Platform Access Permission',
    'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email',
    'Second Guardian', 'Second Guardian First Name', 'Second Guardian Last Name', 'Second Guardian Relationship',
    'Second Guardian Phone', 'Second Guardian Email', 'Second Guardian Same Address', 'Second Guardian Street Address',
    'Second Guardian Apartment or Unit', 'Second Guardian City', 'Second Guardian State', 'Second Guardian ZIP Code',
    'Second Guardian On Communications',
    'Primary Language', 'Household Income Range', 'Government Assistance', 'Family BRYC Graduate', 'Family BRYC Graduate Names',
    'Non-Food Allergies', 'Food Allergies or Dietary Restrictions', 'Activity Restrictions', 'Prescription Medications',
    'Approved Medications', 'Injury or Illness', 'Neurodivergent Diagnosis', 'Testing Accommodations', 'Environmental Factors',
    'Policies Acknowledged', 'Counseling Permission', 'Media Permission', 'Guardian Signature', 'Information Confirmed'],

  // Columns staff fill in on INCOME_RAW, and what the script fills in after a review.
  incomeReviewColumns: ['Verified AGI', 'Verification Result', 'Note to Family', 'Verified By', 'Verified Date', 'Participation Fee', 'Family Notified'],
  incomeColumns: ['Guardian First Name', 'Guardian Last Name', 'Guardian Email', 'Guardian Phone', 'Document Type', 'Filed Separately', 'Notes'],

  // Every column the transportation form can send, plus what the script adds.
  transportationColumns: ['Needs BRYC Transportation', 'Student First Name', 'Student Last Name', 'Grade in Program Year', 'School',
    'Guardian First Name', 'Guardian Last Name', 'Guardian Phone', 'Guardian Email', 'Authorization Agreed', 'Guardian Signature', 'Notes'],
  transportationAdded: ['School Has Route', 'Authorization Period'],

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

  const windows = applicationWindows();
  if (!windows.open.includes(fields['Program Year'])) {
    throw new PortalError('Applications for that school year are closed.'
      + (windows.next ? ` Applications for the ${displayYear(windows.next.year)} school year open ${windows.next.opens}.` : ''));
  }
  const seniors = windows.seniorsClosed.find(s => s.year === fields['Program Year']);
  if (seniors && /^12/.test(cleanValue(fields['Grade in Program Year']))) {
    throw new PortalError(`Applications from rising seniors for the ${displayYear(seniors.year)} school year closed ${seniors.closed}.`);
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
  if (item.open === false) throw new PortalError('This form is not open yet.');

  let fields = cleanPayloadFields(payload.fields);
  if (taskKey === 'onboarding') {
    fields = cleanPortalFields(fields, PORTAL.onboardingColumns);
    // A school on the SCHOOLS tab always gets its district and parish from there.
    const school = schoolInfo(ss)[normalizeText(fields['School'])];
    if (school && school.district) fields['School District'] = school.district;
    if (school && school.parish) fields['School Parish'] = school.parish;
    // Tell staff what the family corrected, so they can update MASTER.
    if (!/^no/i.test(cleanValue(fields['Accepts Admission']))) fields['Changed From Application'] = changedFromApplication(item.prefill, fields);
  }
  if (taskKey === 'income') {
    fields = cleanPortalFields(fields, PORTAL.incomeColumns);
    // One submission covers every student in the household who needs it.
    fields['Students'] = portalState(ss, user).students
      .filter(s => (s.tasks || []).some(t => t.key === 'income'))
      .map(s => [s.firstName, s.lastName].filter(Boolean).join(' ') + (s.brycId ? ' (' + s.brycId + ')' : '')).join('; ');
  }
  if (taskKey === 'transportation') {
    fields = cleanPortalFields(fields, PORTAL.transportationColumns);
    const riding = /^yes/i.test(cleanValue(fields['Needs BRYC Transportation']));
    if (riding) {
      if (isBlank(fields['Authorization Agreed']) || isBlank(fields['Guardian Signature'])) {
        throw new PortalError('Please agree to the Authorization to Transport and sign before submitting.');
      }
      const school = schoolInfo(ss)[normalizeText(fields['School'])];
      fields['School Has Route'] = school && school.route ? 'Yes' : 'No';
      fields['Authorization Period'] = authorizationPeriod(student.programYear);
    } else {
      delete fields['Authorization Agreed'];
    }
  }
  const now = new Date();
  Object.assign(fields, { Timestamp: now, 'BRYC ID': student.brycId, 'Household ID': household['Household ID'], 'Student Key': student.studentKey });

  withLock(() => {
    if (taskKey === 'onboarding') {
      ensureColumns(portalSheet(ss, task.sheet), ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key']
        .concat(PORTAL.onboardingColumns, ['Changed From Application']));
    }
    if (taskKey === 'income') {
      ensureColumns(portalSheet(ss, task.sheet), ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key']
        .concat(PORTAL.incomeColumns, ['Students', 'Document 1', 'Document 2'], PORTAL.incomeReviewColumns));
    }
    if (taskKey === 'transportation') {
      ensureColumns(portalSheet(ss, task.sheet), ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key']
        .concat(PORTAL.transportationColumns, PORTAL.transportationAdded));
    }

    (payload.files || [])
      .filter(file => (task.uploadColumns || []).includes(file.column))
      .forEach(file => {
        fields[file.column] = saveUpload(file, Object.assign({ 'Student Last Name': student.lastName, 'Student First Name': student.firstName }, fields),
          taskKey === 'income' ? 'INCOME_FOLDER_ID' : 'UPLOAD_FOLDER_ID');
      });

    appendByHeader(portalSheet(ss, task.sheet), fields);
    updateMasterAfterTask(ss, student.brycId, taskKey, fields, now);
  });

  sendTaskConfirmation(ss, user, household, student, taskKey, fields);

  return { state: portalState(ss, user) };
}


// Confirms each follow-up form the moment it's submitted.
function sendTaskConfirmation(ss, user, household, student, taskKey, fields) {

  const first = student.firstName || 'your student';
  const declined = taskKey === 'onboarding' && /^no/i.test(cleanValue(fields['Accepts Admission']));
  const messages = {
    onboarding: declined
      ? { type: 'Onboarding declined', subject: `We received your response for ${first}`,
          lines: [`Thank you for letting us know ${first} won't be joining BRYC this year.`, 'If anything changes, reply to this email and we will help.'] }
      : { type: 'Onboarding received', subject: `We received ${first}'s onboarding form`,
          lines: [`Thank you for completing ${first}'s onboarding form. We're excited to welcome ${first} to BRYC.`,
            'If there is anything else we need from you, it will show in your BRYC portal and we will email you.'] },
    income: { type: 'Income verification received', subject: 'We received your household income verification',
      lines: ['Thank you for sending your household income verification. It covers every student in your household.',
        'Our team will review it and email you when it is complete or if we need anything else.'] },
    transportation: transportationMessage(first, fields)
  };
  const msg = messages[taskKey];
  if (!msg) return;

  sendFamilyEmail(ss, msg.type, familyRecipients(user.email, household, fields['Guardian Email']), {
    subject: msg.subject, greeting: household['Guardian First Name'], lines: msg.lines,
    button: 'View your portal', brycId: student.brycId, householdId: household['Household ID']
  });
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

  if (taskKey === 'income') {
    householdIncomeRows(master, fields['Household ID'], brycId).rows.forEach(s => {
      setMasterValue(master, s.row, headers, 'Income Verification Status', 'Submitted');
      if (s.row !== row) { setMasterValue(master, s.row, headers, 'Last Activity', now); recalculateOperationalFields(master, s.row); }
    });
  }

  if (taskKey === 'transportation') {
    ensureHeader(master, 'Transportation');
    const riding = /^yes/i.test(cleanValue(fields['Needs BRYC Transportation']));
    const value = !riding ? 'Not riding' : (fields['School Has Route'] === 'Yes' ? 'Riding from ' : 'Requested route from ') + cleanValue(fields['School']);
    setMasterValue(master, row, getHeaderMap(master), 'Transportation', value);
  }

  setMasterValue(master, row, headers, 'Last Activity', now);
  recalculateOperationalFields(master, row);
}


/* =========================================================
   WHAT THE FAMILY SEES
   ========================================================= */

function portalState(ss, user) {

  const household = findHousehold(ss, user);
  const windows = applicationWindows();
  const state = { account: { email: user.email, verified: user.verified }, household: household, students: [],
    openProgramYears: windows.open, seniorsClosed: windows.seniorsClosed, nextOpening: windows.next };
  if (!household) return state;

  const drafts = readObjects(portalSheet(ss, PORTAL.draftsSheet))
    .filter(d => d['Household ID'] === household['Household ID']);
  const master = readObjects(ss.getSheetByName(CONFIG.masterSheet));
  const labels = familyLabels(ss);

  state.students = drafts.map(d => studentView(d, master.find(m => !isBlank(d['BRYC ID']) && m['BRYC ID'] === d['BRYC ID']), labels, ss, household));
  return state;
}


function studentView(draft, master, labels, ss, household) {

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
    // Only an exact "Admitted" unlocks next steps (never "Not admitted").
    if (isAdmitted(decision)) view.tasks = studentTasks(master, view, ss, household);
  }

  return view;
}


function studentTasks(master, view, ss, household) {

  const has = taskKey => readObjects(portalSheet(ss, PORTAL.tasks[taskKey].sheet)).some(r => r['Student Key'] === view.studentKey);
  const tasks = [];

  const onboarding = normalizeText(master['Onboarding Status']);
  const onboardingTask = { key: 'onboarding', title: PORTAL.tasks.onboarding.title, open: PORTAL.tasks.onboarding.open,
    done: onboarding.includes('complete') || has('onboarding'), status: onboarding.includes('complete') ? 'Complete' : '' };
  // Only sent while the form is open and unfinished, and only to this household.
  if (onboardingTask.open && !onboardingTask.done) {
    onboardingTask.prefill = onboardingPrefill(ss, view.studentKey, household);
    // So the form can fill district and parish if the family changes schools.
    onboardingTask.schools = Object.values(schoolInfo(ss)).map(s => [s.name, s.district, s.parish]);
  }
  tasks.push(onboardingTask);

  // Transportation opens once onboarding is done, so it starts from the confirmed answers.
  const transportationTask = { key: 'transportation', title: PORTAL.tasks.transportation.title,
    open: PORTAL.tasks.transportation.open && onboardingTask.done, done: has('transportation'), status: '' };
  if (PORTAL.tasks.transportation.open && !onboardingTask.done) transportationTask.waiting = 'After onboarding';
  if (transportationTask.open && !transportationTask.done) {
    transportationTask.prefill = transportationPrefill(ss, view.studentKey, household);
    transportationTask.schools = Object.values(schoolInfo(ss)).map(s => [s.name, s.route ? 1 : 0]);
    transportationTask.period = authorizationPeriod(view.programYear);
  }
  tasks.push(transportationTask);

  if (normalizeText(master['Income Verification Required']) === 'yes') {
    // Income is verified once per household: a sibling's submission counts for everyone.
    const shared = householdIncome(ss, household && household['Household ID']);
    const income = shared ? shared.status : cleanValue(master['Income Verification Status']);
    const done = /submitted|verified|complete|not required/i.test(income);
    const incomeTask = { key: 'income', title: PORTAL.tasks.income.title, open: PORTAL.tasks.income.open,
      done: done, status: /needs follow/i.test(income) ? 'We need a little more information. Please check your email.' : (done ? income : '') };
    if (incomeTask.open && !done) {
      incomeTask.prefill = guardianPrefill(ss, view.studentKey, household);
      incomeTask.followUp = shared && /needs follow/i.test(income) ? shared.note : '';
    }
    tasks.push(incomeTask);
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


// What we already know about this student, keyed by onboarding column.
function onboardingPrefill(ss, studentKey, household) {

  const apps = readObjects(ss.getSheetByName(CONFIG.forms.application.sheet)).filter(r => cleanValue(r['Student Key']) === studentKey);
  const app = apps[apps.length - 1] || {};
  const hh = household || {};
  // The second guardian is taken as a set from one place, never mixed.
  const g2 = !isBlank(hh['Guardian 2 First Name']) ? hh : app;
  const out = {};

  PORTAL.onboardingPrefill.forEach(([column, source, prefer]) => {
    let value;
    if (/^(Guardian 2|Second Guardian$)/.test(source)) value = cleanValue(g2[source]);
    else if (prefer === 'household') value = cleanValue(hh[source]) || cleanValue(app[source]);
    else value = cleanValue(app[source]);
    if (value) out[column] = value;
  });

  // Applying for the current year, the application asks only the current grade; that's the program-year grade.
  if (!out['Grade in Program Year'] && cleanValue(app['Current Grade'])) out['Grade in Program Year'] = cleanValue(app['Current Grade']);

  // District and parish come from the SCHOOLS tab, so families aren't asked.
  const school = schoolInfo(ss)[normalizeText(out['School'])];
  if (school) {
    if (school.district) out['School District'] = school.district;
    if (school.parish) out['School Parish'] = school.parish;
  }

  // "Different address?" on the application becomes "Same address?" here.
  if (out['Second Guardian Same Address']) out['Second Guardian Same Address'] = /^y/i.test(out['Second Guardian Same Address']) ? 'No' : 'Yes';
  if (out['Second Guardian First Name']) out['Second Guardian'] = 'Yes';
  else if (Object.keys(out).length) out['Second Guardian'] = 'No';
  if (out['Second Guardian'] === 'No') Object.keys(out).filter(c => /^Second Guardian ./.test(c)).forEach(c => delete out[c]);
  return out;
}


// SCHOOLS tab as { normalized school name: {name, district, parish} }.
function schoolInfo(ss) {

  const out = {};
  readObjects(ss.getSheetByName(PORTAL.schoolsSheet)).forEach(r => {
    const name = cleanValue(r.School);
    if (name) out[normalizeText(name)] = { name: name, district: cleanValue(r['School District']), parish: cleanValue(r['School Parish']),
      route: /^y/i.test(cleanValue(r['Transportation Route'])) };
  });
  return out;
}


// What we know for the transportation form: the onboarding answers if they're in, otherwise the application.
function transportationPrefill(ss, studentKey, household) {

  const known = onboardingPrefill(ss, studentKey, household);
  const rows = readObjects(ss.getSheetByName(PORTAL.tasks.onboarding.sheet)).filter(r => cleanValue(r['Student Key']) === studentKey);
  const onboarding = rows[rows.length - 1] || {};
  const out = {};
  ['Student First Name', 'Student Last Name', 'Grade in Program Year', 'School', 'Guardian First Name', 'Guardian Last Name',
    'Guardian Phone', 'Guardian Email'].forEach(c => {
    const value = cleanValue(onboarding[c]) || cleanValue(known[c]);
    if (value) out[c] = value;
  });
  return out;
}


// Parent/guardian contact: the onboarding answers if they're in, otherwise the household and application.
function guardianPrefill(ss, studentKey, household) {

  const known = transportationPrefill(ss, studentKey, household);
  const out = {};
  ['Guardian First Name', 'Guardian Last Name', 'Guardian Email', 'Guardian Phone'].forEach(c => { if (known[c]) out[c] = known[c]; });
  return out;
}


// The household's latest income submission: Submitted, Verified, or Needs follow-up (with the note).
function householdIncome(ss, householdId) {

  if (!cleanValue(householdId)) return null;
  const rows = readObjects(ss.getSheetByName(PORTAL.tasks.income.sheet)).filter(r => cleanValue(r['Household ID']) === cleanValue(householdId));
  if (!rows.length) return null;
  const last = rows[rows.length - 1], result = normalizeText(last['Verification Result']);
  if (/verified/.test(result)) return { status: 'Verified', note: '' };
  if (/follow|more info/.test(result) && cleanValue(last['Note to Family'])) return { status: 'Needs follow-up', note: cleanValue(last['Note to Family']) };
  return { status: 'Submitted', note: '' };
}


// MASTER rows in this household that need income verification (always including the given BRYC ID).
function householdIncomeRows(master, householdId, brycId) {

  const headers = getHeaderMap(master);
  const rows = [];
  readObjects(master).forEach((m, i) => {
    const sameHousehold = cleanValue(householdId) && cleanValue(m['Household ID']) === cleanValue(householdId)
      && normalizeText(m['Income Verification Required']) === 'yes';
    if (sameHousehold || cleanValue(m['BRYC ID']) === cleanValue(brycId)) rows.push({ row: i + 2, brycId: cleanValue(m['BRYC ID']), values: m });
  });
  return { headers: headers, rows: rows };
}


// "$123,456.00" → 123456. Blank or unreadable → null.
function parseMoney(value) {

  if (typeof value === 'number') return value;
  const n = Number(cleanValue(value).replace(/[$,\s]/g, ''));
  return cleanValue(value) && isFinite(n) ? n : null;
}


// The participation fee scale. Families never see it; staff confirm any fee with them.
function participationFee(agi) {

  // Under $110,000 is $0; $110,000 starts the first fee tier.
  if (agi < 110000) return 0;
  if (agi <= 160000) return 250;
  if (agi <= 210000) return 350;
  return 500;
}


/* ---------- staff review of income verification ---------- */

// Runs when staff edit a review column on INCOME_RAW, and on every background run as a backup.
// Verified: records the fee and verifier, updates MASTER, and emails families who owe nothing.
// Needs follow-up (with a Note to Family): emails the note and reopens the form.
function processIncomeReviews(ss, onlyRows, editorEmail) {

  const sheet = ss.getSheetByName(PORTAL.tasks.income.sheet);
  if (!sheet || sheet.getLastRow() < 2) return;
  ensureColumns(sheet, PORTAL.incomeReviewColumns);
  const map = getHeaderMap(sheet);
  const set = (row, header, value) => sheet.getRange(row, map[normalizeHeader(header)]).setValue(value);

  readObjects(sheet).forEach((r, i) => {
    const row = i + 2;
    if (onlyRows && !onlyRows.includes(row)) return;
    const result = normalizeText(r['Verification Result']);
    if (!result) return;

    let key = '';
    if (/verified/.test(result)) {
      const agi = parseMoney(r['Verified AGI']);
      if (agi === null) return;   // wait for the AGI
      // A fee staff typed in by hand wins over the scale.
      const typed = parseMoney(r['Participation Fee']);
      const fee = typed !== null ? typed : participationFee(agi);
      if (typed === null) set(row, 'Participation Fee', fee);
      key = 'verified';
      if (isBlank(r['Verified By']) && editorEmail) set(row, 'Verified By', editorEmail);
      if (isBlank(r['Verified Date'])) set(row, 'Verified Date', new Date());
      if (cleanValue(r['Family Notified']).startsWith(key)) return;
      updateMasterIncome(ss, r, 'Verified', fee);
      // Only families who owe nothing get an automatic email; staff confirm any fee in person.
      const sent = fee === 0 ? incomeEmail(ss, r, 'verified') : true;
      if (sent) set(row, 'Family Notified', fee === 0 ? 'verified: emailed ' + new Date().toLocaleDateString('en-US') : 'verified: fee to confirm');
    } else if (/follow|more info/.test(result)) {
      if (!cleanValue(r['Note to Family'])) return;   // wait for the note
      key = 'needs follow-up';
      if (cleanValue(r['Family Notified']).startsWith(key)) return;
      updateMasterIncome(ss, r, 'Needs follow-up', null);
      if (incomeEmail(ss, r, 'follow-up')) set(row, 'Family Notified', key + ': emailed ' + new Date().toLocaleDateString('en-US'));
    }
  });
}


// Updates every student in the household. The fee is one per household, kept on the row of the
// student whose form was submitted; siblings point to it so it's never counted twice.
function updateMasterIncome(ss, r, status, fee) {

  const master = ss.getSheetByName(CONFIG.masterSheet);
  ['Participation Fee', 'Fee Status'].forEach(h => ensureHeader(master, h));
  const primary = cleanValue(r['BRYC ID']);
  const found = householdIncomeRows(master, r['Household ID'], primary);
  const headers = found.headers;
  found.rows.forEach(s => {
    setMasterValue(master, s.row, headers, 'Income Verification Status', status);
    if (fee !== null) {
      const current = cleanValue(s.values['Fee Status']);
      const automatic = !current || /not required|to confirm|household fee on/i.test(current);
      if (s.brycId === primary) {
        setMasterValue(master, s.row, headers, 'Participation Fee', fee);
        if (automatic) setMasterValue(master, s.row, headers, 'Fee Status', fee > 0 ? 'To confirm' : 'Not required');
      } else if (automatic) {
        setMasterValue(master, s.row, headers, 'Fee Status', 'Household fee on ' + primary);
      }
    }
    setMasterValue(master, s.row, headers, 'Last Activity', new Date());
    recalculateOperationalFields(master, s.row);
  });
}


function incomeEmail(ss, r, kind) {

  const households = readObjects(portalSheet(ss, PORTAL.householdsSheet));
  const household = households.find(h => h['Household ID'] === cleanValue(r['Household ID'])) || {};
  const to = familyRecipients(household['Account Email'], household, r['Guardian Email']);
  const base = { greeting: cleanValue(r['Guardian First Name']) || household['Guardian First Name'], button: 'View your portal',
    brycId: r['BRYC ID'], householdId: r['Household ID'] };
  if (kind === 'verified') {
    return sendFamilyEmail(ss, 'Income verified', to, Object.assign(base, {
      subject: 'Your household income verification is complete',
      lines: [`Thank you for sending your household income verification. We've finished our review, and there's nothing else you need to do.`]
    }));
  }
  return sendFamilyEmail(ss, 'Income follow-up', to, Object.assign(base, {
    subject: 'We need a little more information for your household income verification',
    lines: ['Thank you for sending your household income verification. To finish our review, we need a little more information:', cleanValue(r['Note to Family']),
      'Sign in to your BRYC portal and open "Verify household income" to send it.']
  }));
}


// "2027-2028" → "August 1, 2027 – July 31, 2028"
function authorizationPeriod(programYear) {

  const m = /^(\d{4})-(\d{4})$/.exec(cleanValue(programYear));
  return m ? `August 1, ${m[1]} – July 31, ${m[2]}` : '';
}


function transportationMessage(first, fields) {

  if (!/^yes/i.test(cleanValue(fields['Needs BRYC Transportation']))) {
    return { type: 'Transportation received', subject: `We received ${first}'s transportation form`,
      lines: [`Thank you for letting us know ${first} won't need BRYC transportation. If that changes, reply to this email and we will help.`] };
  }
  const lines = fields['School Has Route'] === 'Yes'
    ? [`Thank you for signing ${first} up for BRYC transportation from ${fields['School']}.`,
       `We'll add ${fields['Guardian Phone'] || 'your phone number'} to our texting line and send pickup times, locations, and any changes there before ${first}'s first ride.`]
    : [`Thank you for requesting BRYC transportation for ${first}.`,
       `${fields['School']} doesn't have a BRYC route right now. We'll review your request and let you know. We can't promise a route, but we review every request.`];
  return { type: 'Transportation received', subject: `We received ${first}'s transportation form`, lines: lines };
}


// Prefilled onboarding columns the family changed or filled in, so staff know what to update.
function changedFromApplication(prefill, fields) {

  const same = (a, b) => normalizeText(a).replace(/^other:\s*/, '') === normalizeText(b).replace(/^other:\s*/, '');
  return PORTAL.onboardingPrefill.map(p => p[0]).filter(c => !same((prefill || {})[c], fields[c])).join('; ');
}


// Adds any missing headers in one write.
function ensureColumns(sheet, headers) {

  const width = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(normalizeHeader);
  const missing = headers.filter(h => !existing.includes(normalizeHeader(h)));
  if (!missing.length) return;
  const start = existing.filter(Boolean).length ? sheet.getLastColumn() + 1 : 1;
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
}


function isAdmitted(decision) {

  return normalizeText(decision) === 'admitted';
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
function sendStatusEmails(ss, onlyRows) {

  const master = ss.getSheetByName(CONFIG.masterSheet);
  if (!master || master.getLastRow() < 2) return;

  ['Household ID', 'Decision Released', 'Family Notified', 'Income Request Sent'].forEach(h => ensureHeader(master, h));
  const map = getHeaderMap(master);
  const rows = readObjects(master);
  const households = readObjects(portalSheet(ss, PORTAL.householdsSheet));
  const labels = familyLabels(ss);
  const askedHouseholds = new Set();

  rows.forEach((m, i) => {

    const householdId = cleanValue(m['Household ID']);
    if (!householdId) return;
    const household = households.find(h => h['Household ID'] === householdId);
    if (!household) return;

    const row = i + 2;
    if (onlyRows && !onlyRows.includes(row)) return;
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
      } else if (released && /complete/i.test(cleanValue(m['Onboarding Status']))) {
        sent = true;   // they already saw the decision and finished onboarding; no "decision is ready" email
      } else if (released) {
        sent = sendFamilyEmail(ss, 'Decision released', to, Object.assign({}, base, {
          subject: `A decision is ready for ${first}'s BRYC application`,
          lines: [`A decision on ${first}'s application is ready.`, 'Please sign in to your BRYC portal to view it and see any next steps.']
        }));
      }
      if (sent) master.getRange(row, map[normalizeHeader('Family Notified')]).setValue(key);
    }

    const incomeAsked = released && isAdmitted(decision) && normalizeText(m['Income Verification Required']) === 'yes';
    if (incomeAsked && isBlank(m['Income Request Sent']) && PORTAL.tasks.income.open) {
      // One request per household, even with more than one student admitted.
      const alreadyAsked = askedHouseholds.has(householdId) || rows.some((o, j) => j !== i && cleanValue(o['Household ID']) === householdId && !isBlank(o['Income Request Sent']));
      const sent = alreadyAsked || sendFamilyEmail(ss, 'Income verification request', to, Object.assign({}, base, {
        subject: 'One more step: verify your household income',
        lines: ['To finish enrollment, we need to verify your household income. We only need this once per household, even if more than one student is joining BRYC.',
          'Sign in to your BRYC portal and open "Verify household income." It takes a few minutes, and you can upload a photo of your document.']
      }));
      if (sent) { askedHouseholds.add(householdId); master.getRange(row, map[normalizeHeader('Income Request Sent')]).setValue(new Date()); }
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
function sendReferralEmail(ss, fields) {

  try {
    const to = familyRecipients(pick(fields, ['Referrer Email']), null, '');
    const student = [pick(fields, ['Student First Name']), pick(fields, ['Student Last Name'])].map(cleanValue).filter(Boolean).join(' ') || 'this student';
    const first = cleanValue(pick(fields, ['Student First Name'])) || 'the student';
    sendFamilyEmail(ss, 'Referral received', to, {
      subject: `Thank you for referring ${student} to BRYC`,
      greeting: cleanValue(pick(fields, ['Referrer First Name'])),
      lines: [`Thank you for referring ${student} to BRYC. Our admissions team will reach out to ${first} and their family.`,
        'Know another student who would be a good fit? You can refer them anytime.'],
      button: 'Refer another student',
      buttonUrl: PORTAL.referUrl
    });
  } catch (err) {
    console.error('Referral email failed: ' + err.message);
  }
}


// Today's date in Central time as yyyy-MM-dd. PORTAL.clock overrides it in tests.
function portalToday() {

  return Utilities.formatDate(PORTAL.clock ? new Date(PORTAL.clock) : new Date(), PORTAL.timeZone, 'yyyy-MM-dd');
}


// Which school years are open today, which have closed to rising seniors, and
// the next year to open (for the "applications are closed" message).
function applicationWindows() {

  const today = portalToday();
  const open = PORTAL.applicationWindows.filter(w => today >= w.opens && today <= w.closes);
  const next = PORTAL.applicationWindows.filter(w => w.opens > today).sort((a, b) => (a.opens < b.opens ? -1 : 1))[0];
  return {
    open: open.map(w => w.year),
    seniorsClosed: open.filter(w => w.seniorsClose && today > w.seniorsClose).map(w => ({ year: w.year, closed: longDate(w.seniorsClose) })),
    next: next ? { year: next.year, opens: longDate(next.opens) } : null
  };
}


// 2027-02-01 -> February 1, 2027
function longDate(iso) {

  const [y, m, d] = iso.split('-').map(Number);
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1] + ' ' + d + ', ' + y;
}


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
