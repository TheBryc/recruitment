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
  await page.check('#signup-form input[value="Parent or guardian"]');
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
  ok(await page.isChecked('#household-form input[value="Parent or guardian"]'), 'account holder prefilled');
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
  ok(await page.evaluate(() => [...document.querySelector('[name=academicYear]').options].filter(o => o.value).map(o => o.value).join()) === '2026-2027,2027-2028', 'both open years offered');
  ok(await page.inputValue('#application-demo [name=academicYear]') === '', 'no year picked for them when two are open');
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
  ok(list.includes('Opens soon') && list.includes('Start'), 'tasks: closed ones say opens soon, income has start');
  await shot('05-portal-admitted');

  // 5. Income verification
  await page.click('#student-list .task-list button');
  ok(await active() === 'task', 'task view open');
  ok(await page.isVisible('.task-form[data-task=income]') && !(await page.isVisible('.task-form[data-task=onboarding]')), 'income form shown alone');
  ok(await page.inputValue('[name=incGuardianFirst]') === 'Casey', 'income guardian prefilled');
  await page.click('#task-submit');
  ok((await page.textContent('#task-message')).includes('highlighted'), 'income validation');
  await page.check('[name=incSeparate]'); ok(await page.isVisible('#inc-doc2'), 'second document revealed');
  await page.selectOption('[name=incDocType]', {index: 1}); await page.setInputFiles('[name=incDoc1]', D + '/card.pdf');
  await shot('06-income');
  await page.click('#task-submit');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok((await page.textContent('#portal-flash')).includes('income verification form'), 'income flash');
  ok((await page.textContent('#student-list')).includes('Done'), 'income shows done');
  s = await admin(); ok(s.sheets.INCOME_RAW.length === 2 && s.files.some(f => f.folder === 'income-folder'), 'income row + file in income folder');

  // 6. Onboarding decline
  await admin({op: 'enable', task: 'onboarding'});
  await page.reload(); await page.waitForTimeout(1500);
  await page.click('#student-list .task-list li:first-child button');
  ok(await page.isVisible('.task-form[data-task=onboarding]'), 'onboarding form');
  await page.check('input[name=obAccept][value=no]');
  ok(await page.isVisible('#ob-decline') && !(await page.isVisible('#ob-rest')), 'decline shows reason, hides rest');
  await page.fill('[name=obDeclineReason]', 'Schedule conflict');
  await page.click('#task-submit');
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'portal', null, {timeout: 8000}).catch(() => {});
  ok((await page.textContent('#student-list')).includes("won't be joining"), 'declined card: ' + (await page.textContent('#student-list')).slice(0, 200));

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
  // Ignore noise from the test stand-ins (blocked fonts, the stub Firestore module, the optional hero photo).
  const real = errors.filter(e => !/ERR_FAILED|404|firebase-firestore/.test(e));
  ok(!real.length, 'no page errors: ' + real.join(' | '));
  await browser.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
