/* =========================================================
   BRYC PY28 RAM HQ
   Receives portal submissions (referral, inquiry, application),
   assigns BRYC IDs, and keeps MASTER current.

   Setup: see apps-script/README.md
   ========================================================= */

const CONFIG = {
  prefix: 'PY28-',

  registrySheet: 'ID_REGISTRY',
  masterSheet: 'MASTER',

  // Each portal form writes to one RAW tab. Rank decides which
  // source may overwrite MASTER profile fields (higher wins).
  forms: {
    referral: {
      sheet: 'REFERRALS_RAW',
      rank: 1,
      required: [
        'Referrer First Name', 'Referrer Last Name', 'Referrer Email',
        'Which best describes you?', 'Student First Name', 'Student Last Name',
        'School', 'Current Grade'
      ]
    },
    inquiry: {
      sheet: 'INQUIRIES_RAW',
      rank: 2,
      required: [
        'Student First Name', 'Student Last Name', 'School', 'Current Grade',
        'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship',
        'Guardian Phone', 'Guardian Email', 'How did you first hear about BRYC?'
      ]
    },
    application: {
      sheet: 'APPLICATIONS_RAW',
      rank: 3,
      required: [
        'Program Year', 'Student First Name', 'Student Last Name', 'School',
        'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship',
        'Guardian Phone', 'Guardian Email', 'Student Signature', 'Guardian Signature'
      ]
    }
  },

  requiredMasterHeaders: [
    'BRYC ID', 'Referral Date', 'Inquiry Date', 'Application Date',
    'Recruitment Source', 'Application Status', 'Decision', 'Decision Date',
    'Onboarding Status', 'Onboarding Date', 'Income Verification Required',
    'Income Verification Status', 'Current RAM Status', 'Next Action',
    'Last Activity', 'Match Status', 'RAM Notes', 'Data Authority Rank'
  ],

  // Next Action values the script sets. Anything else in that column
  // was typed by staff and is never overwritten.
  autoActions: [
    'No Action', 'Contact Family', 'Send Application', 'Review Application',
    'Follow Up on Onboarding', 'Review Income Requirement',
    'Follow Up on Income Verification', 'Review Income Verification',
    'Contact Family About Income Verification'
  ],

  // Editing any of these MASTER columns recalculates status and next action.
  statusDrivers: [
    'Decision', 'Onboarding Status', 'Income Verification Required',
    'Income Verification Status', 'Referral Date', 'Inquiry Date', 'Application Date'
  ],

  uploadColumns: ['Academic Record', 'ACT Report'],

  maxValueLength: 5000,
  maxFileBytes: 10 * 1024 * 1024,
  allowedFileTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif'],
  maxSubmissionsPerMinute: 30,

  // How often new submissions get a BRYC ID and reach MASTER.
  // Google allows 1, 5, 10, 15, or 30. Rerun setupTriggers after changing it.
  processEveryMinutes: 15
};


/* =========================================================
   PORTAL SUBMISSIONS (web app)
   ========================================================= */

function doPost(e) {

  try {

    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Bots fill the hidden "website" field. Pretend success so they move on.
    if (payload.website) return jsonResponse({ ok: true });

    const formConfig = CONFIG.forms[payload.form];
    if (!formConfig) return jsonResponse({ ok: false, error: 'Unknown form.' });

    if (!underRateLimit()) {
      return jsonResponse({ ok: false, error: 'We are receiving a lot of submissions right now. Please try again in a minute.' });
    }

    const fields = cleanPayloadFields(payload.fields);

    const missing = formConfig.required.filter(h => isBlank(fields[h]));
    if (missing.length) {
      return jsonResponse({ ok: false, error: 'Missing required answers: ' + missing.join(', ') });
    }

    // Save the raw answers and return right away so families aren't kept
    // waiting. processPending assigns the BRYC ID and updates MASTER.
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(formConfig.sheet);

    fields['Timestamp'] = new Date();

    (payload.files || [])
      .filter(file => CONFIG.uploadColumns.includes(file.column))
      .forEach(file => { fields[file.column] = saveUpload(file, fields); });

    appendByHeader(sheet, fields);

    return jsonResponse({ ok: true });

  } catch (err) {

    console.error(err);
    return jsonResponse({ ok: false, error: 'Something went wrong on our end. Please try again or contact BRYC admissions.' });

  }
}


function cleanPayloadFields(raw) {

  const fields = {};

  Object.entries(raw || {}).forEach(([header, value]) => {

    let text = cleanValue(value).slice(0, CONFIG.maxValueLength);

    // Stop answers from being read as spreadsheet formulas.
    if (/^[=+\-@]/.test(text)) text = "'" + text;

    if (text) fields[cleanValue(header)] = text;

  });

  return fields;
}


function saveUpload(file, fields) {

  const folderId = PropertiesService.getScriptProperties().getProperty('UPLOAD_FOLDER_ID');
  if (!folderId) throw new Error('UPLOAD_FOLDER_ID script property is not set.');

  if (!CONFIG.allowedFileTypes.includes(file.mimeType)) {
    throw new Error('File type not allowed: ' + file.mimeType);
  }

  const bytes = Utilities.base64Decode(String(file.data || ''));
  if (bytes.length > CONFIG.maxFileBytes) throw new Error('File too large.');

  const name = [
    fields['Student Last Name'], fields['Student First Name'], file.column, file.name
  ].filter(Boolean).join(' - ');

  const blob = Utilities.newBlob(bytes, file.mimeType, name);
  const saved = DriveApp.getFolderById(folderId).createFile(blob);
  const savedSize = saved.getSize();

  // Shows in Apps Script > Executions, to trace any upload problem.
  console.log(`Upload ${file.column}: ${String(file.data || '').length} base64 chars, ${bytes.length} bytes decoded, ${savedSize} bytes saved`);

  // Never let an empty file pass as a real document: keep the application
  // and flag the upload so staff can ask the family to resend it.
  if (!bytes.length || !savedSize) {
    console.error(`Upload ${file.column} saved empty for ${name}`);
    return 'UPLOAD FAILED: ask family to resend. ' + saved.getUrl();
  }

  return saved.getUrl();
}


// Writes only to columns that already exist; unknown answers are dropped
// so a submission can never add columns to RAM HQ.
function appendByHeader(sheet, fields) {

  const headerMap = getHeaderMap(sheet);
  const width = sheet.getLastColumn();
  const rowValues = new Array(width).fill('');

  Object.entries(fields).forEach(([header, value]) => {
    const column = headerMap[normalizeHeader(header)];
    if (column) rowValues[column - 1] = value;
  });

  // appendRow is atomic, so simultaneous submissions never share a row.
  sheet.appendRow(rowValues);
}


function underRateLimit() {

  const cache = CacheService.getScriptCache();
  const key = 'submissions-' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0) + 1;

  cache.put(key, String(count), 120);

  return count <= CONFIG.maxSubmissionsPerMinute;
}


function jsonResponse(body) {

  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================================================
   BACKGROUND PROCESSING (runs every processEveryMinutes)
   ========================================================= */

// Run from the Apps Script editor to start the job, and again whenever
// processEveryMinutes changes. It replaces any earlier schedule.
function setupTriggers() {

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processPending')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processPending').timeBased().everyMinutes(CONFIG.processEveryMinutes).create();
}


// Adds a RAM HQ menu so staff can process new submissions without waiting
// for the next scheduled run.
function onOpen() {

  SpreadsheetApp.getUi()
    .createMenu('RAM HQ')
    .addItem('Process new submissions now', 'processPendingNow')
    .addToUi();
}


function processPendingNow() {

  processPending();
  SpreadsheetApp.getActiveSpreadsheet().toast('New submissions are processed.', 'RAM HQ', 5);
}


// Gives a BRYC ID and MASTER update to every saved submission that doesn't
// have one yet. A row that can't be processed is marked NEEDS REVIEW so it
// isn't retried every minute.
function processPending() {

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const started = Date.now();

    Object.values(CONFIG.forms).forEach(formConfig => {

      const sheet = ss.getSheetByName(formConfig.sheet);
      if (!sheet || sheet.getLastRow() < 2) return;

      const headers = getHeaderMap(sheet);
      const timeColumn = headers[normalizeHeader('Timestamp')];
      const idColumn = ensureHeader(sheet, 'BRYC ID');

      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

      rows.forEach((values, i) => {

        if (Date.now() - started > 4 * 60 * 1000) return;
        if (isBlank(values[timeColumn - 1]) || !isBlank(values[idColumn - 1])) return;

        const row = i + 2;

        try {
          processResponseRow(ss, sheet, row);
        } catch (err) {
          console.error(formConfig.sheet + ' row ' + row + ': ' + err.message);
          sheet.getRange(row, idColumn).setValue('NEEDS REVIEW');
        }
      });
    });

  } finally {

    lock.releaseLock();

  }
}


/* =========================================================
   GOOGLE FORM SUBMISSIONS (kept for any form still linked)
   ========================================================= */

function onFormSubmit(e) {

  if (!e || !e.range) {
    throw new Error('Do not run onFormSubmit manually. Submit a response to test it.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    processResponseRow(SpreadsheetApp.getActiveSpreadsheet(), e.range.getSheet(), e.range.getRow());
  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   SHARED PROCESSING
   ========================================================= */

function processResponseRow(ss, sourceSheet, responseRow) {

  const sheetName = sourceSheet.getName();
  const formType = Object.keys(CONFIG.forms).find(k => CONFIG.forms[k].sheet === sheetName);

  // Ignore tabs that are not one of the three entry forms.
  if (!formType) return;

  const formConfig = Object.assign({ type: formType }, CONFIG.forms[formType]);
  const response = getResponseObject(sourceSheet, responseRow);
  const identity = extractIdentity(response);

  if (!identity.firstName || !identity.lastName) {
    throw new Error(`Could not find Fellow first and last name on ${sheetName}.`);
  }

  const registry = getOrCreateRegistry(ss);
  const idResult = getOrCreateBrycId(ss, registry, response, identity, sheetName);
  const brycId = idResult.brycId;

  const brycIdColumn = ensureHeader(sourceSheet, 'BRYC ID');
  sourceSheet.getRange(responseRow, brycIdColumn).setValue(brycId);

  updateRegistryRecord(registry, brycId, identity);

  upsertMasterRecord(
    ss, brycId, response, identity, formConfig,
    rowLink(ss, sourceSheet, responseRow), idResult.matchStatus
  );
}


function rowLink(ss, sheet, row) {

  return ss.getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + row;
}


/* =========================================================
   RESPONSE READING
   ========================================================= */

function getResponseObject(sheet, row) {

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
  const response = {};

  headers.forEach((header, i) => {

    if (!header) return;

    // Keep the first nonblank answer for repeated question names.
    if (!(header in response) || isBlank(response[header])) {
      response[header] = values[i];
    }

  });

  return response;
}


/* =========================================================
   IDENTITY EXTRACTION
   ========================================================= */

function extractIdentity(response) {

  return {
    firstName: cleanValue(pick(response, ['Student First Name', "Prospective Student's First Name", 'Fellow First Name'])),
    lastName: cleanValue(pick(response, ['Student Last Name', "Prospective Student's Last Name", 'Fellow Last Name'])),
    studentEmail: cleanContact(pick(response, ['Student Email', "Prospective Student's Email"])),
    studentPhone: cleanContact(pick(response, ['Student Phone', 'Student Cell Phone', "Prospective Student's Cell Phone"])),
    guardianFirstName: cleanValue(pick(response, ['Guardian First Name'])),
    guardianLastName: cleanValue(pick(response, ['Guardian Last Name'])),
    guardianEmail: cleanContact(pick(response, ['Guardian Email'])),
    guardianPhone: cleanContact(pick(response, ['Guardian Phone', 'Guardian Phone Number', 'Guardian Cell Phone'])),
    guardianRelationship: cleanValue(pick(response, ['Guardian Relationship', "What is the guardian's relationship to the student"])),
    gender: cleanValue(pick(response, ['Student Gender Identity'])),
    school: cleanValue(pick(response, ['School', 'Which school does the prospective student attend', 'Which school do you currently attend'])),
    // Application: the grade during the program year if given, otherwise current grade.
    grade: cleanValue(pick(response, ['Grade in Program Year', 'Current Grade', 'What grade will you be in', 'What is your current grade']))
  };
}


/* =========================================================
   BRYC ID REGISTRY
   ========================================================= */

function getOrCreateRegistry(ss) {

  let sheet = ss.getSheetByName(CONFIG.registrySheet);
  if (!sheet) sheet = ss.insertSheet(CONFIG.registrySheet);

  const headers = [
    'BRYC ID', 'First Name', 'Last Name', 'Student Email', 'Student Phone',
    'Guardian Email', 'Guardian Phone', 'School', 'First Entry Source', 'Date Created'
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}


function getOrCreateBrycId(ss, registry, response, identity, sourceSheet) {

  // A personalized link may carry a BRYC ID. Use it only if it already exists.
  const providedId = cleanValue(pick(response, ['BRYC ID']));

  if (providedId && brycIdExists(ss, registry, providedId)) {
    return { brycId: providedId, matchStatus: 'BRYC ID Match' };
  }

  const match = findRegistryMatch(registry, identity);

  if (match.strongId) {
    return { brycId: match.strongId, matchStatus: 'Matched Automatically' };
  }

  const newId = getNextBrycId(registry);

  registry.appendRow([
    newId, identity.firstName, identity.lastName, identity.studentEmail,
    identity.studentPhone, identity.guardianEmail, identity.guardianPhone,
    identity.school, sourceSheet, new Date()
  ]);

  return {
    brycId: newId,
    matchStatus: match.possibleDuplicateId ? 'Possible Duplicate: ' + match.possibleDuplicateId : 'New Record'
  };
}


function findRegistryMatch(registry, identity) {

  const result = { strongId: null, possibleDuplicateId: null };
  if (registry.getLastRow() < 2) return result;

  const data = registry.getRange(2, 1, registry.getLastRow() - 1, 10).getDisplayValues();

  const first = normalizeText(identity.firstName);
  const last = normalizeText(identity.lastName);
  const studentEmail = normalizeEmail(identity.studentEmail);
  const studentPhone = normalizePhone(identity.studentPhone);
  const guardianEmail = normalizeEmail(identity.guardianEmail);
  const guardianPhone = normalizePhone(identity.guardianPhone);
  const school = normalizeText(identity.school);

  for (const row of data) {

    const sameName = first && last && first === normalizeText(row[1]) && last === normalizeText(row[2]);
    if (!sameName) continue;

    const strongMatch =
      (studentEmail && studentEmail === normalizeEmail(row[3])) ||
      (studentPhone && studentPhone === normalizePhone(row[4])) ||
      (guardianEmail && guardianEmail === normalizeEmail(row[5])) ||
      (guardianPhone && guardianPhone === normalizePhone(row[6]));

    if (strongMatch) {
      result.strongId = row[0];
      return result;
    }

    if (school && school === normalizeText(row[7]) && !result.possibleDuplicateId) {
      result.possibleDuplicateId = row[0];
    }
  }

  return result;
}


function getNextBrycId(registry) {

  if (registry.getLastRow() < 2) return CONFIG.prefix + '0001';

  const ids = registry.getRange(2, 1, registry.getLastRow() - 1, 1).getDisplayValues().flat();
  const pattern = new RegExp('^' + CONFIG.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  let highest = 0;

  ids.forEach(id => {
    const match = String(id).match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  });

  return CONFIG.prefix + String(highest + 1).padStart(4, '0');
}


function brycIdExists(ss, registry, id) {

  const registryFound = registry
    .getRange(1, 1, registry.getLastRow(), 1)
    .createTextFinder(id).matchEntireCell(true).findNext();

  if (registryFound) return true;

  const master = ss.getSheetByName(CONFIG.masterSheet);
  if (!master) return false;

  const idColumn = getHeaderMap(master)[normalizeHeader('BRYC ID')];
  if (!idColumn || master.getLastRow() < 2) return false;

  return Boolean(
    master.getRange(2, idColumn, master.getLastRow() - 1, 1)
      .createTextFinder(id).matchEntireCell(true).findNext()
  );
}


function updateRegistryRecord(registry, brycId, identity) {

  if (registry.getLastRow() < 2) return;

  const found = registry
    .getRange(2, 1, registry.getLastRow() - 1, 1)
    .createTextFinder(brycId).matchEntireCell(true).findNext();

  if (!found) return;

  const row = found.getRow();
  const fields = [
    identity.firstName, identity.lastName, identity.studentEmail, identity.studentPhone,
    identity.guardianEmail, identity.guardianPhone, identity.school
  ];

  // Fill gaps only; never overwrite what the registry already has.
  fields.forEach((value, index) => {
    const cell = registry.getRange(row, index + 2);
    if (!isBlank(value) && isBlank(cell.getValue())) cell.setValue(value);
  });
}


/* =========================================================
   MASTER RECORD
   ========================================================= */

function upsertMasterRecord(ss, brycId, response, identity, formConfig, sourceLink, matchStatus) {

  let master = ss.getSheetByName(CONFIG.masterSheet);
  if (!master) master = ss.insertSheet(CONFIG.masterSheet);

  ensureHeaders(master, CONFIG.requiredMasterHeaders);

  const headerMap = getHeaderMap(master);
  const idColumn = headerMap[normalizeHeader('BRYC ID')];

  let row = findMasterRow(master, idColumn, brycId);

  if (!row) {
    row = nextEmptyRow(master, idColumn);
    master.getRange(row, idColumn).setValue(brycId);
  }

  const timestamp = getSubmissionTimestamp(response);
  const currentRank = Number(getMasterValue(master, row, headerMap, 'Data Authority Rank')) || 0;
  const profile = buildProfileUpdates(response, identity, formConfig.type);
  const canOverwrite = formConfig.rank >= currentRank;

  Object.entries(profile).forEach(([field, value]) => {

    if (isBlank(value)) return;

    if (canOverwrite) {
      setMasterValue(master, row, headerMap, field, value);
    } else {
      setMasterIfBlank(master, row, headerMap, field, value);
    }
  });

  setMasterValue(master, row, headerMap, 'Data Authority Rank', Math.max(currentRank, formConfig.rank));

  if (formConfig.type === 'referral') {
    setMasterIfBlank(master, row, headerMap, 'Referral Date', timestamp);
  }

  if (formConfig.type === 'inquiry') {
    setMasterIfBlank(master, row, headerMap, 'Inquiry Date', timestamp);
  }

  if (formConfig.type === 'application') {
    setMasterIfBlank(master, row, headerMap, 'Application Date', timestamp);
    setMasterValue(master, row, headerMap, 'Application Status', 'Submitted');
    setMasterValue(master, row, headerMap, 'Application Link', sourceLink);
  }

  // Preserve the Fellow's first recruitment source.
  setMasterIfBlank(master, row, headerMap, 'Recruitment Source', getRecruitmentSource(response, formConfig.type));

  // Don't automatically clear an unresolved duplicate warning.
  const existingMatchStatus = String(getMasterValue(master, row, headerMap, 'Match Status') || '');

  if (!existingMatchStatus.includes('Possible Duplicate') || matchStatus.includes('Possible Duplicate')) {
    setMasterValue(master, row, headerMap, 'Match Status', matchStatus);
  }

  setMasterValue(master, row, headerMap, 'Last Activity', timestamp);

  recalculateOperationalFields(master, row);
}


// First row with no BRYC ID. Rows that only hold leftover formatting don't count.
function nextEmptyRow(master, idColumn) {

  const last = master.getLastRow();
  if (last < 2) return 2;

  const ids = master.getRange(2, idColumn, last - 1, 1).getValues();
  let lastWithId = 1;

  ids.forEach((r, i) => { if (!isBlank(r[0])) lastWithId = i + 2; });

  return lastWithId + 1;
}


/* =========================================================
   PROFILE FIELD MAPPING (MASTER headers)
   ========================================================= */

function buildProfileUpdates(response, identity, formType) {

  const profile = {
    'Fellow First Name': identity.firstName,
    'Fellow Last Name': identity.lastName,
    'Gender': identity.gender,
    'Grade': identity.grade,
    'School': identity.school,
    'Student Email': identity.studentEmail,
    'Student Phone': identity.studentPhone,
    'Guardian First Name': identity.guardianFirstName,
    'Guardian Last Name': identity.guardianLastName,
    'Guardian Relationship': identity.guardianRelationship,
    'Guardian Phone Number': identity.guardianPhone,
    'Guardian Email': identity.guardianEmail
  };

  if (formType === 'referral') {
    profile['Referred By'] = [
      [pick(response, ['Referrer First Name']), pick(response, ['Referrer Last Name'])].filter(Boolean).join(' '),
      pick(response, ['Which best describes you?']),
      pick(response, ['Referrer Email'])
    ].map(cleanValue).filter(Boolean).join(', ');
  }

  if (formType === 'application') {

    profile['Program Year'] = cleanValue(pick(response, ['Program Year']));
    profile['Home Language'] = cleanValue(pick(response, ['Home Language']));
    profile['Household Income Range'] = cleanValue(pick(response, ['Household Income Range']));

    const street = [pick(response, ['Street Address']), pick(response, ['Apartment or Unit'])]
      .map(cleanValue).filter(Boolean).join(' ');

    profile['Home Address'] = combineAddress(
      street,
      cleanValue(pick(response, ['City'])),
      cleanValue(pick(response, ['State'])),
      cleanValue(pick(response, ['ZIP Code']))
    );

    const relative = cleanValue(pick(response, ['BRYC Relative']));
    const names = cleanValue(pick(response, ['Relative Names']));
    profile['Relative in BRYC'] = relative === 'Yes' ? ('Yes' + (names ? ': ' + names : '')) : relative;
  }

  return profile;
}


/* =========================================================
   CURRENT STATUS + NEXT ACTION
   ========================================================= */

function recalculateOperationalFields(master, row) {

  const headers = getHeaderMap(master);
  const value = header => getMasterValue(master, row, headers, header);

  const decision = normalizeText(value('Decision'));
  const onboarding = normalizeText(value('Onboarding Status'));
  const incomeRequired = normalizeText(value('Income Verification Required'));
  const incomeStatus = normalizeText(value('Income Verification Status'));

  let currentStatus = '';
  let nextAction = 'No Action';

  if (decision.includes('rescinded')) {
    currentStatus = 'Rescinded';
  } else if (decision.includes('denied')) {
    currentStatus = 'Denied';
  } else if (decision.includes('declin')) {
    currentStatus = 'Declined';
  } else if (decision.includes('waitlist')) {
    currentStatus = 'Waitlisted';
  } else if (onboarding.includes('complete')) {

    currentStatus = 'Matriculating';

    if (incomeRequired === 'yes') {

      if (incomeStatus.includes('verified') || incomeStatus.includes('complete') || incomeStatus.includes('not required')) {
        currentStatus = 'RAM Complete';
      } else if (incomeStatus.includes('submitted')) {
        nextAction = 'Review Income Verification';
      } else if (incomeStatus.includes('follow')) {
        nextAction = 'Contact Family About Income Verification';
      } else {
        nextAction = 'Follow Up on Income Verification';
      }

    } else if (incomeRequired === 'no' || incomeRequired.includes('not required')) {
      currentStatus = 'RAM Complete';
    } else {
      nextAction = 'Review Income Requirement';
    }

  } else if (decision.includes('admitted')) {
    currentStatus = 'Admitted';
    nextAction = 'Follow Up on Onboarding';
  } else if (!isBlank(value('Application Date'))) {
    currentStatus = 'Applicant';
    nextAction = 'Review Application';
  } else if (!isBlank(value('Inquiry Date'))) {
    currentStatus = 'Prospect';
    nextAction = 'Send Application';
  } else if (!isBlank(value('Referral Date'))) {
    currentStatus = 'Referred';
    nextAction = 'Contact Family';
  }

  setMasterValue(master, row, headers, 'Current RAM Status', currentStatus);

  // Keep a Next Action that staff typed by hand.
  const existingAction = cleanValue(value('Next Action'));
  if (isBlank(existingAction) || CONFIG.autoActions.includes(existingAction)) {
    setMasterValue(master, row, headers, 'Next Action', nextAction);
  }
}


/* =========================================================
   MANUAL MASTER EDITS
   ========================================================= */

function onEdit(e) {

  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.masterSheet || e.range.getRow() === 1) return;

  const headers = getHeaderMap(sheet);

  // Only status-driving columns trigger a recalculation.
  const driverColumns = CONFIG.statusDrivers.map(h => headers[normalizeHeader(h)]).filter(Boolean);
  const firstCol = e.range.getColumn();
  const lastCol = e.range.getLastColumn();
  const touchesDriver = driverColumns.some(c => c >= firstCol && c <= lastCol);

  if (!touchesDriver) return;

  for (let row = e.range.getRow(); row <= e.range.getLastRow(); row++) {

    // Skip rows without a Fellow so blank rows don't fill with "No Action".
    if (isBlank(getMasterValue(sheet, row, headers, 'BRYC ID'))) continue;

    const decision = getMasterValue(sheet, row, headers, 'Decision');
    const decisionDate = getMasterValue(sheet, row, headers, 'Decision Date');

    if (!isBlank(decision) && isBlank(decisionDate)) {
      setMasterValue(sheet, row, headers, 'Decision Date', new Date());
    }

    recalculateOperationalFields(sheet, row);
  }
}


/* =========================================================
   RECRUITMENT SOURCE
   ========================================================= */

function getRecruitmentSource(response, type) {

  if (type === 'referral') {
    const referrerType = cleanValue(pick(response, ['Which best describes you?']));
    return referrerType ? 'Referral - ' + referrerType : 'Referral';
  }

  return cleanValue(pick(response, ['How did you first hear about BRYC?']));
}


/* =========================================================
   SHEET HELPERS
   ========================================================= */

function ensureHeaders(sheet, headers) {

  headers.forEach(header => ensureHeader(sheet, header));
}


function ensureHeader(sheet, header) {

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const wanted = normalizeHeader(header);

  for (let i = 0; i < existing.length; i++) {
    if (normalizeHeader(existing[i]) === wanted) return i + 1;
  }

  const newColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, newColumn).setValue(header);

  return newColumn;
}


function getHeaderMap(sheet) {

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const map = {};

  headers.forEach((header, index) => {
    if (header) map[normalizeHeader(header)] = index + 1;
  });

  return map;
}


function findMasterRow(master, idColumn, brycId) {

  if (master.getLastRow() < 2) return null;

  const match = master
    .getRange(2, idColumn, master.getLastRow() - 1, 1)
    .createTextFinder(brycId).matchEntireCell(true).findNext();

  return match ? match.getRow() : null;
}


function getMasterValue(sheet, row, headerMap, header) {

  const column = headerMap[normalizeHeader(header)];
  return column ? sheet.getRange(row, column).getValue() : '';
}


function setMasterValue(sheet, row, headerMap, header, value) {

  const column = headerMap[normalizeHeader(header)];
  if (!column) {
    // Surface missing MASTER columns instead of skipping them silently.
    console.warn('MASTER has no column named "' + header + '"');
    return;
  }

  sheet.getRange(row, column).setValue(value);
}


function setMasterIfBlank(sheet, row, headerMap, header, value) {

  if (isBlank(value)) return;

  if (isBlank(getMasterValue(sheet, row, headerMap, header))) {
    setMasterValue(sheet, row, headerMap, header, value);
  }
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

// Returns the first nonblank answer: exact header matches first, then partial.
function pick(response, candidates) {

  const entries = Object.entries(response);

  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate);
    for (const [header, value] of entries) {
      if (normalizeHeader(header) === wanted && !isBlank(value)) return value;
    }
  }

  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate);
    for (const [header, value] of entries) {
      if (normalizeHeader(header).includes(wanted) && !isBlank(value)) return value;
    }
  }

  return '';
}


function getSubmissionTimestamp(response) {

  const timestamp = pick(response, ['Timestamp']);
  if (timestamp instanceof Date) return timestamp;

  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}


function combineAddress(address, city, state, zip) {

  const parts = [];
  if (address) parts.push(address);

  const cityStateZip = [city, state, zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);

  return parts.join(', ');
}


function cleanValue(value) {

  if (value === null || value === undefined) return '';
  return String(value).trim();
}


function cleanContact(value) {

  const cleaned = cleanValue(value);
  return normalizeText(cleaned) === 'none' ? '' : cleaned;
}


function normalizeHeader(value) {

  return String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}


function normalizeText(value) {

  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}


function normalizeEmail(value) {

  return String(value || '').toLowerCase().trim();
}


function normalizePhone(value) {

  return String(value || '').replace(/\D/g, '').slice(-10);
}


function isBlank(value) {

  return value === '' || value === null || value === undefined;
}
