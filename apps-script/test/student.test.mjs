// Student-started applications: a student fills in their part, invites a
// parent/guardian by email, and that parent/guardian finishes, signs, and submits.
// Also covers deleting unsubmitted drafts after July 31 of their school year.
// Usage (from apps-script/test): node --test student.test.mjs
import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {HEADERS, createEnv, token} from './harness.mjs';

let sheets, ctx, mails, savedFiles, props, trashed;
beforeEach(() => { ({sheets, ctx, mails, savedFiles, props, trashed} = createEnv()); });

const call = body => ctx.doPost({postData: {contents: JSON.stringify(body)}}).body;
const as = (uid, email, verified = true) => (action, extra = {}) => call(Object.assign({action, idToken: token(uid, email, verified)}, extra));
const drafts = () => JSON.parse(vm.runInContext(`JSON.stringify(readObjects(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PORTAL_DRAFTS')))`, ctx));
const appRow = header => sheets.APPLICATIONS_RAW.cell(2, sheets.APPLICATIONS_RAW.rows[0].indexOf(header) + 1);

const studentAnswers = {studentFirst: 'Riley', studentLast: 'Lane', academicYear: '2027-2028', comfort: 'I joined the debate team.',
  growth: 'Time management.', support: 'A mentor.', studentCertification: 'yes', studentSignature: 'Riley Lane'};
const names = {'Student First Name': 'Riley', 'Student Last Name': 'Lane', 'Program Year': '2027-2028'};
const card = {column: 'Academic Record', name: 'report-card.pdf', mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64')};
const household = {'Guardian First Name': 'Dana', 'Guardian Last Name': 'Lane', 'Guardian Relationship': 'Mother', 'Guardian Phone': '2255550199',
  'Guardian Email': 'dana@example.com', 'Street Address': '5 Elm St', 'City': 'Baton Rouge', 'State': 'LA', 'ZIP Code': '70806'};
const guardianFields = Object.assign({}, names, {'Current Grade': '8th grade', 'Grade in Program Year': '9th grade', 'School': 'Thrive Academy',
  'Guardian First Name': 'Dana', 'Guardian Last Name': 'Lane', 'Guardian Relationship': 'Mother', 'Guardian Phone': '2255550199',
  'Guardian Email': 'dana@example.com', 'Guardian Signature': 'Dana Lane',
  // A parent/guardian's browser could send anything here; RAM HQ keeps the student's words.
  'Short Response #1': 'Changed by an adult', 'Student Signature': 'Not Riley', 'Student Certification': 'Yes'});

const riley = as('uid-riley', 'riley@student.org');
const dana = as('uid-dana', 'dana@example.com', false); // a brand-new account: email not confirmed in Firebase

function invited() {
  riley('saveDraft', {role: 'student', answers: studentAnswers, fields: names});
  const out = riley('inviteGuardian', {answers: studentAnswers, fields: names, files: [card],
    guardian: {'First Name': 'Dana', 'Last Name': 'Lane', Email: 'Dana@Example.com'}});
  assert.equal(out.ok, true, out.error);
  const link = mails.at(-1).htmlBody.match(/href="([^"]+invite=([a-f0-9]+)[^"]*)"/);
  return {out, link: link[1], token: link[2]};
}

test('a student account saves its own application, with no household', () => {
  assert.match(riley('saveDraft', {answers: studentAnswers, fields: names}).error, /household information first/, 'only with role student');
  const {studentKey} = riley('saveDraft', {role: 'student', answers: studentAnswers, fields: names});
  assert.match(studentKey, /^S-/);
  const [d] = drafts();
  assert.equal(d['Started By'], 'Student'); assert.equal(d['Student Account UID'], 'uid-riley'); assert.equal(d['Household ID'], '');
  const state = riley('load').state;
  assert.equal(state.role, 'student'); assert.equal(state.application.status, 'editing'); assert.equal(state.application.answers.comfort, studentAnswers.comfort);
  assert.equal(riley('saveDraft', {answers: Object.assign({}, studentAnswers, {growth: 'Reading'}), fields: names}).studentKey, studentKey, 'one application per student');
  assert.equal(drafts().length, 1);
});

test('the student invites a parent/guardian: documents saved, email sent with a one-time link', () => {
  riley('saveDraft', {role: 'student', answers: studentAnswers, fields: names});
  assert.match(riley('inviteGuardian', {answers: Object.assign({}, studentAnswers, {support: ''}), guardian: {'First Name': 'Dana', 'Last Name': 'Lane', Email: 'dana@example.com'}}).error,
    /three short questions/);
  assert.match(riley('inviteGuardian', {answers: studentAnswers, guardian: {'First Name': 'Dana', 'Last Name': 'Lane', Email: 'riley@student.org'}}).error, /own email address/);

  const {out, link, token} = invited();
  assert.equal(out.state.application.status, 'invited');
  assert.deepEqual(out.state.application.invite.email, 'dana@example.com');
  assert.deepEqual({...out.state.application.savedUploads}, {'Academic Record': 'report-card.pdf'});
  assert.equal(savedFiles.length, 1);
  const mail = mails.at(-1);
  assert.equal(mail.to, 'dana@example.com'); assert.match(mail.subject, /Riley started a BRYC application/);
  assert.match(link, /^https:\/\/thebryc\.github\.io\/recruitment\/\?invite=[a-f0-9]{32}#portal$/);
  assert.notEqual(drafts()[0]['Invite Token'], token, 'only a hash is stored');
  assert.equal(riley('saveDraft', {answers: studentAnswers, fields: names}).ok, true, 'the student can still edit until it is opened');
  const resend = () => riley('inviteGuardian', {answers: studentAnswers, guardian: {'First Name': 'Dana', 'Last Name': 'Lane', Email: 'dana@example.com'}});
  for (let i = 0; i < 4; i++) assert.equal(resend().ok, true, 'resending works');
  assert.match(resend().error, /several times/, 'but only five sends in all');
});

test('the parent/guardian sees the invitation, and opening the link verifies their email', () => {
  const {token} = invited();
  const before = dana('load').state;
  assert.equal(before.role, null); assert.deepEqual([...before.invites], [], 'an unconfirmed email sees no invitations');
  assert.equal(as('uid-dana', 'dana@example.com', true)('load').state.invites[0].firstName, 'Riley', 'a confirmed one does');
  assert.match(dana('acceptInvite', {token}).error, /household information first/);
  dana('saveHousehold', {fields: household});

  const someoneElse = as('uid-sam', 'sam@example.com');
  someoneElse('saveHousehold', {fields: Object.assign({}, household, {'Guardian Email': 'sam@example.com'})});
  assert.match(someoneElse('acceptInvite', {token}).error, /sent to d\*\*\*@example\.com/);
  assert.match(dana('acceptInvite', {studentKey: drafts()[0]['Student Key']}).error, /open the link/, 'no link and no confirmed email');

  const out = dana('acceptInvite', {token});
  assert.equal(out.ok, true, out.error);
  assert.equal(out.state.account.verified, true, 'the link counts as email confirmation');
  const s = out.state.students[0];
  assert.equal(s.fromStudent, true); assert.equal(s.answers.comfort, studentAnswers.comfort);
  assert.deepEqual({...s.savedUploads}, {'Academic Record': 'report-card.pdf'});
  assert.deepEqual(out.state.invites, []);
  assert.equal(dana('acceptInvite', {token}).ok, true, 'opening the link again is fine');

  assert.equal(riley('load').state.application.status, 'guardian');
  assert.match(riley('saveDraft', {answers: studentAnswers, fields: names}).error, /parent\/guardian is finishing/);
});

test('a parent/guardian with a confirmed email can open it from the portal without the link', () => {
  invited();
  const confirmed = as('uid-dana', 'dana@example.com', true);
  confirmed('saveHousehold', {fields: household});
  assert.equal(confirmed('acceptInvite', {studentKey: drafts()[0]['Student Key']}).ok, true);
});

test('the parent/guardian can edit the application except the student-owned answers', () => {
  const {token} = invited();
  dana('saveHousehold', {fields: household});
  const {studentKey} = dana('acceptInvite', {token});
  dana('saveDraft', {studentKey, answers: Object.assign({}, studentAnswers, {studentFirst: 'Riley J.', comfort: 'Rewritten', studentSignature: 'Dana'}), fields: names});
  const saved = JSON.parse(drafts()[0].Draft);
  assert.equal(saved.studentFirst, 'Riley J.', 'other answers can change');
  assert.equal(saved.comfort, studentAnswers.comfort); assert.equal(saved.studentSignature, 'Riley Lane');
});

test('only the parent/guardian submits, with the student\'s answers and documents', () => {
  const {token} = invited();
  assert.match(riley('submitApplication', {studentKey: drafts()[0]['Student Key'], fields: guardianFields}).error, /parent\/guardian needs to finish and submit/);
  dana('saveHousehold', {fields: household});
  const {studentKey} = dana('acceptInvite', {token});
  const before = mails.length;
  const out = dana('submitApplication', {studentKey, fields: guardianFields, files: []});
  assert.equal(out.ok, true, out.error);
  assert.equal(appRow('Short Response #1'), studentAnswers.comfort);
  assert.equal(appRow('Student Signature'), 'Riley Lane');
  assert.equal(appRow('Student Certification'), 'Yes');
  assert.equal(appRow('Academic Record'), 'https://drive/Lane - Riley - Academic Record - report-card.pdf');
  assert.equal(appRow('Guardian Signature'), 'Dana Lane');
  const sent = mails.slice(before).map(m => m.to);
  assert.ok(sent.some(t => t.includes('dana@example.com')), 'the family confirmation');
  assert.ok(sent.includes('riley@student.org'), 'and one to the student');
  assert.equal(riley('load').state.application.status, 'submitted');
});

test('a family-started application works as before', () => {
  const casey = as('uid-casey', 'casey@example.com');
  casey('saveHousehold', {fields: Object.assign({}, household, {'Guardian Email': 'casey@example.com'})});
  const {studentKey} = casey('saveDraft', {answers: {studentFirst: 'Jordan', comfort: 'Mine'}, fields: {'Student First Name': 'Jordan'}});
  casey('saveDraft', {studentKey, answers: {studentFirst: 'Jordan', comfort: 'Edited'}, fields: {'Student First Name': 'Jordan'}});
  assert.equal(JSON.parse(drafts()[0].Draft).comfort, 'Edited');
  assert.equal(drafts()[0]['Started By'], 'Parent/guardian');
  assert.equal(casey('load').state.role, 'family');
});

test('unsubmitted applications are deleted after July 31 of their school year, once a day', () => {
  const casey = as('uid-casey', 'casey@example.com');
  casey('saveHousehold', {fields: Object.assign({}, household, {'Guardian Email': 'casey@example.com'})});
  const year = y => casey('saveDraft', {answers: {}, fields: {'Student First Name': 'Kid ' + y, 'Program Year': y}}).studentKey;
  const old = year('2026-2027'), current = year('2027-2028'), done = year('2026-2027');
  vm.runInContext(`(() => { const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PORTAL_DRAFTS');
    const r = findRow(s, 'Student Key', '${done}'); writeRow(s, r.row, {'Submitted At': new Date()});
    const o = findRow(s, 'Student Key', '${old}'); writeRow(s, o.row, {'Saved Uploads': JSON.stringify({'Academic Record': {name: 'a.pdf', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view'}})}); })()`, ctx);
  const clean = () => vm.runInContext('cleanUpOldDrafts(SpreadsheetApp.getActiveSpreadsheet())', ctx);

  vm.runInContext("PORTAL.clock = '2027-07-31T22:00:00-05:00'", ctx);
  assert.equal(clean(), 0, 'kept through July 31');
  vm.runInContext("PORTAL.clock = '2027-08-01T08:00:00-05:00'", ctx);
  assert.equal(clean(), 1);
  assert.deepEqual(drafts().map(d => d['Student Key']).sort(), [current, done].sort(), 'submitted and next-year drafts stay');
  assert.deepEqual(trashed, ['1AbCdEfGhIjKlMnOpQrStUvWxYz'], 'documents a student sent are trashed too');
  assert.equal(props.DRAFTS_CLEANED_ON, '2027-08-01');
  assert.equal(clean(), 0, 'only once a day');
});
