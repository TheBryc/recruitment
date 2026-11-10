// Browser test for the home page section menu, Back to top, and footer links. See tests/e2e/README.md.
const {chromium} = require('playwright');
const out = process.env.SHOTS || __dirname, BASE = process.env.BASE || 'http://localhost:8766/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  await c.route(/typekit|thebryc\.org|gstatic/, r => r.abort());
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForTimeout(800);
  const cur = () => p.evaluate(() => document.querySelector('.section-rail [aria-current="true"] .rail-label')?.textContent);

  ok(await p.evaluate(() => [...document.querySelectorAll('.footer-links > *')].map(n => n.textContent.replace(/[↗(].*$/s, '').trim()).join('|')) === 'Home|About BRYC|FAQs|Staff sign-in', 'footer has Home, About BRYC, FAQs, Staff sign-in');
  ok(await p.isVisible('.section-rail'), 'rail shows on the home page');
  ok(await p.evaluate(() => [...document.querySelectorAll('.section-rail .rail-label')].map(n => n.textContent).join('|')) === 'Home|The basics|What BRYC offers|Our mission|How to apply|Next steps', 'rail lists the six sections');
  ok(await cur() === 'Home', 'starts on Home');
  ok(!(await p.isVisible('.to-top')), 'no Back to top button on the desktop home page');

  await p.evaluate(() => scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})); await p.waitForTimeout(300);
  ok(await cur() === 'Next steps', 'bottom of the page marks Next steps');
  await p.hover('.section-rail'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.section-rail .rail-label')).opacity) === '1', 'hovering shows the section names');
  await p.screenshot({path: out + '/rail-hover.png'});
  await p.click('.section-rail li:nth-child(2) button'); await p.waitForTimeout(400);
  const gap = await p.evaluate(() => document.querySelector('[data-nav-label="The basics"]').getBoundingClientRect().top - document.querySelector('.topbar').offsetHeight);
  ok(Math.abs(gap) <= 2, 'The basics lands just under the header (gap ' + gap + ')');
  ok(await cur() === 'The basics', 'The basics is marked current');
  await p.mouse.move(200, 450); await p.waitForTimeout(300);
  await p.screenshot({path: out + '/rail-idle.png'});
  await p.click('.section-rail li:first-child button'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => scrollY) === 0, 'Home goes back to the top');

  await p.evaluate(() => BRYCView('faq')); await p.waitForTimeout(300);
  ok(!(await p.isVisible('.section-rail')), 'rail hidden on other pages');
  await p.evaluate(() => scrollTo({top: 1500, behavior: 'instant'})); await p.waitForTimeout(300);
  ok(await p.isVisible('.to-top'), 'Back to top appears on a long page');
  await p.click('.to-top'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => scrollY) === 0, 'Back to top works');
  ok(!errs.length, 'no page errors ' + errs.join('|'));
  await c.close();

  const m = await b.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
  await m.route(/typekit|thebryc\.org|gstatic/, r => r.abort());
  const q = await m.newPage(); await q.goto(BASE); await q.waitForTimeout(800);
  ok(!(await q.isVisible('.section-rail')), 'no rail on phones');
  ok(!(await q.isVisible('.to-top')), 'no Back to top before scrolling');
  await q.evaluate(() => scrollTo({top: 2000, behavior: 'instant'})); await q.waitForTimeout(300);
  ok(await q.isVisible('.to-top'), 'Back to top appears after scrolling on a phone');
  await q.screenshot({path: out + '/to-top-mobile.png'});
  await q.tap('.to-top'); await q.waitForTimeout(400);
  ok(await q.evaluate(() => scrollY) === 0, 'phone Back to top works');
  ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on phone');
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
})();
