// Browser test for the family portal. See tests/e2e/README.md.
const {chromium} = require('playwright');
const fs = require('fs');
const D = __dirname, BASE = process.env.BASE || 'http://localhost:8766/';
const admin = async a => (await fetch('http://localhost:8791/admin', {method: 'POST', body: JSON.stringify(a || {})})).json();
const fakes = {'firebase-app.js': 'fake-app.js', 'firebase-auth.js': 'fake-auth.js', 'firebase-firestore.js': 'fake-firestore.js'};
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route(/gstatic\.com\/firebasejs\/.*\/(firebase-[a-z]+\.js)/, r => { const f = r.request().url().match(/(firebase-[a-z]+\.js)/)[1];
    r.fulfill({contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin': '*'}, body: fs.readFileSync(D + '/' + fakes[f])}); });
  await ctx.route(/portal-config\.js/, r => r.fulfill({contentType: 'text/javascript', body: "window.BRYC_PORTAL={submitUrl:'http://localhost:8791/exec',openProgramYears:['2026-2027','2027-2028']};"}));
  await ctx.route(/typekit|use\.typekit|googletagmanager|thebryc\.org/, r => r.abort());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const active = () => page.evaluate(() => document.querySelector('.view.active')?.id);
  const shot = n => page.screenshot({path: `${process.env.SHOTS || D}/${n}.png`, fullPage: true});

  // 1. Signed out: Apply goes to the account page.
  await page.goto(BASE + '#apply'); await page.waitForTimeout(800);
  ok(await active() === 'account', 'signed-out #apply lands on account page: ' + await active());
  await shot('01-account');
  // Signup validation
  await page.click('#signup-form button[type=submit]');
  ok((await page.textContent('#account-message')).includes('highlighted'), 'signup validation');
  await page.fill('#signup-form [name=email]', 'casey@example.com');
  await page.fill('#signup-form [name=password]', 'password1');
  await page.fill('#signup-form [name=confirm]', 'password2');
  await page.click('#signup-form button[type=submit]');
  ok((await page.textContent('#account-message')).includes("don't match"), 'password mismatch caught');
  await page.fill('#signup-form [name=confirm]', 'password1');
  await page.click('#signup-form button[type=submit]');
  await page.waitForSelector('#portal-body:not([hidden])');
  ok(await active() === 'portal', 'after signup: portal');
  ok(await page.isVisible('#portal-verify'), 'verify banner visible');
  ok(await page.isVisible('#household-form'), 'household form shown first');
  ok(await page.inputValue('#household-form [name=hhAccountHolder]') === 'Parent or guardian', 'account holder is the parent or guardian');
  ok(!(await page.$('#signup-form [name=accountHolder]')), 'sign-up no longer asks student or parent');
  ok(await page.inputValue('[name=hhEmail]') === 'casey@example.com', 'guardian email prefilled');
  ok((await page.textContent('#portal-flash')).includes('household'), 'flash asks for household');
  await shot('02-portal-new');

  // 2. Household
  await page.fill('[name=hhGuardianFirst]', 'Casey'); await page.fill('[name=hhGuardianLast]', 'Sample');
  await page.selectOption('[name=hhRelationship]', 'Other'); await page.fill('[name=hhRelationshipOther]', 'Godmother');
  await page.fill('[name=hhPhone]', '(225) 555-0123'); await page.fill('[name=hhStreet]', '123 Main St');
  await page.fill('[name=hhCity]', 'Baton Rouge'); await page.selectOption('[name=hhState]', 'LA'); await page.fill('[name=hhZip]', '70802');
  // Second guardian with a different address
  ok(await page.isVisible('#hh-add-g2') && !(await page.isVisible('#hh-g2')), 'second guardian starts closed behind a button');
  await page.click('#hh-add-g2');
  ok(await page.isVisible('#hh-g2') && !(await page.isVisible('#hh-g2-address')), 'second guardian fields open, address waits for the question');
  await page.click('#household-form button[type=submit]');
  ok((await page.textContent('#household-message')).includes('highlighted'), 'second guardian fields required once added');
  await page.fill('[name=hhG2First]', 'Morgan'); await page.fill('[name=hhG2Last]', 'Sample');
  await page.selectOption('[name=hhG2Relationship]', 'Father'); await page.fill('[name=hhG2Phone]', '(225) 555-0456');
  await page.check('input[name=hhG2Different][value=yes]');
  ok(await page.isVisible('#hh-g2-address'), 'different address reveals address fields');
  await page.fill('[name=hhG2Street]', '9 Oak St'); await page.fill('[name=hhG2City]', 'Zachary');
  await page.selectOption('[name=hhG2State]', 'LA'); await page.fill('[name=hhG2Zip]', '70791');
  await page.screenshot({path: `${process.env.SHOTS || D}/02b-household-g2.png`, fullPage: true});
  await page.click('#household-form button[type=submit]');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'apply', null, {timeout: 5000}).catch(() => {});
  ok(await active() === 'apply', 'after first household save, the application opens (they asked to apply)');
  ok(await page.inputValue('#application-demo [name=guardianFirst]') === 'Casey', 'application guardian prefilled');
  ok(await page.inputValue('#application-demo [name=homeZip]') === '70802', 'address prefilled');
  ok(await page.inputValue('#application-demo [name=guardianRelationshipOther]') === 'Godmother', 'relationship other prefilled');
  ok(await page.isChecked('#application-demo input[name=secondGuardian][value=yes]') && await page.inputValue('#application-demo [name=g2First]') === 'Morgan'
    && await page.isChecked('#application-demo input[name=g2Different][value=yes]') && await page.inputValue('#application-demo [name=g2Zip]') === '70791', 'second guardian prefilled on the application');
  ok(await page.evaluate(() => !document.querySelector('#g2-fields').hidden && !document.querySelector('#g2-address').hidden), 'second guardian sections open on the application');
  ok(await page.evaluate(() => [...document.querySelector('[name=academicYear]').options].filter(o => o.value).map(o => o.value).join()) === '2027-2028', 'only the open year is offered (March 1, 2027)');
  ok(await page.inputValue('#application-demo [name=academicYear]') === '2027-2028', 'the one open year is picked for them');
  let s = await admin(); ok(s.sheets.HOUSEHOLDS[1][0] === 'HH-0001' && s.sheets.HOUSEHOLDS[1][6] === 'Other: Godmother', 'household row saved: ' + s.sheets.HOUSEHOLDS[1].slice(0, 7));

  // 3. Fill the application and autosave
  await page.evaluate(() => {
    const a = BRYCApp.serialize();
    Object.assign(a, {academicYear: '2027-2028', studentFirst: 'Jordan', studentLast: 'Sample', studentEmail: 'jordan@example.com', studentPhone: '2255550199', currentGrade: '8', futureGrade: '9', futureSchool: 'Thrive Academy',
      studentGender: 'Female', heardAbout: 'letter', selfReportedGrades: 'Math A', growth: 'Essay one', comfort: 'Essay two', support: 'Essay three', studentCertification: 'yes', studentSignature: 'Jordan Sample',
      homeLanguage: 'English', householdIncome: '$30,001–$48,000', guardianSignature: 'Casey Sample', householdMembers: '3',
      source: [...BRYCApp.form.elements.source.options].find(o => o.value).value, policyAck: [BRYCApp.form.elements.policyAck.value]});
    BRYCApp.restore(a);
    BRYCApp.form.elements.studentFirst.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Saved', null, {timeout: 6000}).catch(() => {});
  ok(await page.textContent('#draft-status') === 'Saved', 'autosave pill: ' + await page.textContent('#draft-status'));
  s = await admin(); ok(s.sheets.PORTAL_DRAFTS.length === 2 && s.sheets.PORTAL_DRAFTS[1][2] === 'Jordan', 'one draft row for Jordan');
  // Draft survives a reload
  await page.reload(); await page.waitForTimeout(1200);
  ok(await active() === 'apply', 'reload on #apply reopens the single draft: ' + await active());
  ok(await page.inputValue('#application-demo [name=studentFirst]') === 'Jordan' && await page.inputValue('#application-demo [name=growth]') === 'Essay one', 'draft restored after reload');
  ok((await page.textContent('#draft-for')).includes('Jordan'), 'draft head names the student');
  await shot('03-apply-draft');
  // Step through the wizard
  for (let i = 0; i < 4; i++) {
    if (i === 1) await page.setInputFiles('#application-demo input[type=file][name=gradeReport]', D + '/card.pdf');
    if (i === 3) await (await page.$('.second-guardian')).screenshot({path: `${process.env.SHOTS || D}/03b-app-g2.png`});
    await page.click('#wizard-next'); await page.waitForTimeout(150);
  }
  ok((await page.textContent('#wizard-count')).includes('Review'), 'reached review: ' + await page.textContent('#wizard-count'));
  await page.click('#wizard-next'); await page.waitForTimeout(800);
  ok((await page.textContent('#wizard-notice')).includes('confirm your email'), 'unverified submit blocked: ' + await page.textContent('#wizard-notice'));
  await page.evaluate(() => window.__fakeVerify('casey@example.com'));
  await page.click('#wizard-next');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok(await active() === 'portal', 'after submit: portal');
  ok((await page.textContent('#portal-flash')).includes("Jordan's application was submitted"), 'submit flash');
  ok(!(await page.isVisible('#portal-verify')), 'verify banner gone');
  ok((await page.textContent('#student-list')).includes('Application received'), 'card says received');
  s = await admin(); const apps = s.sheets.APPLICATIONS_RAW;
  ok(apps.length === 2, 'application row written');
  const H = apps[0], row = apps[1], col = h => row[H.indexOf(h)];
  ok(col('Program Year') === '2027-2028' && col('Guardian Relationship') === 'Other: Godmother' && col('Household ID') === 'HH-0001' && /^S-/.test(col('Student Key')), 'application columns: ' + [col('Program Year'), col('Guardian Relationship'), col('Household Income Range')]);
  ok(String(col('Academic Record')).includes('drive'), 'upload saved: ' + col('Academic Record'));
  ok(col('Second Guardian') === 'Yes' && col('Guardian 2 First Name') === 'Morgan' && col('Guardian 2 Different Address') === 'Yes' && col('Guardian 2 City') === 'Zachary', 'second guardian on the application row');
  ok(s.mails.some(m => /received Jordan/.test(m.subject)), 'received email sent');
  await shot('04-portal-received');

  // 4. Process, release an admission with income verification
  await admin({op: 'process'});
  await admin({op: 'set', row: 2, header: 'Decision', value: 'Admitted'});
  await admin({op: 'set', row: 2, header: 'Income Verification Required', value: 'Yes'});
  await admin({op: 'set', row: 2, header: 'Decision Released', value: true});
  s = await admin({op: 'process'});
  ok(s.mails.some(m => /decision is ready/i.test(m.subject)), 'decision email sent');
  await page.reload(); await page.waitForTimeout(1500);
  const M = s.sheets.MASTER, mcol = h => M[1][M[0].indexOf(h)];
  ok(mcol('Guardian 2 Name') === 'Morgan Sample' && /Zachary/.test(mcol('Guardian 2 Address')), 'MASTER second guardian: ' + mcol('Guardian 2 Name') + ' / ' + mcol('Guardian 2 Address'));
  ok((await page.textContent('#household-summary')).includes('Morgan Sample (Father)'), 'summary shows second guardian');
  const list = await page.textContent('#student-list');
  ok(list.includes('Congratulations! Jordan has been admitted'), 'admitted message');
  ok(list.includes('Opens soon') && !/income/i.test(list), 'student card: onboarding and transportation only, no income');
  const incomeBox = await page.textContent('#income-card');
  ok(await page.isVisible('#income-card') && incomeBox.includes('For parents/guardians') && incomeBox.includes('This covers Jordan') && incomeBox.includes('Start'),
    'income verification has its own box for parents/guardians: ' + incomeBox.replace(/\s+/g, ' '));
  await shot('05-portal-admitted');

  // 5. Income verification
  await page.click('#income-card button');
  ok(await active() === 'task', 'task view open');
  ok(await page.isVisible('.task-form[data-task=income]') && !(await page.isVisible('.task-form[data-task=onboarding]')), 'income form shown alone');
  const incSum = (await page.textContent('.inc-form .confirm-summary')).replace(/\s+/g, ' ');
  ok(incSum.includes('Casey Sample') && !(await page.isVisible('[name=incGuardianFirst]')), 'income guardian confirmed as a summary: ' + incSum);
  ok(!(await page.isVisible('#inc-upload')) && !(await page.$$eval('[name=incDocType] option', o => o.map(x => x.textContent).join())).includes('THRIVE'), 'upload waits for a document type; no THRIVE option');
  ok(!(await page.textContent('.inc-form')).includes('$'), 'no fee shown to families');
  await page.click('#task-submit');
  ok((await page.textContent('#task-message')).includes('highlighted'), 'income validation');
  await page.selectOption('[name=incDocType]', 'IRS Form 1040 (preferred)');
  ok((await page.textContent('#inc-help')).includes('line 11'), '1040 instructions');
  await page.check('[name=incSeparate]'); ok(await page.isVisible('#inc-doc2'), 'second document revealed');
  await page.setInputFiles('[name=incDoc1]', D + '/card.pdf');
  await page.click('#task-submit');
  ok((await page.textContent('#task-message')).includes('highlighted'), 'second 1040 required when filed separately');
  await page.setInputFiles('[name=incDoc2]', D + '/card.pdf');
  await shot('06-income');
  await page.click('#task-submit');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok((await page.textContent('#portal-flash')).includes('household income verification'), 'income flash');
  ok((await page.textContent('#income-card')).includes('Done') && (await page.textContent('#income-card')).includes('We received it'), 'income box shows done');
  s = await admin(); ok(s.sheets.INCOME_RAW.length === 2 && s.files.some(f => f.folder === 'income-folder'), 'income row + file in income folder');

  // 6. Onboarding: six steps, prefilled from the application, confirm and answer only what's new
  await admin({op: 'enable', task: 'onboarding'});
  await admin({op: 'school', row: ['Thrive Academy', 'Thrive Academy', 'East Baton Rouge', '', 'Yes']});
  await page.reload(); await page.waitForTimeout(1500);
  await page.click('#student-list .task-list li:first-child button');
  ok(await page.isVisible('.task-form[data-task=onboarding]') && !(await page.isVisible('#task-submit')), 'onboarding wizard, no shared submit button');
  ok((await page.textContent('#ob-count')) === 'Step 1 of 6 · Accept', 'starts on step 1: ' + await page.textContent('#ob-count'));
  await page.click('#ob-next');
  ok((await page.textContent('#ob-notice')).includes('highlighted'), 'must answer accept first');
  await page.check('input[name=obAccept][value=no]');
  ok(await page.isVisible('#ob-decline') && (await page.textContent('#ob-next')) === 'Submit our response', 'decline shows reason and submit');
  await page.check('input[name=obAccept][value=yes]');
  ok(!(await page.isVisible('#ob-decline')) && (await page.textContent('#ob-next')) === 'Continue →', 'accept continues');
  await shot('06a-onboarding-step1');
  await page.click('#ob-next');
  const step = async () => page.textContent('#ob-count');
  const sum = async sel => (await page.textContent(sel + ' .confirm-summary')).replace(/\s+/g, ' ');
  const stepCard = n => `.ob-wizard .wizard-step.active [data-confirm]:nth-of-type(${n})`;
  ok((await step()).includes('2 of 6 · Student'), 'step 2: ' + await step());
  ok(!(await page.isVisible('[name=obFirst]')) && (await sum(stepCard(1))).includes('Jordan Sample'), 'student confirmed as a summary: ' + await sum(stepCard(1)));
  ok(!(await page.$$eval('[name=obShirt] option', o => o.map(x => x.textContent).join())).includes('Youth'), 'adult shirt sizes only');
  // Correct the student phone through Edit
  await page.click(stepCard(1) + ' .confirm-toggle');
  await page.fill('[name=obStudentPhone]', '(225) 555-0777');
  await page.click(stepCard(1) + ' .confirm-toggle');
  ok((await sum(stepCard(1))).includes('(225) 555-0777'), 'summary shows the correction');
  await page.click('#ob-next');
  ok((await step()).includes('2 of 6'), 'cannot continue with new questions blank');
  await page.fill('[name=obBirthday]', '2012-05-01'); await page.selectOption('[name=obShirt]', 'Adult M');
  await page.selectOption('[name=obRace]', 'Multi-Racial / Other Race'); await page.fill('[name=obRaceOther]', 'Black and Filipino');
  await shot('06b-onboarding-student');
  await page.click('#ob-next');
  ok((await step()).includes('3 of 6 · Home and school'), 'step 3: ' + await step());
  ok(await page.isVisible('[name=obParish]') && await page.inputValue('[name=obStreet]') === '123 Main St', 'address opens because parish is missing');
  const school = await sum('.ob-wizard .wizard-step.active [data-confirm]:nth-of-type(2)');
  ok(school.includes('Grade in 2027–2028') && school.includes('9th grade'), 'grade names the program year: ' + school);
  ok(school.includes('Thrive Academy') && school.includes('East Baton Rouge') && !(await page.isVisible('[name=obDistrict]')), 'district and parish filled from SCHOOLS: ' + school);
  await page.fill('[name=obParish]', 'East Baton Rouge');
  await page.check('input[name=obPlatforms][value=yes]');
  await shot('06c-onboarding-home-school');
  await page.click('#ob-next');
  ok((await step()).includes('4 of 6 · Family'), 'step 4: ' + await step());
  const parents = await sum(stepCard(1));
  ok(parents.includes('Casey Sample') && parents.includes('Godmother') && parents.includes('Morgan Sample') && parents.includes('9 Oak St, Zachary, Louisiana 70791'), 'parents summary: ' + parents);
  ok((await sum(stepCard(2))).includes('$30,001–$48,000'), 'household summary');
  await page.selectOption('[name=obG2Comms]', 'Yes'); await page.selectOption('[name=obGov]', 'No'); await page.check('input[name=obAlum][value=no]');
  await page.click('#ob-next');
  ok((await step()).includes('5 of 6 · Health'), 'step 5');
  await page.selectOption('[name=obInjury]', {index: 1}); await page.selectOption('[name=obNeuro]', 'No');
  await page.click('#ob-next');
  ok((await step()).includes('6 of 6 · Sign') && (await page.textContent('#ob-next')) === 'Submit', 'last step says Submit');
  await page.click('#ob-back'); ok((await step()).includes('5 of 6'), 'back works'); await page.click('#ob-next');
  await page.check('[name=obPolicies]'); await page.check('input[name=obCounseling][value=yes]'); await page.check('input[name=obMedia][value=yes]');
  await page.fill('[name=obSignature]', 'Casey Sample'); await page.check('[name=obConfirm]');
  ok((await page.textContent('[data-required-radio=obCounseling] legend')).startsWith('BRYC offers counseling services'), 'counseling question has context');
  await shot('06d-onboarding-sign');
  await page.click('#ob-next');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok((await page.textContent('#portal-flash')).includes('confirmation email'), 'onboarding flash: ' + await page.textContent('#portal-flash'));
  s = await admin(); const OB = s.sheets.ONBOARDING_RAW, ob = h => OB[1][OB[0].indexOf(h)];
  ok(OB.length === 2 && ob('Student First Name') === 'Jordan' && ob('Guardian Relationship') === 'Other: Godmother' && ob('Second Guardian City') === 'Zachary'
    && ob('Household Income Range') === '$30,001–$48,000' && ob('Student Race / Ethnicity') === 'Multi-Racial / Other Race' && ob('T-Shirt Size') === 'Adult M',
    'onboarding row carries every step: ' + [ob('Student First Name'), ob('Guardian Relationship'), ob('Second Guardian City'), ob('T-Shirt Size')]);
  ok(ob('School District') === 'Thrive Academy' && ob('School Parish') === 'East Baton Rouge', 'district and parish saved: ' + [ob('School District'), ob('School Parish')]);
  ok(ob('Changed From Application') === 'Student Phone; Parish', 'changes flagged for staff: ' + ob('Changed From Application'));
  ok(s.mails.some(m => m.subject === "We received Jordan's onboarding form"), 'confirmation email sent right away');
  let card = await page.textContent('#student-list');
  ok(card.includes('Jordan is now a BRYC Fellow. Please complete any additional forms below.') && card.includes('BRYC Fellow') && !card.includes('Congratulations'),
    'after onboarding: Jordan is a BRYC Fellow, with transportation still to do');
  await shot('06d-fellow');

  // 6b. Transportation: opens after onboarding, starts from the onboarding answers
  const trButton = '#student-list .task-list li:nth-child(2) button';
  await page.click(trButton);
  ok(await page.isVisible('.task-form[data-task=transportation]'), 'transportation form');
  const trSum = (await page.textContent('.tr-form .confirm-summary')).replace(/\s+/g, ' ');
  ok(trSum.includes('Jordan Sample') && trSum.includes('Thrive Academy') && trSum.includes('Casey Sample') && !(await page.isVisible('[name=trFirst]')), 'transportation prefilled: ' + trSum);
  await page.check('input[name=trRide][value=yes]');
  ok((await page.textContent('#tr-route')).includes('BRYC runs a route from Thrive Academy'), 'route note: ' + await page.textContent('#tr-route'));
  ok((await page.textContent('#tr-period')) === 'August 1, 2027 – July 31, 2028', 'authorization dates for the program year');
  await page.click('#task-submit');
  ok((await page.textContent('#task-message')).includes('highlighted'), 'waiver and signature required');
  await page.check('[name=trAgree]'); await page.fill('[name=trSignature]', 'Casey Sample');
  await shot('06e-transportation');
  await page.click('#task-submit');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  s = await admin(); const TR = s.sheets.TRANSPORTATION_RAW, tr = h => TR[1][TR[0].indexOf(h)];
  ok(TR.length === 2 && tr('Needs BRYC Transportation') === 'Yes' && tr('School Has Route') === 'Yes' && tr('Student First Name') === 'Jordan', 'transportation row: ' + [tr('Needs BRYC Transportation'), tr('School Has Route')]);
  ok(s.mails.some(m => m.subject === "We received Jordan's transportation form"), 'transportation confirmation sent');
  card = await page.textContent('#student-list');
  ok(card.includes('Jordan is now a BRYC Fellow.') && !card.includes('Please complete any additional forms'), 'all forms done: no request for more forms');

  // 7. Add a second student, then sign out
  await page.click('#add-student');
  ok(await active() === 'apply' && await page.inputValue('#application-demo [name=studentFirst]') === '' && await page.inputValue('#application-demo [name=guardianFirst]') === 'Casey', 'add student: blank student, prefilled guardian');
  await page.click('[data-view=portal]').catch(() => {}); await page.evaluate(() => BRYCView('portal'));
  await page.click('#portal-signout'); await page.waitForTimeout(400);
  ok(await active() === 'home', 'signed out to home');
  await page.evaluate(() => BRYCView('portal')); ok(await active() === 'account', 'portal needs sign-in again');
  await page.click('#account .tab[data-tab=signin]');
  await page.fill('#signin-form [name=email]', 'casey@example.com'); await page.fill('#signin-form [name=password]', 'nope');
  await page.click('#signin-form button[type=submit]'); await page.waitForTimeout(300);
  ok((await page.textContent('#account-message')).includes("don't match"), 'bad password message');
  await page.fill('#signin-form [name=password]', 'password1'); await page.click('#signin-form button[type=submit]');
  await page.waitForSelector('#portal-body:not([hidden])'); ok(await active() === 'portal', 'sign in returns to portal');
  ok((await page.textContent('#nav-portal')) === 'My portal', 'nav says My portal');

  // Application calendar: closed between cycles, and closed to rising seniors after April 30
  await admin({op: 'clock', value: '2027-01-25T12:00:00-06:00'});
  await page.reload(); await page.waitForSelector('#portal-body:not([hidden])');
  await page.click('#add-student'); await page.waitForTimeout(300);
  ok(await page.isVisible('#apply-closed') && !(await page.isVisible('#apply .wizard-wrap')), 'between cycles: the Apply page says applications are closed');
  ok((await page.textContent('#apply-closed')).includes('Applications for the 2027–2028 school year open February 1, 2027.'), 'closed message names the next opening date');
  await shot('09-applications-closed');
  await admin({op: 'clock', value: '2027-05-10T12:00:00-06:00'});
  await page.goto(BASE + '#portal'); await page.reload(); await page.waitForSelector('#portal-body:not([hidden])');
  await page.click('#add-student'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#apply-closed')) && await page.isVisible('#apply .wizard-wrap'), 'open again for 2027-2028');
  const twelve = await page.$eval('[name=futureGrade] option[value="12"]', o => ({disabled: o.disabled, text: o.textContent}));
  ok(twelve.disabled && twelve.text.includes('closed April 30, 2027'), 'after April 30: 12th grade is unavailable: ' + twelve.text);
  await admin({op: 'clock', value: '2027-03-01T12:00:00-06:00'});
  await page.goto(BASE + '#portal'); await page.reload(); await page.waitForSelector('#portal-body:not([hidden])');

  // Mobile screenshot
  await page.setViewportSize({width: 390, height: 844}); await page.waitForTimeout(300); await shot('07-portal-mobile');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll on mobile');

  // Header sign out, without opening the portal
  await page.setViewportSize({width: 1280, height: 900}); await page.evaluate(() => BRYCView('home'));
  ok(await page.isVisible('#nav-signout'), 'header sign out shown while signed in');
  await page.screenshot({path: `${process.env.SHOTS || D}/08-header-signed-in.png`, clip: {x: 0, y: 0, width: 1280, height: 80}});
  await page.click('#nav-signout'); await page.waitForTimeout(400);
  ok(await active() === 'home' && !(await page.isVisible('#nav-signout')) && (await page.textContent('#nav-portal')) === 'Sign in', 'header sign out signs out and hides itself');
  await page.reload(); await page.waitForTimeout(800);
  ok(!(await page.isVisible('#nav-signout')), 'still signed out after reload');
  // Get more info: its own page, no account, guardian details optional.
  await page.goto(BASE); await page.waitForTimeout(800);
  ok(!(await page.$('#home #inquiry-form')), 'the interest form is no longer on the home page');
  await page.click('.hero-wrap [data-view=inquire]');
  ok(await active() === 'inquire', 'hero "Get more info" opens the interest page');
  ok(!(await page.$('#inquiry-form [name=submitterRole]')), 'no "I am a student / parent" question');
  await page.fill('#inquiry-form [name=studentFirst]', 'Riley'); await page.fill('#inquiry-form [name=studentLast]', 'Young');
  await page.fill('#inquiry-form .school-search', 'Thrive'); await page.click('#inquiry-form .school-suggestions li:first-child');
  await page.selectOption('#inquiry-form [name=studentGrade]', '7th'); await page.selectOption('#inquiry-form [name=heardAbout]', 'visit');
  await page.click('#inquiry-form button[type=submit]');
  ok((await page.textContent('#inquiry-form')).includes('Add at least one phone number or email'), 'needs one phone or email');
  await page.fill('#inquiry-form [name=guardianEmail]', 'young.family@example.com');
  ok(!(await page.textContent('#inquiry-form')).includes('Add at least one phone number or email'), 'contact error clears once filled in');
  await page.screenshot({path: `${process.env.SHOTS || D}/00-get-more-info.png`, fullPage: true});
  await page.click('#inquiry-form button[type=submit]'); await page.waitForTimeout(800);
  const done = await page.textContent('#inquire .form-done');
  ok(done.includes('look for information about BRYC') && done.includes('Start an application'), 'thank-you mentions the email and offers to apply');
  let inq = await admin({op: 'process'});
  const IQ = inq.sheets.INQUIRIES_RAW, iq = h => IQ[1][IQ[0].indexOf(h)];
  ok(IQ.length === 2 && iq('Student First Name') === 'Riley' && iq('Guardian Email') === 'young.family@example.com' && !iq('Guardian Phone'), 'interest row saved without guardian phone');
  ok(inq.mails.some(m => m.subject === 'Thanks for your interest in BRYC' && m.to === 'young.family@example.com'), 'thank-you email sent to the family');
  await page.goto(BASE + '#connect'); await page.waitForTimeout(600);
  ok(await active() === 'inquire', 'old #connect links open the interest page');

  // Ignore noise from the test stand-ins (blocked fonts, the stub Firestore module, the optional hero photo).
  const real = errors.filter(e => !/ERR_FAILED|404|firebase-firestore/.test(e));
  ok(!real.length, 'no page errors: ' + real.join(' | '));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
