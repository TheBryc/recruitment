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
  assert.equal(mails.length, beforeDecline, 'no "decision is ready" email after the family declines');
  assert.ok(sent > 0);
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
