// Runs Code.gs against an in-memory copy of PY28 RAM HQ's headers.
// Usage (from apps-script/test): node --test code.test.mjs
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS, Range, createEnv} from './harness.mjs';

let sheets, ctx, savedFiles, mails, props;
function load() { ({sheets, ctx, savedFiles, mails, props} = createEnv()); }
const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
// Submit, then run the every-minute job the way the trigger would.
const submit = body => ctx.doPost({postData: {contents: JSON.stringify(body)}}).body;
const post = body => { const out = submit(body); ctx.processPending(); return out; };
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
  'BRYC Relative': 'Yes', 'Relative Names': 'Avery Sample', 'How did you first hear about BRYC?': 'Student in BRYC',
  'Household Income Range': '$30,001–$48,000' },
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
  assert.equal(master(2, 'Household Income Range'), '$30,001–$48,000');
  assert.equal(raw('APPLICATIONS_RAW', 2, 'Household Income Range'), '$30,001–$48,000');
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
  assert.equal(r.ok, false); assert.match(r.error, /Current Grade/);
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

test('submitting only saves the raw row; the background job does the rest', () => {
  assert.deepEqual(submit(referral), {ok: true});
  assert.equal(raw('REFERRALS_RAW', 2, 'Student First Name'), 'Jordan');
  assert.equal(raw('REFERRALS_RAW', 2, 'BRYC ID'), '');
  assert.equal(sheets.MASTER.getLastRow(), 1, 'MASTER untouched until the job runs');
  ctx.processPending();
  assert.equal(raw('REFERRALS_RAW', 2, 'BRYC ID'), 'PY28-0001');
  assert.equal(master(2, 'Fellow First Name'), 'Jordan');
  ctx.processPending();
  assert.equal(sheets.MASTER.getLastRow(), 2, 'running again does not duplicate');
});

test('a row that cannot be processed is marked NEEDS REVIEW and skipped later', () => {
  const s = sheets.INQUIRIES_RAW;
  s.appendRow(HEADERS.INQUIRIES_RAW.map(h => h === 'Timestamp' ? new Date() : ''));
  ctx.processPending();
  assert.equal(raw('INQUIRIES_RAW', 2, 'BRYC ID'), 'NEEDS REVIEW');
  assert.equal(sheets.MASTER.getLastRow(), 1);
});

test('an upload that saves empty is flagged and the application still saves', () => {
  post({...application, files: [{column: 'Academic Record', name: 'blank.png', mimeType: 'image/png', data: ''}]});
  assert.match(raw('APPLICATIONS_RAW', 2, 'Academic Record'), /^UPLOAD FAILED: ask family to resend/);
  assert.equal(master(2, 'Application Status'), 'Submitted');
});

test('interest form: guardian details are optional, but one phone or email is required', () => {
  const student = {'Student First Name': 'Riley', 'Student Last Name': 'Young', 'School': 'Thrive Academy', 'Current Grade': '7th',
    'How did you first hear about BRYC?': 'BRYC representative'};
  const none = post({form: 'inquiry', fields: student});
  assert.equal(none.ok, false); assert.match(none.error, /at least one phone number or email/);
  assert.equal(sheets.INQUIRIES_RAW.getLastRow(), 1, 'nothing written');

  const ok = post({form: 'inquiry', fields: {...student, 'Student Phone': '225-555-0177'}});
  assert.equal(ok.ok, true, ok.error);
  assert.equal(master(2, 'Fellow First Name'), 'Riley');
  assert.equal(mails.length, 0, 'no email address, so nothing is sent');
});

test('interest form: the family gets a thank-you email with the information sheet', () => {
  props.INFO_SHEET_URL = 'https://drive.google.com/file/d/info-sheet';
  post({form: 'inquiry', fields: {...inquiry.fields, 'Student Email': 'jordan@example.com'}});
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'jordan@example.com,casey@example.com');
  assert.equal(m.subject, 'Thanks for your interest in BRYC');
  assert.match(m.htmlBody, /Hi Casey,/);
  assert.match(m.htmlBody, /href="https:\/\/drive.google.com\/file\/d\/info-sheet"/);
  assert.match(m.body, /View the BRYC information sheet: https:\/\/drive.google.com/);
  assert.match(m.body, /a parent\/guardian can create a household account/);

  // Processing again (for example after a fix) does not send a second email.
  ctx.processPending();
  assert.equal(mails.length, 1);
});

test('interest form: without an information sheet link, the email points to the application', () => {
  post(inquiry);
  assert.equal(mails.length, 1);
  assert.match(mails[0].body, /Start an application: https:\/\/thebryc.github.io\/recruitment\/#apply/);
  assert.doesNotMatch(mails[0].body, /information sheet/);
});

test('referral: the person who referred the student gets a thank-you right away', () => {
  submit(referral);
  const m = mails.find(x => x.subject === 'Thank you for referring Jordan Sample to BRYC');
  assert.ok(m, 'thank-you sent before processing');
  assert.equal(m.to, 'pat@school.org');
  assert.match(m.htmlBody, /Hi Pat,/);
  assert.match(m.body, /Our admissions team will reach out to Jordan and their family/);
  assert.match(m.body, /Refer another student: https:\/\/thebryc.github.io\/recruitment\/#refer/);
  ctx.processPending();
  assert.equal(mails.filter(x => /Thank you for referring/.test(x.subject)).length, 1, 'not sent twice');
});
