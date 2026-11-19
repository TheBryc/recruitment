// Browser test for student-started applications: a student signs up, fills in their
// part, and sends it to a parent/guardian, who opens the emailed link, signs up,
// finishes with the student's own answers locked, and submits. See tests/e2e/README.md.
const {chromium} = require('playwright');
const fs = require('fs');
const D = __dirname, BASE = process.env.BASE || 'http://localhost:8766/';
const admin = async a => (await fetch('http://localhost:8791/admin', {method: 'POST', body: JSON.stringify(a || {})})).json();
const fakes = {'firebase-app.js': 'fake-app.js', 'firebase-auth.js': 'fake-auth.js', 'firebase-firestore.js': 'fake-firestore.js'};
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SHOTS = process.env.SHOTS || D;

async function newPage(browser, errors, size = {width: 1280, height: 900}) {
  const ctx = await browser.newContext({viewport: size});
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/(firebase-[a-z]+\.js)/, r => { const f = r.request().url().match(/(firebase-[a-z]+\.js)/)[1];
    r.fulfill({contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin': '*'}, body: fs.readFileSync(D + '/' + fakes[f])}); });
  await ctx.route(/portal-config\.js/, r => r.fulfill({contentType: 'text/javascript', body: "window.BRYC_PORTAL={submitUrl:'http://localhost:8791/exec'};"}));
  await ctx.route(/typekit|use\.typekit|googletagmanager|thebryc\.org/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}

async function signUp(page, role, email) {
  if (await page.isHidden('#signup-form')) await page.click('#account [data-tab=signup]');
  await page.check(`#signup-form [name=role][value=${role}]`);
  await page.fill('#signup-form [name=email]', email);
  await page.fill('#signup-form [name=password]', 'password1');
  await page.fill('#signup-form [name=confirm]', 'password1');
  await page.click('#signup-form button[type=submit]');
  await page.waitForSelector('#portal-body:not([hidden])');
}

(async () => {
  const browser = await chromium.launch(); const errors = [];
  const active = p => p.evaluate(() => document.querySelector('.view.active')?.id);
  const essay = 'I joined the debate team even though I was nervous.';

  // 1. A student signs up and sees their own home, not a household.
  const st = await newPage(browser, errors);
  await st.goto(BASE + '#account'); await st.waitForTimeout(600);
  await st.click('#account [data-tab=signup]');
  await st.check('#signup-form [name=role][value=student]');
  ok(await st.isVisible('[data-role-note="student"]'), 'student note shows at sign-up');
  await signUp(st, 'student', 'riley@student.org');
  ok(await st.isVisible('#student-home') && (await st.textContent('#student-home')).includes('Start your application'), 'student home: start your application');
  ok(!(await st.isVisible('#household-card')) && !(await st.isVisible('#add-student')) && !(await st.isVisible('#portal-verify')), 'no household, add student, or confirm-email banner for students');
  await st.screenshot({path: `${SHOTS}/s1-student-home.png`, fullPage: true});

  // 2. The student fills in their part.
  await st.click('#student-home .btn-primary');
  ok(await active(st) === 'apply' && (await st.textContent('#wizard-count')).startsWith('Step 1 of 4'), 'student application: 4 steps');
  await st.evaluate(e => {
    const a = BRYCApp.serialize();
    Object.assign(a, {academicYear: '2027-2028', studentFirst: 'Riley', studentLast: 'Lane', studentEmail: 'riley@student.org', studentPhone: '2255550142', currentGrade: '8', futureGrade: '9',
      futureSchool: 'Thrive Academy', studentGender: 'Female', comfort: e, growth: 'Time management.', support: 'A mentor.', studentCertification: 'yes',
      studentSignature: 'Riley Lane', source: [...BRYCApp.form.elements.source.options].find(o => o.value).value});
    BRYCApp.restore(a); BRYCApp.setMode('student');
    BRYCApp.form.elements.studentFirst.dispatchEvent(new Event('input', {bubbles: true}));
  }, essay);
  await st.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Saved', null, {timeout: 6000}).catch(() => {});
  let s = await admin(); let H = s.sheets.PORTAL_DRAFTS[0], row = s.sheets.PORTAL_DRAFTS.find(r => r[H.indexOf('Student First Name')] === 'Riley');
  ok(row && row[H.indexOf('Started By')] === 'Student' && !row[H.indexOf('Household ID')], 'student draft saved with no household');
  for (let i = 0; i < 3; i++) {
    if (i === 1) await st.setInputFiles('#application-demo input[type=file][name=gradeReport]', D + '/card.pdf');
    await st.click('#wizard-next'); await st.waitForTimeout(150);
    if (process.env.DEBUG) console.log('  ', await st.textContent('#wizard-count'), '|', await st.textContent('#wizard-notice'), '|', await st.evaluate(() => [...document.querySelectorAll('.field-error')].map(e => e.previousElementSibling?.name + ': ' + e.textContent).join('; ')));
  }
  ok((await st.textContent('#wizard-count')).includes('Step 4 of 4 · Parent/guardian'), 'step 4 is the parent/guardian handoff');
  ok(await st.isVisible('#student-handoff') && !(await st.isVisible('[name=guardianSignature]')) && !(await st.isVisible('[name=policyAck]')), 'only the handoff shows; the parent/guardian questions are hidden');
  ok(await st.textContent('#wizard-next') === 'Send to my parent/guardian', 'button: Send to my parent/guardian');
  await st.click('#wizard-next'); await st.waitForTimeout(150);
  ok((await st.textContent('#wizard-notice')).includes("parent/guardian's name and email"), 'handoff fields required');
  await st.fill('[name=inviteFirst]', 'Dana'); await st.fill('[name=inviteLast]', 'Lane'); await st.fill('[name=inviteEmail]', 'riley@student.org');
  await st.click('#wizard-next'); await st.waitForTimeout(150);
  ok((await st.textContent('#wizard-notice')).includes('own email address'), "can't use the student's own email");
  await st.fill('[name=inviteEmail]', 'dana@example.com');
  await st.screenshot({path: `${SHOTS}/s2-student-handoff.png`, fullPage: true});
  await st.click('#wizard-next');
  await st.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok(await active(st) === 'portal' && (await st.textContent('#portal-flash')).includes('We emailed Dana at dana@example.com'), 'sent: back to the portal with a confirmation');
  ok((await st.textContent('#student-home')).includes('Sent to Dana Lane') && (await st.textContent('#student-home')).includes('You can still make changes'), 'student home: sent, can still change');
  await st.screenshot({path: `${SHOTS}/s3-student-sent.png`, fullPage: true});
  s = await admin();
  const invite = s.mails.find(m => m.to === 'dana@example.com' && /Riley started a BRYC application/.test(m.subject));
  ok(!!invite, 'invitation emailed to the parent/guardian');
  const token = invite && invite.htmlBody.match(/invite=([a-f0-9]+)/)[1];
  ok(s.files.some(f => /Academic Record - card\.pdf/.test(f.name)), 'report card saved when sent');

  // 3. The parent/guardian opens the link, signs up, and saves their household.
  const gd = await newPage(browser, errors);
  await gd.goto(BASE + '?invite=' + token + '#portal'); await gd.waitForTimeout(800);
  ok(await active(gd) === 'account' && (await gd.textContent('#account-message')).includes('invitation was sent to'), 'invitation link: sign-up with a note');
  ok(await gd.isChecked('#signup-form [name=role][value=guardian]'), 'parent/guardian is picked for them');
  ok(!(await gd.evaluate(() => location.search.includes('invite'))), 'the link is removed from the address bar');
  await gd.screenshot({path: `${SHOTS}/s4-guardian-signup.png`, fullPage: true});
  await signUp(gd, 'guardian', 'dana@example.com');
  ok(!(await gd.isVisible('#invite-list')), "no invitation card before the email is proven (the link does that)");
  ok((await gd.textContent('#portal-flash')).includes('Add your household information'), 'asked for household first');
  ok(!(await gd.isVisible('#portal-verify')), 'no confirm-email banner: the link confirms it');
  await gd.fill('[name=hhGuardianFirst]', 'Dana'); await gd.fill('[name=hhGuardianLast]', 'Lane');
  await gd.selectOption('[name=hhRelationship]', 'Mother'); await gd.fill('[name=hhPhone]', '(225) 555-0199');
  await gd.fill('[name=hhStreet]', '5 Elm St'); await gd.fill('[name=hhCity]', 'Baton Rouge'); await gd.selectOption('[name=hhState]', 'LA'); await gd.fill('[name=hhZip]', '70806');
  await gd.click('#household-form button[type=submit]');
  await gd.waitForFunction(() => document.querySelector('.view.active')?.id === 'apply', null, {timeout: 8000}).catch(() => {});
  ok(await active(gd) === 'apply', "after saving the household, Riley's application opens");

  // 4. Finishing it: the student's answers are locked, everything else is editable.
  ok(await gd.inputValue('[name=studentFirst]') === 'Riley' && await gd.inputValue('[name=guardianFirst]') === 'Dana', 'student answers and household prefilled');
  await gd.click('#wizard-next'); await gd.waitForTimeout(150);
  ok((await gd.textContent('.saved-file')).includes('Attached: card.pdf'), 'the report card the student sent shows as attached');
  await gd.click('#wizard-next'); await gd.waitForTimeout(150);
  ok(await gd.isVisible('#locked-note'), 'locked note on Get to know you');
  await gd.fill('[name=comfort]', 'Changed', {force: true}).catch(() => {});
  await gd.click('[name=studentCertification][value=no]', {force: true}).catch(() => {});
  ok(await gd.inputValue('[name=comfort]') === essay && await gd.isChecked('[name=studentCertification][value=yes]'), "the student's answers can't be changed");
  await gd.screenshot({path: `${SHOTS}/s5-guardian-locked.png`, fullPage: true});
  await gd.click('#wizard-next'); await gd.waitForTimeout(150);
  await gd.evaluate(() => { const f = BRYCApp.form.elements;
    f.homeLanguage.value = 'English'; f.householdIncome.value = f.householdIncome.options[1].value; f.householdMembers.value = '3';
    f.policyAck.checked = true; f.guardianSignature.value = 'Dana Lane'; });
  await gd.click('#wizard-next'); await gd.waitForTimeout(150);
  ok((await gd.textContent('#wizard-count')).includes('Review'), 'parent/guardian reaches review: ' + await gd.textContent('#wizard-count'));
  await gd.click('#wizard-next');
  await gd.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok((await gd.textContent('#portal-flash')).includes("Riley's application was submitted"), 'submitted without a separate email confirmation: ' + await gd.textContent('#portal-flash'));
  s = await admin(); const apps = s.sheets.APPLICATIONS_RAW, AH = apps[0], app = apps.find(r => r[AH.indexOf('Student First Name')] === 'Riley');
  const col = h => app && app[AH.indexOf(h)];
  ok(col('Short Response #1') === essay && col('Student Signature') === 'Riley Lane' && col('Guardian Signature') === 'Dana Lane', 'RAM HQ has the student\'s answers and both signatures');
  ok(String(col('Academic Record')).includes('card.pdf'), 'the report card is on the application: ' + col('Academic Record'));
  ok(s.mails.some(m => m.to === 'riley@student.org' && /Your BRYC application was submitted/.test(m.subject)), 'the student is emailed too');
  await gd.screenshot({path: `${SHOTS}/s6-guardian-submitted.png`, fullPage: true});

  // 5. The student sees it was submitted.
  await st.reload(); await st.waitForTimeout(1200);
  ok((await st.textContent('#student-home')).includes('Application submitted'), 'student home: submitted');

  // 6. Phone layout for the student's home.
  const ph = await newPage(browser, errors, {width: 390, height: 844});
  await ph.goto(BASE + '#account'); await ph.waitForTimeout(600);
  await signUp(ph, 'student', 'sam@student.org');
  ok(!(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'phone: no sideways scroll');
  await ph.screenshot({path: `${SHOTS}/s7-student-phone.png`, fullPage: true});

  // Blocked fonts and the staff workspace's Firestore calls are expected under the fakes.
  const real = errors.filter(e => !/ERR_FAILED|404|firebase-firestore/.test(e));
  ok(!real.length, 'no page errors: ' + real.join(' | '));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
