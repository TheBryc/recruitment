// Browser test for the "What BRYC offers" swipe rows on phones and tablets.
// See tests/e2e/README.md.
const {chromium} = require('playwright');
const out = process.env.SHOTS || __dirname, BASE = process.env.BASE || 'http://localhost:8766/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const open = async opts => {
    const c = await b.newContext(Object.assign({reducedMotion: 'reduce'}, opts));
    await c.route(/typekit|thebryc\.org|gstatic/, r => r.abort());
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await p.waitForTimeout(800);
    return {c, p, errs};
  };
  const state = (p, sel) => p.evaluate(sel => {
    const row = document.querySelector(sel), bar = row.nextElementSibling;
    const dots = [...bar.querySelectorAll('.swipe-dots button')];
    return {scrolls: row.scrollWidth > row.clientWidth, bar: !bar.hidden, dots: dots.length,
      current: dots.findIndex(d => d.getAttribute('aria-current') === 'true'),
      prevOff: bar.querySelector('.swipe-arrow').disabled, nextOff: bar.querySelectorAll('.swipe-arrow')[1].disabled,
      labels: dots.map(d => d.getAttribute('aria-label'))};
  }, sel);

  // Desktop: normal grid, no controls.
  let {c, p, errs} = await open({viewport: {width: 1440, height: 900}});
  let s = await state(p, '.journey');
  ok(!s.scrolls && !s.bar, 'desktop: journey is a grid with no swipe controls');
  ok((await p.textContent('.journey')).includes('colleges and universities across the country'), 'partnerships say across the country');
  ok(!errs.length, 'desktop: no page errors ' + errs.join('|')); await c.close();

  // Phone
  ({c, p, errs} = await open({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true}));
  s = await state(p, '.journey');
  ok(s.scrolls && s.bar && s.dots === 4, 'phone: journey swipes with 4 dots');
  ok(s.current === 0 && s.prevOff && !s.nextOff, 'phone: starts at step 1, previous disabled');
  ok(s.labels[1] === 'Step 2: ACT prep', 'phone: dots are labeled by step');
  await p.addStyleTag({content: '.topbar,.to-top{visibility:hidden!important}'});
  const section = await p.$('[data-nav-label="What BRYC offers"]');
  await section.scrollIntoViewIfNeeded();
  await p.evaluate(() => document.querySelector('.journey').scrollIntoView({block: 'start'}));
  await p.screenshot({path: out + '/swipe-phone-step1.png'});
  await p.click('.journey + .swipe-bar .swipe-arrow:last-child'); await p.waitForTimeout(300);
  s = await state(p, '.journey'); ok(s.current === 1 && !s.prevOff, 'phone: next arrow moves to step 2');
  await p.click('.journey + .swipe-bar .swipe-dots button:nth-child(4)'); await p.waitForTimeout(300);
  s = await state(p, '.journey'); ok(s.current === 3 && s.nextOff, 'phone: last dot jumps to step 4, next disabled');
  await p.screenshot({path: out + '/swipe-phone-step4.png'});
  await p.evaluate(() => { const r = document.querySelector('.journey'); r.scrollTo({left: r.children[2].offsetLeft - 16, behavior: 'instant'}); });
  await p.waitForTimeout(300);
  s = await state(p, '.journey'); ok(s.current === 2, 'phone: swiping updates the dots');
  s = await state(p, '.support-grid');
  ok(s.scrolls && s.dots === 4, 'phone: support cards swipe two at a time (4 stops)');
  const tall = await p.evaluate(() => document.querySelector('[data-nav-label="What BRYC offers"]').getBoundingClientRect().height);
  ok(tall < 2600, 'phone: section is much shorter (' + Math.round(tall) + 'px tall)');
  await p.evaluate(() => document.querySelector('.support').scrollIntoView({block: 'start'}));
  await p.screenshot({path: out + '/swipe-phone-support.png'});
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways page scroll');
  ok(!errs.length, 'phone: no page errors ' + errs.join('|')); await c.close();

  // Tablet
  ({c, p, errs} = await open({viewport: {width: 1000, height: 900}}));
  s = await state(p, '.journey');
  ok(s.scrolls && s.bar, 'tablet: journey swipes');
  s = await state(p, '.support-grid');
  ok(!s.scrolls && !s.bar, 'tablet: support cards stay a two-column grid');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'tablet: no sideways page scroll');
  await c.close();

  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
