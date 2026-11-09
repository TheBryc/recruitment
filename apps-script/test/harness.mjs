// In-memory stand-ins for the Apps Script services Code.gs and Portal.gs use,
// set up with PY28 RAM HQ's real headers.
import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import vm from 'node:vm';

export const HEADERS = {
  REFERRALS_RAW: ['Timestamp', 'Referrer First Name', 'Referrer Last Name', 'Referrer Email', 'Referrer Phone', 'Which best describes you?', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'School', 'School Not Listed', 'Current Grade', 'Student Cell Phone', 'Student Email', 'Anything Else We Should Know', 'Has Guardian Contact', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'BRYC ID'],
  INQUIRIES_RAW: ['Timestamp', 'Submitted By', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'School', 'School Not Listed', 'Current Grade', 'Student Phone', 'Student Email', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'How did you first hear about BRYC?', 'BRYC ID'],
  APPLICATIONS_RAW: ['Timestamp', 'Program Year', 'Student First Name', 'Student Last Name', 'Student Gender Identity', 'Student Email', 'Student Phone', 'Current Grade', 'Grade in Program Year', 'School', 'School Not Listed', 'BRYC Relative', 'Relative Names', 'Academic Record', 'ACT Taken', 'ACT Report', 'Self-Reported Grades', 'Short Response #1', 'Short Response #2', 'Short Response #3', 'Activities Outside Class', 'How did you first hear about BRYC?', 'Student Certification', 'Student Signature', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Email', 'Guardian Phone', 'Street Address', 'Apartment or Unit', 'City', 'State', 'ZIP Code', 'Parish or County', 'Household Members', 'Home Language', 'Need Circumstances', 'Policy Acknowledgment', 'Guardian Signature', 'BRYC ID', 'Household Income Range', 'Household ID', 'Student Key', 'Second Guardian', 'Guardian 2 First Name', 'Guardian 2 Last Name', 'Guardian 2 Relationship', 'Guardian 2 Phone', 'Guardian 2 Email', 'Guardian 2 Different Address', 'Guardian 2 Street Address', 'Guardian 2 Apartment or Unit', 'Guardian 2 City', 'Guardian 2 State', 'Guardian 2 ZIP Code'],
  ID_REGISTRY: ['BRYC ID', 'First Name', 'Last Name', 'Student Email', 'Student Phone', 'Guardian Email', 'Guardian Phone', 'School', 'First Entry Source', 'Date Created'],
  MASTER: ['BRYC ID', 'Fellow First Name', 'Fellow Last Name', 'Gender', 'Program Year', 'Grade', 'School', 'Student Email', 'Student Phone', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone Number', 'Guardian Email', 'Home Address', 'Home Language', 'Relative in BRYC', 'Recruitment Source', 'Referred By', 'Referral Date', 'Inquiry Date', 'Application Date', 'Application Status', 'Decision', 'Decision Date', 'Onboarding Status', 'Onboarding Date', 'Income Verification Required', 'Income Verification Status', 'Current RAM Status', 'Next Action', 'Last Activity', 'RAM Notes', 'Match Status', 'Application Link', 'Onboarding Link', 'Income Verification Link', 'Data Authority Rank', 'Household Income Range', 'Household ID', 'Decision Released', 'Family Notified', 'Income Request Sent'],
  HOUSEHOLDS: ['Household ID', 'Account UID', 'Account Email', 'Account Holder', 'Guardian First Name', 'Guardian Last Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email', 'Street Address', 'Apartment or Unit', 'City', 'State', 'ZIP Code', 'Parish or County', 'Created', 'Updated', 'Second Guardian', 'Guardian 2 First Name', 'Guardian 2 Last Name', 'Guardian 2 Relationship', 'Guardian 2 Phone', 'Guardian 2 Email', 'Guardian 2 Different Address', 'Guardian 2 Street Address', 'Guardian 2 Apartment or Unit', 'Guardian 2 City', 'Guardian 2 State', 'Guardian 2 ZIP Code'],
  PORTAL_DRAFTS: ['Student Key', 'Household ID', 'Student First Name', 'Student Last Name', 'Program Year', 'Draft', 'Created', 'Updated', 'Submitted At', 'BRYC ID'],
  EMAIL_LOG: ['Sent At', 'Type', 'To', 'Subject', 'BRYC ID', 'Household ID', 'Result'],
  INCOME_RAW: ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key', 'Guardian First Name', 'Guardian Last Name', 'Guardian Email', 'Guardian Phone', 'Document Type', 'Filed Separately', 'Document 1', 'Document 2', 'Notes', 'Verified AGI', 'Verification Result', 'Verified By', 'Verified Date', 'Document Deleted Date'],
  ONBOARDING_RAW: ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key', 'Accepts Admission', 'Decline Reason', 'Student Preferred First Name', 'Guardian Signature'],
  TRANSPORTATION_RAW: ['Timestamp', 'BRYC ID', 'Household ID', 'Student Key', 'Needs BRYC Transportation', 'Guardian Signature']
};

// LISTS columns the portal reads for family-facing wording.
const LISTS = [
  ['Application Status', 'Family Sees (Status)', 'Decision', 'Family Sees (Decision)'],
  ['In progress', 'Application started', 'Admitted', 'Admitted'],
  ['Submitted', 'Application received', 'Waitlisted - Capacity', 'Waitlisted'],
  ['Under review', 'Under review', 'Denied', 'Not admitted'],
  ['Decision ready', 'Under review', 'Declined', 'Declined']
];

export class Sheet {
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

export class Range {
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

// Sign-in tokens in tests are base64 JSON: {uid, email, verified}.
export const token = (uid, email, verified = true) => Buffer.from(JSON.stringify({uid, email, verified})).toString('base64');

export function createEnv() {
  const sheets = {}; let id = 1;
  for (const [name, headers] of Object.entries(HEADERS)) sheets[name] = new Sheet(name, id++, headers);
  sheets.LISTS = new Sheet('LISTS', id++); LISTS.forEach(r => sheets.LISTS.appendRow(r));
  const savedFiles = [], mails = [], cache = new Map(), props = {};
  const ctx = {
    console: {error() {}, warn() {}, log() {}},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n, id++)), getUrl: () => 'https://sheet' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    ContentService: { MimeType: {JSON: 'json'}, createTextOutput: t => ({ setMimeType: () => ({ body: JSON.parse(t) }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({INCOME_FOLDER_ID: 'income-folder', UPLOAD_FOLDER_ID: 'folder123', INFO_SHEET_URL: props.INFO_SHEET_URL})[k] ?? null }) },
    Utilities: {
      base64Decode: d => Buffer.from(d, 'base64'), newBlob: (bytes, type, name) => ({bytes, type, name}),
      DigestAlgorithm: {SHA_256: 'sha256'}, computeDigest: (alg, s) => [...createHash(alg).update(s).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'), getUuid: () => randomUUID()
    },
    DriveApp: { getFolderById: folder => ({ createFile: blob => { savedFiles.push(Object.assign({folder}, blob)); return { getUrl: () => 'https://drive/' + blob.name, getSize: () => blob.bytes.length }; } }) },
    UrlFetchApp: { fetch: (url, opts) => {
      let user = null;
      try { user = JSON.parse(Buffer.from(JSON.parse(opts.payload).idToken, 'base64').toString()); } catch (e) { user = null; }
      const ok = user && user.uid;
      return { getResponseCode: () => ok ? 200 : 400,
        getContentText: () => JSON.stringify(ok ? {users: [{localId: user.uid, email: user.email, emailVerified: user.verified}]} : {error: {message: 'INVALID_ID_TOKEN'}}) };
    } },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: m => mails.push(m) }
  };
  vm.createContext(ctx);
  for (const file of ['../Code.gs', '../Portal.gs']) vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), ctx);
  return {sheets, ctx, savedFiles, mails, props};
}
