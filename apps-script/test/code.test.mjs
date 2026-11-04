// Runs Code.gs against an in-memory copy of PY28 RAM HQ's headers.
// Usage (from apps-script/test): node --test code.test.mjs
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const HEADERS = {
  REFERRALS_RAW: ['Timestamp', 'Referrer First Name', 'Referrer Last Name', 'Referrer Email', 'Referrer Phone', 'Which best describes you?', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'School', 'School Not Listed', 'Current Grade', 'Student Cell Phone', 'Student Email', 'Anything Else We Should Know', 'Has Guardian Contact', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'BRYC ID'],
  INQUIRIES_RAW: ['Timestamp', 'Submitted By', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'School', 'School Not Listed', 'Current Grade', 'Student Phone', 'Student Email', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'How did you first hear about BRYC?', 'BRYC ID'],
  APPLICATIONS_RAW: ['Timestamp', 'Program Year', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'Student Email', 'Student Phone', 'Current Grade', 'Grade in Program Year', 'School', 'School Not Listed', 'BRYC Relative', 'Relative Names', 'Academic Record', 'ACT Taken', 'ACT Report', 'Self-Reported Grades', 'Short Response #1', 'Short Response #2', 'Short Response #3', 'Activities Outside Class', 'How did you first hear about BRYC?', 'Student Certification', 'Student Signature', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Email', 'Guardian Phone', 'Street Address', 'Apartment or Unit', 'City', 'State', 'ZIP Code', 'Parish or County', 'Household Members', 'Home Language', 'Need Circumstances', 'Policy Acknowledgment', 'Guardian Signature', 'BRYC ID'],
  ID_REGISTRY: ['BRYC ID', 'First Name', 'Last Name', 'Student Email', 'Student Phone', 'Guardian Email', 'Guardian Phone', 'School', 'First Entry Source', 'Date Created'],
  MASTER: ['BRYC ID', 'Fellow First Name', 'Fellow Last Name', 'Gender', 'Program Year', 'Grade', 'School', 'Student Email', 'Student Phone', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone Number', 'Guardian Email', 'Home Address', 'Home Language', 'Relative in BRYC', 'Recruitment Source', 'Referred By', 'Referral Date', 'Inquiry Date', 'Application Date', 'Application Status', 'Decision', 'Decision Date', 'Onboarding Status', 'Onboarding Date', 'Income Verification Required', 'Income Verification Status', 'Current RAM Status', 'Next Action', 'Last Activity', 'RAM Notes', 'Match Status', 'Application Link', 'Onboarding Link', 'Income Verification Link', 'Data Authority Rank']
};

// ---------- Minimal Apps Script stand-ins ----------
class Sheet {
  constructor(name, id, headers) { this.name = name; this.id = id; this.rows = headers ? [headers.slice()] : []; }
  getName() { return this.name; }
  getSheetId() { return this.id; }
  getLastRow() { let n = 0; this.rows.forEach((r, i) => { if (r.some(v => v !== '' && v !== undefined && v !== null)) n = i + 1; }); return n; }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => { let n = 0; r.forEach((v, i) => { if (v !== '' && v !== undefined && v !== null) n = i + 1; }); return n; })); }
  cell(r, c) { return (this.rows[r - 1] || [])[c - 1] ?? ''; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(values) { const r = this.getLastRow() + 1; values.forEach((v, i) => this.set(r, i + 1, v)); }
}
class Range {
  constructor(s, r, c, nr, nc) { Object.assign(this, {s, r, c, nr, nc}); }
  grid(fn) { return Array.from({length: this.nr}, (_, i) => Array.from({length: this.nc}, (_, j) => fn(this.s.cell(this.r + i, this.c + j)))); }
  getValues() { return this.grid(v => v); }
  getDisplayValues() { return this.grid(v => v instanceof Date ? v.toISOString() : String(v ?? '')); }
  getValue() { return this.s.cell(this.r, this.c); }
  setValue(v) { this.s.set(this.r, this.c, v); return this; }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.s.set(this.r + i, this.c + j, v))); return this; }
  getSheet() { return this.s; }
  getRow() { return this.r; }
  getLastRow() { return this.r + this.nr - 1; }
  getColumn() { return this.c; }
  getLastColumn() { return this.c + this.nc - 1; }
  createTextFinder(text) {
    const range = this; let exact = false;
    return { matchEntireCell(x) { exact = x; return this; }, findNext() {
      for (let i = 0; i < range.nr; i++) for (let j = 0; j < range.nc; j++) {
        const v = String(range.s.cell(range.r + i, range.c + j));
        if (exact ? v === text : v.includes(text)) return new Range(range.s, range.r + i, range.c + j, 1, 1);
      } return null; } };
  }
}

let sheets, ctx, savedFiles;
function load() {
  sheets = {}; let id = 1;
  for (const [name, headers] of Object.entries(HEADERS)) sheets[name] = new Sheet(name, id++, headers);
  savedFiles = [];
  const cache = new Map();
  ctx = {
    console: {error() {}, warn() {}, log() {}},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n, id++)), getUrl: () => 'https://sheet' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: {JSON: 'json'}, createTextOutput: t => ({ setMimeType: () => ({ body: JSON.parse(t) }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'folder123' }) },
    Utilities: { base64Decode: d => Buffer.from(d, 'base64'), newBlob: (bytes, type, name) => ({bytes, type, name}) },
    DriveApp: { getFolderById: () => ({ createFile: blob => { savedFiles.push(blob); return { getUrl: () => 'https://drive/' + blob.name }; } }) }
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../Code.gs', import.meta.url), 'utf8'), ctx);
}
const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
const post = body => ctx.doPost({postData: {contents: JSON.stringify(body)}}).body;
const master = (row, header) => sheets.MASTER.cell(row, HEADERS.MASTER.indexOf(header) + 1);
const raw = (tab, row, header) => sheets[tab].cell(row, HEADERS[tab].indexOf(header) + 1);
const edit = (row, header, value) => {
  const col = HEADERS.MASTER.indexOf(header) + 1;
  sheets.MASTER.set(row, col, value);
  ctx.onEdit({range: new Range(sheets.MASTER, row, col, 1, 1)});
};

const referral = { form: 'referral', fields: {
  'Referrer First Name': 'Pat', 'Referrer Last Name': 'Counselor', 'Referrer Email': 'pat@school.org', 'Which best describes you?': 'School counselor',
  'Student First Name': 'Jordan', 'Student Last Name': 'Sample', 'School': 'Thrive Academy', 'School Not Listed': 'No', 'Current Grade': '8th',
  'Has Guardian Contact': 'Yes', 'Guardian First Name': 'Casey', 'Guardian Last Name': 'Sample', 'Guardian Relationship': 'Aunt', 'Guardian Phone': '(225) 555-0123' } };
const inquiry = { form: 'inquiry', fields: {
  'Submitted By': 'Parent or guardian', 'Student First Name': 'Jordan', 'Student Last Name': 'Sample', 'School': 'Thrive Academy', 'Current Grade': '8th grade',
  'Guardian First Name': 'Casey', 'Guardian Last Name': 'Sample', 'Guardian Relationship': 'Aunt', 'Guardian Phone': '225-555-0123', 'Guardian Email': 'casey@example.com',
  'How did you first hear about BRYC?': 'Letter from BRYC' } };
const application = { form: 'application', fields: {
  'Program Year': '2027-2028', 'Student First Name': 'Jordan', 'Student Last Name': 'Sample', 'Current Grade': '8th grade', 'Grade in Program Year': '9th grade',
  'School': 'Scotlandville Magnet High School', 'Guardian First Name': 'Casey', 'Guardian Last Name': 'Sample', 'Guardian Relationship': 'Aunt',
  'Guardian Phone': '2255550123', 'Guardian Email': 'casey@example.com', 'Student Signature': 'Jordan Sample', 'Guardian Signature': 'Casey Sample',
  'Street Address': '123 Main St', 'Apartment or Unit': 'Apt 2', 'City': 'Baton Rouge', 'State': 'LA', 'ZIP Code': '70802', 'Home Language': 'English',
  'BRYC Relative': 'Yes', 'Relative Names': 'Avery Sample', 'How did you first hear about BRYC?': 'Student in BRYC' },
  files: [{ column: 'Academic Record', name: 'report.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64') }] };

beforeEach(load);

test('referral creates an ID, registry row, and a filled MASTER row', () => {
  assert.deepEqual(post(referral), {ok: true});
  assert.equal(raw('REFERRALS_RAW', 2, 'BRYC ID'), 'PY28-0001');
  assert.equal(sheets.ID_REGISTRY.cell(2, 1), 'PY28-0001');
  assert.equal(master(2, 'Fellow First Name'), 'Jordan');
  assert.equal(master(2, 'Guardian Relationship'), 'Aunt');
  assert.equal(master(2, 'Guardian Phone Number'), '(225) 555-0123');
  assert.equal(master(2, 'School'), 'Thrive Academy');
  assert.equal(master(2, 'Referred By'), 'Pat Counselor, School counselor, pat@school.org');
  assert.equal(master(2, 'Recruitment Source'), 'Referral - School counselor');
  assert.equal(master(2, 'Current RAM Status'), 'Referred');
  assert.equal(master(2, 'Next Action'), 'Contact Family');
  assert.equal(master(2, 'Match Status'), 'New Record');
});

test('inquiry then application match the same student and move them forward', () => {
  post(referral); post(inquiry); post(application);
  assert.equal(sheets.ID_REGISTRY.getLastRow(), 2, 'one registry row');
  assert.equal(sheets.MASTER.getLastRow(), 2, 'one MASTER row');
  assert.equal(raw('APPLICATIONS_RAW', 2, 'BRYC ID'), 'PY28-0001');
  assert.equal(master(2, 'Match Status'), 'Matched Automatically');
  assert.equal(master(2, 'Grade'), '9th grade', 'application uses grade in program year');
  assert.equal(master(2, 'School'), 'Scotlandville Magnet High School', 'application outranks referral');
  assert.equal(master(2, 'Recruitment Source'), 'Referral - School counselor', 'first source is kept');
  assert.equal(master(2, 'Application Status'), 'Submitted');
  assert.equal(master(2, 'Home Address'), '123 Main St Apt 2, Baton Rouge LA 70802');
  assert.equal(master(2, 'Relative in BRYC'), 'Yes: Avery Sample');
  assert.equal(master(2, 'Program Year'), '2027-2028');
  assert.equal(master(2, 'Current RAM Status'), 'Applicant');
  assert.equal(master(2, 'Next Action'), 'Review Application');
  assert.match(master(2, 'Application Link'), /#gid=3&range=A2$/);
  assert.match(raw('APPLICATIONS_RAW', 2, 'Academic Record'), /^https:\/\/drive\//);
  assert.equal(savedFiles.length, 1);
  assert.ok(isDate(master(2, 'Referral Date')) && isDate(master(2, 'Inquiry Date')));
});

test('a lower-rank form does not overwrite application answers', () => {
  post(application); post({...inquiry, fields: {...inquiry.fields, School: 'Other School'}});
  assert.equal(master(2, 'School'), 'Scotlandville Magnet High School');
});

test('same name and school without matching contact is flagged, not merged', () => {
  post(referral);
  post({form: 'referral', fields: {...referral.fields, 'Guardian Phone': '2255559999', 'Referrer Email': 'x@y.org'}});
  assert.equal(sheets.MASTER.cell(3, 1), 'PY28-0002');
  assert.equal(master(3, 'Match Status'), 'Possible Duplicate: PY28-0001');
});

test('decision edits set a decision date and recalculate status', () => {
  post(application);
  edit(2, 'Decision', 'Admitted');
  assert.ok(isDate(master(2, 'Decision Date')));
  assert.equal(master(2, 'Current RAM Status'), 'Admitted');
  assert.equal(master(2, 'Next Action'), 'Follow Up on Onboarding');
  edit(2, 'Onboarding Status', 'Complete');
  edit(2, 'Income Verification Required', 'Yes');
  edit(2, 'Income Verification Status', 'Submitted');
  assert.equal(master(2, 'Next Action'), 'Review Income Verification');
  edit(2, 'Income Verification Status', 'Verified');
  assert.equal(master(2, 'Current RAM Status'), 'RAM Complete');
});

test('a Next Action typed by staff is not overwritten', () => {
  post(application);
  edit(2, 'Next Action', 'Call grandmother after 5pm');
  edit(2, 'Decision', 'Admitted');
  assert.equal(master(2, 'Next Action'), 'Call grandmother after 5pm');
  assert.equal(master(2, 'Current RAM Status'), 'Admitted');
});

test('edits on rows without a BRYC ID do nothing', () => {
  edit(5, 'Decision', 'Admitted');
  assert.equal(master(5, 'Next Action'), '');
  assert.equal(master(5, 'Decision Date'), '');
});

test('required answers, unknown forms, and bots are rejected', () => {
  assert.equal(post({form: 'nope', fields: {}}).ok, false);
  const r = post({form: 'inquiry', fields: {'Student First Name': 'A'}});
  assert.equal(r.ok, false); assert.match(r.error, /Guardian Phone/);
  assert.deepEqual(post({...inquiry, website: 'spam'}), {ok: true});
  assert.equal(sheets.INQUIRIES_RAW.getLastRow(), 1, 'nothing written');
});

test('formulas are neutralized and unknown columns are dropped', () => {
  post({form: 'inquiry', fields: {...inquiry.fields, 'Student Last Name': '=HYPERLINK("x")', 'Injected Column': 'x'}});
  assert.equal(raw('INQUIRIES_RAW', 2, 'Student Last Name'), '\'=HYPERLINK("x")');
  assert.ok(!sheets.INQUIRIES_RAW.rows[0].includes('Injected Column'));
});

test('files are only accepted for upload questions and allowed types', () => {
  post({...application, files: [{column: 'Student Signature', name: 'x.pdf', mimeType: 'application/pdf', data: 'AA=='}]});
  assert.equal(savedFiles.length, 0);
  const r = post({...application, files: [{column: 'ACT Report', name: 'x.exe', mimeType: 'application/x-msdownload', data: 'AA=='}]});
  assert.equal(r.ok, false);
});
