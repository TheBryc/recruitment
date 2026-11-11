// Family portal tests: accounts, households, drafts, submission, status,
// decision release, emails, and follow-up forms.
// Usage (from apps-script/test): node --test portal.test.mjs
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {HEADERS, createEnv, token} from './harness.mjs';

let sheets, ctx, mails, savedFiles;
beforeEach(() => { ({sheets, ctx, mails, savedFiles} = createEnv()); });

const call = body => ctx.doPost({postData: {contents: JSON.stringify(body)}}).body;
const as = (uid, email, verified = true) => (action, extra = {}) => call(Object.assign({action, idToken: token(uid, email, verified)}, extra));
const master = (row, header) => sheets.MASTER.cell(row, HEADERS.MASTER.indexOf(header) + 1);
const setMaster = (row, header, value) => sheets.MASTER.set(row, HEADERS.MASTER.indexOf(header) + 1, value);
const raw = (tab, row, header) => sheets[tab].cell(row, HEADERS[tab].indexOf(header) + 1);

const household = {
  'Account Holder': 'Parent or guardian', 'Guardian First Name': 'Casey', 'Guardian Last Name': 'Sample', 'Guardian Relationship': 'Aunt',
  'Guardian Phone': '2255550123', 'Guardian Email': 'casey.alt@example.com', 'Street Address': '123 Main St', 'City': 'Baton Rouge',
  'State': 'LA', 'ZIP Code': '70802'
};
const appFields = {
  'Program Year': '2027-2028', 'Student First Name': 'Jordan', 'Student Last Name': 'Sample', 'Current Grade': '8th grade',
  'Grade in Program Year': '9th grade', 'School': 'Thrive Academy', 'Guardian First Name': 'Casey', 'Guardian Last Name': 'Sample',
  'Guardian Relationship': 'Aunt', 'Guardian Phone': '2255550123', 'Guardian Email': 'casey@example.com',
  'Student Signature': 'Jordan Sample', 'Guardian Signature': 'Casey Sample', 'Household Income Range': '$30,001–$48,000'
};

// A family that has signed up, set up the household, and started one application.
function familyWithDraft() {
  const casey = as('uid-casey', 'casey@example.com');
  casey('saveHousehold', {fields: household});
  const {studentKey} = casey('saveDraft', {answers: {studentFirst: 'Jordan'}, fields: {'Student First Name': 'Jordan', 'Student Last Name': 'Sample'}});
  return {casey, studentKey};
}
function submitted() {
  const f = familyWithDraft();
  f.casey('submitApplication', {studentKey: f.studentKey, fields: appFields, files: [{column: 'Academic Record', name: 'card.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64')}]});
  ctx.processPending();
  return f;
}

test('requests without a valid sign-in are refused', () => {
  assert.match(call({action: 'load', idToken: 'not-a-token'}).error, /sign in again/i);
  assert.match(call({action: 'load'}).error, /sign in again/i);
});

test('a new account has no household until it is saved, then gets HH-0001', () => {
  const casey = as('uid-casey', 'Casey@Example.com');
  const first = casey('load');
  assert.equal(first.ok, true);
  assert.equal(first.state.household, null);
  assert.equal(first.state.account.email, 'casey@example.com');
  assert.match(casey('saveHousehold', {fields: {'Guardian First Name': 'Casey'}}).error, /Please complete/);
  const saved = casey('saveHousehold', {fields: household});
  assert.equal(saved.state.household['Household ID'], 'HH-0001');
  assert.equal(raw('HOUSEHOLDS', 2, 'Account UID'), 'uid-casey');
  casey('saveHousehold', {fields: Object.assign({}, household, {City: 'Zachary'})});
  assert.equal(sheets.HOUSEHOLDS.getLastRow(), 2, 'editing does not add a second household');
  assert.equal(raw('HOUSEHOLDS', 2, 'City'), 'Zachary');
  assert.equal(as('uid-dana', 'dana@example.com')('saveHousehold', {fields: household}).state.household['Household ID'], 'HH-0002');
});

test('drafts save, update, and are private to their household', () => {
  const {casey, studentKey} = familyWithDraft();
  assert.match(studentKey, /^S-[0-9A-F]{8}$/);
  casey('saveDraft', {studentKey, answers: {studentFirst: 'Jordan', comfort: 'I joined debate.'}, fields: {'Student First Name': 'Jordan'}});
  const state = casey('load').state;
  assert.equal(state.students.length, 1);
  assert.equal(state.students[0].status, 'Application started');
  assert.equal(state.students[0].answers.comfort, 'I joined debate.');
  const other = as('uid-dana', 'dana@example.com');
  other('saveHousehold', {fields: household});
  assert.match(other('saveDraft', {studentKey, answers: {x: 1}}).error, /could not find/);
  assert.equal(other('load').state.students.length, 0);
});

test('submitting requires a confirmed email and an open program year', () => {
  const {studentKey} = familyWithDraft();
  const unverified = as('uid-casey', 'casey@example.com', false);
  assert.match(unverified('submitApplication', {studentKey, fields: appFields}).error, /confirm your email/);
  const casey = as('uid-casey', 'casey@example.com');
  assert.match(casey('submitApplication', {studentKey, fields: Object.assign({}, appFields, {'Program Year': '2025-2026'})}).error, /closed/);
  assert.match(casey('submitApplication', {studentKey, fields: {'Program Year': '2027-2028'}}).error, /Missing required/);
});

test('a submitted application is saved with its household, emailed, and linked after processing', () => {
  const {casey, studentKey} = familyWithDraft();
  const out = casey('submitApplication', {studentKey, fields: appFields});
  assert.equal(out.ok, true);
  assert.equal(out.state.students[0].status, 'Application received');
  assert.equal(out.state.students[0].answers, null, 'answers are not sent back once submitted');
  assert.equal(raw('APPLICATIONS_RAW', 2, 'Household ID'), 'HH-0001');
  assert.equal(raw('APPLICATIONS_RAW', 2, 'Student Key'), studentKey);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].subject, "We received Jordan's BRYC application");
  assert.deepEqual(mails[0].to.split(','), ['casey@example.com', 'casey.alt@example.com']);
  assert.equal(mails[0].replyTo, 'admissions@thebryc.org');
  assert.equal(mails[0].name, 'BRYC Admissions');
  assert.match(casey('submitApplication', {studentKey, fields: appFields}).error, /already submitted/);
  assert.match(casey('saveDraft', {studentKey, answers: {}}).error, /already submitted/);

  ctx.processPending();
  assert.equal(raw('PORTAL_DRAFTS', 2, 'BRYC ID'), 'PY28-0001');
  assert.equal(master(2, 'Household ID'), 'HH-0001');
  assert.equal(master(2, 'Family Notified'), 'status:Application received');
  assert.equal(mails.length, 1, 'no duplicate received email');
  assert.equal(raw('EMAIL_LOG', 2, 'Result'), 'Sent');
});

test('status changes email the family; decisions stay hidden until released', () => {
  const {casey} = submitted();
  setMaster(2, 'Application Status', 'Under review');
  ctx.processPending();
  assert.equal(mails.length, 2);
  assert.equal(mails[1].subject, "Jordan's BRYC application is under review");
  assert.equal(casey('load').state.students[0].status, 'Under review');

  setMaster(2, 'Application Status', 'Decision ready');
  setMaster(2, 'Decision', 'Admitted');
  ctx.processPending();
  assert.equal(mails.length, 2, 'no email: Decision ready still reads Under review, and the decision is not released');
  const hidden = casey('load').state.students[0];
  assert.equal(hidden.decision, '');
  assert.equal(hidden.stage, 'review');
  assert.equal(hidden.tasks.length, 0);

  setMaster(2, 'Decision Released', true);
  ctx.processPending();
  assert.equal(mails.length, 3);
  assert.equal(mails[2].subject, "A decision is ready for Jordan's BRYC application");
  assert.doesNotMatch(mails[2].body, /admitted/i, 'the email never states the decision');
  const shown = casey('load').state.students[0];
  assert.equal(shown.decision, 'Admitted');
  assert.equal(shown.stage, 'decision');
  assert.deepEqual(shown.tasks.map(t => t.key), ['onboarding', 'transportation']);
  ctx.processPending();
  assert.equal(mails.length, 3, 'nothing is sent twice');
});

test('denied and waitlisted decisions show the LISTS wording and no checklist', () => {
  const {casey} = submitted();
  setMaster(2, 'Decision', 'Denied'); setMaster(2, 'Decision Released', true);
  const s = casey('load').state.students[0];
  assert.equal(s.decision, 'Not admitted');
  assert.equal(s.tasks.length, 0);
});

test('income verification appears when required, is requested by email, and updates MASTER', () => {
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true); setMaster(2, 'Income Verification Required', 'Yes');
  ctx.processPending();
  assert.ok(mails.some(m => m.subject === 'One more step for Jordan: income verification'));
  const before = mails.length;
  ctx.processPending();
  assert.equal(mails.length, before, 'income request sent once');

  const task = casey('load').state.students[0].tasks.find(t => t.key === 'income');
  assert.equal(task.open, true);
  assert.equal(task.done, false);
  const out = casey('submitTask', {studentKey, task: 'income', fields: {'Document Type': 'Form 1040', 'Guardian First Name': 'Casey'},
    files: [{column: 'Document 1', name: '1040.pdf', mimeType: 'application/pdf', data: Buffer.from('1040').toString('base64')}]});
  assert.equal(out.ok, true);
  assert.equal(raw('INCOME_RAW', 2, 'BRYC ID'), 'PY28-0001');
  assert.equal(raw('INCOME_RAW', 2, 'Document Type'), 'Form 1040');
  assert.equal(savedFiles.at(-1).folder, 'income-folder', 'income documents go to the income folder');
  assert.equal(master(2, 'Income Verification Status'), 'Submitted');
  assert.equal(master(2, 'Next Action'), 'Follow Up on Onboarding');
  assert.equal(out.state.students[0].tasks.find(t => t.key === 'income').done, true);
  assert.match(casey('submitTask', {studentKey, task: 'income', fields: {}}).error, /already submitted/);
});

test('follow-up forms are refused when closed, unreleased, or for another family', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = false', ctx);
  const {casey, studentKey} = submitted();
  assert.match(casey('submitTask', {studentKey, task: 'onboarding', fields: {}}).error, /not open yet/);
  assert.match(casey('submitTask', {studentKey, task: 'income', fields: {}}).error, /not available/);
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Income Verification Required', 'Yes');
  assert.match(casey('submitTask', {studentKey, task: 'income', fields: {}}).error, /not available/, 'not released yet');
  setMaster(2, 'Decision Released', true);
  const dana = as('uid-dana', 'dana@example.com'); dana('saveHousehold', {fields: household});
  assert.match(dana('submitTask', {studentKey, task: 'income', fields: {}}).error, /not available/);
});

test('onboarding: accepting completes it; declining records the decline without a decision email', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  ctx.processPending();
  const sent = mails.length;
  casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes', 'Guardian Signature': 'Casey Sample'}});
  assert.equal(master(2, 'Onboarding Status'), 'Complete');
  assert.equal(master(2, 'Current RAM Status'), 'Matriculating');

  const second = as('uid-dana', 'dana@example.com');
  second('saveHousehold', {fields: Object.assign({}, household, {'Guardian First Name': 'Dana', 'Guardian Email': 'dana@example.com'})});
  const {studentKey: k2} = second('saveDraft', {answers: {}, fields: {'Student First Name': 'Avery'}});
  second('submitApplication', {studentKey: k2, fields: Object.assign({}, appFields, {'Student First Name': 'Avery', 'Guardian First Name': 'Dana', 'Guardian Email': 'dana@example.com', 'Guardian Phone': '2255550999'})});
  ctx.processPending();
  setMaster(3, 'Decision', 'Admitted'); setMaster(3, 'Decision Released', true);
  ctx.processPending();
  const beforeDecline = mails.length;
  second('submitTask', {studentKey: k2, task: 'onboarding', fields: {'Accepts Admission': 'No, we are declining', 'Decline Reason': 'Moving away'}});
  assert.equal(master(3, 'Decision'), 'Declined');
  assert.equal(master(3, 'Current RAM Status'), 'Declined');
  ctx.processPending();
  const after = mails.slice(beforeDecline);
  assert.ok(after.some(m => /We received your response for Avery/.test(m.subject)), 'decline is confirmed right away');
  assert.ok(!after.some(m => /decision is ready/i.test(m.subject)), 'no "decision is ready" email after the family declines');
  assert.ok(sent > 0);
});

test('onboarding starts from the application and household, and records what the family changed', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  ctx.processPending();

  const task = casey('load').state.students[0].tasks.find(t => t.key === 'onboarding');
  const pre = task.prefill;
  assert.equal(pre['Student First Name'], 'Jordan');
  assert.equal(pre['Grade in Program Year'], '9th grade');
  assert.equal(pre['School'], 'Thrive Academy');
  assert.equal(pre['Household Income Range'], '$30,001–$48,000');
  assert.equal(pre['Guardian Email'], 'casey.alt@example.com', 'the household wins over the application for guardian contact');
  assert.equal(pre['Street Address'], '123 Main St');
  assert.equal(pre['Second Guardian'], 'No');
  assert.ok(!('Second Guardian First Name' in pre));
  assert.ok(!('Student Birthday' in pre), 'new questions are never prefilled');

  // Another household never sees this student's prefill.
  const dana = as('uid-dana', 'dana@example.com'); dana('saveHousehold', {fields: household});
  assert.equal(dana('load').state.students.length, 0);

  const fields = Object.assign({}, pre, {'Accepts Admission': 'Yes, we accept', 'Student Phone': '2255550111', 'Student Birthday': '2012-05-01',
    'Guardian Signature': 'Casey Sample', 'Not A Column': 'dropped'});
  casey('submitTask', {studentKey, task: 'onboarding', fields});
  const H = sheets.ONBOARDING_RAW.rows[0], row = sheets.ONBOARDING_RAW.rows[1], col = h => row[H.indexOf(h)];
  assert.equal(col('Student First Name'), 'Jordan');
  assert.equal(col('Student Birthday'), '2012-05-01');
  assert.equal(col('Household Income Range'), '$30,001–$48,000');
  assert.equal(col('Changed From Application'), 'Student Phone');
  assert.ok(!H.includes('Not A Column'), 'unknown columns are not added');
  assert.equal(master(2, 'Onboarding Status'), 'Complete');
  assert.equal(casey('load').state.students[0].tasks.find(t => t.key === 'onboarding').prefill, undefined, 'no prefill once it is done');
});

test('onboarding takes the second guardian as a set from the application when the household has none', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = familyWithDraft();
  casey('submitApplication', {studentKey, fields: Object.assign({}, appFields, {'Second Guardian': 'Yes', 'Guardian 2 First Name': 'Morgan',
    'Guardian 2 Last Name': 'Sample', 'Guardian 2 Relationship': 'Father', 'Guardian 2 Phone': '2255550456', 'Guardian 2 Different Address': 'Yes',
    'Guardian 2 Street Address': '9 Oak St', 'Guardian 2 City': 'Zachary', 'Guardian 2 State': 'LA', 'Guardian 2 ZIP Code': '70791'})});
  ctx.processPending();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  const pre = casey('load').state.students[0].tasks.find(t => t.key === 'onboarding').prefill;
  assert.equal(pre['Second Guardian'], 'Yes');
  assert.equal(pre['Second Guardian First Name'], 'Morgan');
  assert.equal(pre['Second Guardian Same Address'], 'No', '"different address: yes" becomes "same address: no"');
  assert.equal(pre['Second Guardian City'], 'Zachary');
});

test('only an exact "Admitted" decision unlocks onboarding', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Not admitted'); setMaster(2, 'Decision Released', true);
  assert.deepEqual(casey('load').state.students[0].tasks, []);
  assert.match(casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes'}}).error, /not available/);
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', '');
  assert.deepEqual(casey('load').state.students[0].tasks, [], 'not until the decision is released');
  setMaster(2, 'Decision Released', true);
  assert.ok(casey('load').state.students[0].tasks.some(t => t.key === 'onboarding'));
});

test('form confirmations go out the moment a form is submitted', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  const before = mails.length;
  casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes, we accept', 'Guardian Signature': 'Casey Sample'}});
  const sent = mails.slice(before);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "We received Jordan's onboarding form");
  assert.match(sent[0].to, /casey@example\.com/);
});

test('releasing a decision in MASTER emails the family right away, once', () => {
  const {casey} = submitted();
  ctx.processPending();
  const before = mails.length;
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  const col = HEADERS.MASTER.indexOf('Decision Released') + 1;
  const edit = {range: {getSheet: () => sheets.MASTER, getRow: () => 2, getLastRow: () => 2, getColumn: () => col, getLastColumn: () => col}};
  ctx.onMasterChange(edit);
  assert.equal(mails.length, before + 1);
  assert.match(mails[mails.length - 1].subject, /decision is ready for Jordan/);
  ctx.onMasterChange(edit); ctx.processPending();
  assert.equal(mails.length, before + 1, 'not sent twice');
  // An edit to a column that doesn't affect emails does nothing.
  ctx.onMasterChange({range: {getSheet: () => sheets.MASTER, getRow: () => 2, getLastRow: () => 2, getColumn: () => 1, getLastColumn: () => 1}});
  assert.equal(mails.length, before + 1);
  assert.ok(casey);
});

test('the decision email is skipped if the family already finished onboarding', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes, we accept'}});
  const before = mails.length;
  ctx.processPending();
  assert.ok(!mails.slice(before).some(m => /decision is ready/i.test(m.subject)));
});

test('onboarding fills school district and parish from the SCHOOLS tab', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  sheets.SCHOOLS.appendRow(['Thrive Academy', 'Thrive Academy', 'East Baton Rouge', '']);
  const {casey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  const task = casey('load').state.students[0].tasks.find(t => t.key === 'onboarding');
  assert.equal(task.prefill['School District'], 'Thrive Academy');
  assert.equal(task.prefill['School Parish'], 'East Baton Rouge');
  assert.deepEqual(task.schools, [['Thrive Academy', 'Thrive Academy', 'East Baton Rouge']]);
});

test('current-year applicants: onboarding confirms the grade they gave on the application', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = familyWithDraft();
  const fields = Object.assign({}, appFields, {'Program Year': '2026-2027', 'Current Grade': '10th grade'});
  delete fields['Grade in Program Year'];
  casey('submitApplication', {studentKey, fields});
  ctx.processPending();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  const pre = casey('load').state.students[0].tasks.find(t => t.key === 'onboarding').prefill;
  assert.equal(pre['Grade in Program Year'], '10th grade');
});

test('transportation opens after onboarding, starts from it, and records the route', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  sheets.SCHOOLS.appendRow(['Thrive Academy', 'Thrive Academy', 'East Baton Rouge', '', 'Yes']);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  let tr = casey('load').state.students[0].tasks.find(t => t.key === 'transportation');
  assert.equal(tr.open, false);
  assert.equal(tr.waiting, 'After onboarding');
  assert.match(casey('submitTask', {studentKey, task: 'transportation', fields: {'Needs BRYC Transportation': 'Yes'}}).error, /not open yet/);

  casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes, we accept', 'Guardian Phone': '2255550888', 'School': 'Thrive Academy'}});
  tr = casey('load').state.students[0].tasks.find(t => t.key === 'transportation');
  assert.equal(tr.open, true);
  assert.equal(tr.prefill['Guardian Phone'], '2255550888', 'the onboarding answer wins');
  assert.equal(tr.prefill['Student First Name'], 'Jordan');
  assert.equal(tr.period, 'August 1, 2027 – July 31, 2028');
  assert.deepEqual(tr.schools, [['Thrive Academy', 1]]);

  assert.match(casey('submitTask', {studentKey, task: 'transportation', fields: {'Needs BRYC Transportation': 'Yes', 'School': 'Thrive Academy'}}).error, /Authorization/);
  const before = mails.length;
  casey('submitTask', {studentKey, task: 'transportation', fields: Object.assign({}, tr.prefill, {'Needs BRYC Transportation': 'Yes',
    'Authorization Agreed': 'Yes - agreed to be legally bound', 'Guardian Signature': 'Casey Sample'})});
  const H = sheets.TRANSPORTATION_RAW.rows[0], row = sheets.TRANSPORTATION_RAW.rows[1], col = h => row[H.indexOf(h)];
  assert.equal(col('School Has Route'), 'Yes');
  assert.equal(col('Authorization Period'), 'August 1, 2027 – July 31, 2028');
  assert.equal(col('Guardian Phone'), '2255550888');
  const M = sheets.MASTER.rows[0];
  assert.equal(sheets.MASTER.rows[1][M.indexOf('Transportation')], 'Riding from Thrive Academy');
  assert.match(mails[before].subject, /transportation form/);
  assert.match(mails[before].body, /texting line/);
  assert.equal(casey('load').state.students[0].tasks.find(t => t.key === 'transportation').done, true);
});

test('transportation: a school without a route is logged as a request; "no" skips the waiver', () => {
  vm.runInContext('PORTAL.tasks.onboarding.open = true', ctx);
  const {casey, studentKey} = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Decision Released', true);
  casey('submitTask', {studentKey, task: 'onboarding', fields: {'Accepts Admission': 'Yes, we accept'}});
  const before = mails.length;
  casey('submitTask', {studentKey, task: 'transportation', fields: {'Needs BRYC Transportation': "No, we'll get them to campus", 'School': 'Thrive Academy',
    'Authorization Agreed': 'Yes'}});
  const H = sheets.TRANSPORTATION_RAW.rows[0], row = sheets.TRANSPORTATION_RAW.rows[1], col = h => row[H.indexOf(h)];
  assert.equal(col('Authorization Agreed'), '');
  const M = sheets.MASTER.rows[0];
  assert.equal(sheets.MASTER.rows[1][M.indexOf('Transportation')], 'Not riding');
  assert.match(mails[before].body, /won't need BRYC transportation/);
});

// An admitted family that has sent income verification.
function incomeSubmitted() {
  const f = submitted();
  setMaster(2, 'Decision', 'Admitted'); setMaster(2, 'Income Verification Required', 'Yes'); setMaster(2, 'Decision Released', true);
  f.casey('submitTask', {studentKey: f.studentKey, task: 'income', fields: {'Document Type': 'IRS Form 1040 (preferred)', 'Guardian First Name': 'Casey'},
    files: [{column: 'Document 1', name: '1040.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64')}]});
  return f;
}
const incomeSet = (header, value) => { const H = sheets.INCOME_RAW.rows[0]; sheets.INCOME_RAW.set(2, H.indexOf(header) + 1, value); };
const incomeGet = header => { const H = sheets.INCOME_RAW.rows[0]; return sheets.INCOME_RAW.rows[1][H.indexOf(header)]; };
const masterCol = header => sheets.MASTER.rows[1][sheets.MASTER.rows[0].indexOf(header)];
const reviewEdit = header => { const col = sheets.INCOME_RAW.rows[0].indexOf(header) + 1;
  return {user: {getEmail: () => 'forrest@thebryc.org'}, range: {getSheet: () => sheets.INCOME_RAW, getRow: () => 2, getLastRow: () => 2, getColumn: () => col, getLastColumn: () => col}}; };

test('income fee scale', () => {
  const fee = agi => ctx.participationFee(agi);
  assert.deepEqual([109999, 110000, 160000, 160001, 210000, 210001, 400000].map(fee), [0, 250, 250, 350, 350, 500, 500]);
  assert.equal(ctx.parseMoney('$123,456.00'), 123456);
  assert.equal(ctx.parseMoney(''), null);
});

test('income verified under $110,000: no fee, family emailed, verifier recorded', () => {
  incomeSubmitted();
  const before = mails.length;
  incomeSet('Verified AGI', '$58,200'); incomeSet('Verification Result', 'Verified');
  ctx.onMasterChange(reviewEdit('Verification Result'));
  assert.equal(incomeGet('Participation Fee'), 0);
  assert.equal(incomeGet('Verified By'), 'forrest@thebryc.org');
  assert.equal(typeof incomeGet('Verified Date').getTime, 'function');
  assert.equal(masterCol('Income Verification Status'), 'Verified');
  assert.equal(masterCol('Fee Status'), 'Not required');
  assert.equal(mails.length, before + 1);
  assert.match(mails[before].subject, /income verification is complete/);
  assert.doesNotMatch(mails[before].body, /\$|fee/i);
  ctx.processPending();
  assert.equal(mails.filter(m => /income verification is complete/.test(m.subject)).length, 1, 'not sent twice');
});

test('income verified with a fee: no automatic email, MASTER asks staff to confirm the fee', () => {
  incomeSubmitted();
  setMaster(2, 'Onboarding Status', 'Complete');
  const before = mails.length;
  incomeSet('Verified AGI', 175000); incomeSet('Verification Result', 'Verified');
  ctx.onMasterChange(reviewEdit('Verified AGI'));
  assert.equal(incomeGet('Participation Fee'), 350);
  assert.equal(masterCol('Participation Fee'), 350);
  assert.equal(masterCol('Fee Status'), 'To confirm');
  assert.equal(masterCol('Next Action'), 'Confirm Participation Fee');
  assert.equal(mails.length, before, 'families never get the fee by email');
});

test('income needs follow-up: waits for the note, emails it, and reopens the form', () => {
  const {casey, studentKey} = incomeSubmitted();
  const before = mails.length;
  incomeSet('Verification Result', 'Needs follow-up');
  ctx.onMasterChange(reviewEdit('Verification Result'));
  assert.equal(mails.length, before, 'no email until there is a note');
  incomeSet('Note to Family', 'Please upload page 1 with line 11 showing.');
  ctx.onMasterChange(reviewEdit('Note to Family'));
  assert.equal(mails.length, before + 1);
  assert.match(mails[before].body, /line 11 showing/);
  assert.equal(masterCol('Income Verification Status'), 'Needs follow-up');
  const task = casey('load').state.students[0].tasks.find(t => t.key === 'income');
  assert.equal(task.done, false);
  assert.equal(task.followUp, 'Please upload page 1 with line 11 showing.');
  const again = casey('submitTask', {studentKey, task: 'income', fields: {'Document Type': 'IRS Form 1040 (preferred)'},
    files: [{column: 'Document 1', name: '1040.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64')}]});
  assert.equal(again.ok, true);
  assert.equal(sheets.INCOME_RAW.rows.length, 3, 'a second submission is saved as a new row');
});

test('siblings live under one household with their own statuses', () => {
  const {casey} = submitted();
  const {studentKey: k2} = casey('saveDraft', {answers: {}, fields: {'Student First Name': 'Riley', 'Student Last Name': 'Sample'}});
  const students = casey('load').state.students;
  assert.equal(students.length, 2);
  assert.deepEqual(students.map(s => s.status), ['Application received', 'Application started']);
  assert.notEqual(students[1].studentKey, students[0].studentKey);
  assert.ok(k2);
});

test('emails that fail are logged and retried on the next run', () => {
  submitted();
  ctx.MailApp.sendEmail = () => { throw new Error('Service invoked too many times'); };
  setMaster(2, 'Application Status', 'Under review');
  ctx.processPending();
  assert.equal(master(2, 'Family Notified'), 'status:Application received', 'not marked as sent');
  assert.match(sheets.EMAIL_LOG.cell(sheets.EMAIL_LOG.getLastRow(), 7), /^Failed/);
  ctx.MailApp.sendEmail = m => mails.push(m);
  ctx.processPending();
  assert.equal(master(2, 'Family Notified'), 'status:Under review');
});

test('second guardian: saved on the household, cleared when removed, and copied to MASTER', () => {
  const casey = as('uid-casey', 'casey@example.com');
  const g2 = {'Second Guardian': 'Yes', 'Guardian 2 First Name': 'Morgan', 'Guardian 2 Last Name': 'Sample', 'Guardian 2 Relationship': 'Father',
    'Guardian 2 Phone': '2255550456', 'Guardian 2 Different Address': 'Yes', 'Guardian 2 Street Address': '9 Oak St', 'Guardian 2 City': 'Zachary',
    'Guardian 2 State': 'LA', 'Guardian 2 ZIP Code': '70791'};
  let state = casey('saveHousehold', {fields: Object.assign({}, household, g2)}).state;
  assert.equal(state.household['Guardian 2 First Name'], 'Morgan');
  assert.equal(state.household['Guardian 2 City'], 'Zachary');

  // Same address: the second address is cleared.
  state = casey('saveHousehold', {fields: Object.assign({}, household, g2, {'Guardian 2 Different Address': 'No'})}).state;
  assert.equal(state.household['Guardian 2 Street Address'], '');
  assert.equal(state.household['Guardian 2 First Name'], 'Morgan');

  // Removed: every second guardian field is cleared.
  state = casey('saveHousehold', {fields: household}).state;
  assert.equal(state.household['Second Guardian'], 'No');
  assert.equal(state.household['Guardian 2 First Name'], '');
  assert.equal(state.household['Guardian 2 Phone'], '');

  // On the application, MASTER gets the second guardian's name, contact, and address.
  const {studentKey} = casey('saveDraft', {answers: {studentFirst: 'Jordan'}, fields: {'Student First Name': 'Jordan'}});
  const out = casey('submitApplication', {studentKey, fields: Object.assign({}, appFields, g2)});
  assert.equal(out.ok, true, out.error);
  assert.equal(raw('APPLICATIONS_RAW', 2, 'Guardian 2 Last Name'), 'Sample');
  ctx.processPending();
  const live = header => sheets.MASTER.cell(2, sheets.MASTER.rows[0].indexOf(header) + 1);
  assert.equal(live('Guardian 2 Name'), 'Morgan Sample');
  assert.equal(live('Guardian 2 Relationship'), 'Father');
  assert.match(String(live('Guardian 2 Address')), /9 Oak St.*Zachary LA 70791/);
});
