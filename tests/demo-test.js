/* Demo-truck test for every mode. Runs on every push and pull request (GitHub Actions), and locally:
     npm i playwright && npx playwright install chromium   (once)
     node tests/demo-test.js
   Checks: each mode scans, idles, drives and shows its own result; Auction and Trade never call monday.com;
   no mode ever sends mode 04 (clear codes); old Check-In/Acquisition data carries over. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  // Also serve the app under /lcc-vehicle-scan-test/ to check the test copy keeps its own data
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/lcc-vehicle-scan-test\//, '/'); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const SHOTS = process.env.SHOTS || '';
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };

async function runMode(browser, base, mode) {
  console.log('\n' + mode);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  const monday = [], errors = [];
  await page.route('https://api.monday.com/**', (r) => { monday.push(r.request().url()); r.abort(); });
  await page.route(/nhtsa\.(dot\.)?gov|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on('pageerror', (e) => errors.push(e.message));
  // Record every command the app sends to the (demo) scanner
  await page.addInitScript(() => {
    window.__sent = [];
    const wait = setInterval(() => {
      if (!window.OBD) return; clearInterval(wait);
      const w = window.OBD.DemoTransport.prototype.write;
      window.OBD.DemoTransport.prototype.write = function (s) { window.__sent.push(String(s).trim().toUpperCase().replace(/\s+/g, '')); return w.call(this, s); };
    }, 5);
  });
  await page.goto(base + '?mode=' + mode);
  ok((await page.textContent('#modeTitle')).length > 0, 'opens in ' + mode + ' mode: ' + await page.textContent('#modeTitle'));
  await page.click('#demoBtn');
  await page.waitForSelector('#connPill.demo');
  const quick = await page.isVisible('#quickBtn');
  ok(quick === (mode !== 'checkin'), 'quick appraisal button ' + (quick ? 'shown' : 'hidden'));
  if (quick) { await page.click('#quickBtn'); await page.waitForSelector('#callCard:not(.hidden)', { timeout: 90000 }); await page.waitForSelector('#idleResult:not(.hidden)', { timeout: 60000 }); }
  else { await page.click('#scanBtn'); await page.waitForSelector('#resultCard:not(.hidden)', { timeout: 90000 }); }
  ok(await page.isVisible('#resultCard'), 'scan finished');
  ok((await page.inputValue('#miles')) !== '', 'miles filled from the truck');
  if (mode === 'checkin') ok((await page.inputValue('#stock')).length === 6, 'Stock # = last 6 of VIN: ' + await page.inputValue('#stock'));
  else ok((await page.inputValue('#stock')) === '', 'lane/deal # left for the user');

  await page.click('#driveBtn');
  await page.waitForTimeout(14000);
  await page.click('#driveEnd');
  await page.waitForSelector('#driveResult:not(.hidden)', { timeout: 30000 });
  ok(true, 'drive recorded: ' + (await page.textContent('#driveVerdict')).trim());
  ok((await page.textContent('#estTotal')) !== '', 'estimate total ' + await page.textContent('#estTotal'));

  if (mode === 'checkin') {
    ok(await page.isVisible('#sendBtn'), 'Send to monday.com shown');
    ok(!(await page.isVisible('#callCard')), 'no bid/offer card');
    ok(/Practice scan/.test(await page.textContent('#matchBox')), 'demo scan does not post to monday.com');
  } else {
    ok(!(await page.isVisible('#sendBtn')), 'no monday.com button');
    await page.fill('#salePrice', '30000');
    if (mode === 'trade') await page.fill('#payoff', '20000');
    await page.waitForTimeout(200);
    const amt = await page.textContent('#callBidAmt');
    ok(/\$|None/.test(amt), (mode === 'trade' ? 'trade offer ' : 'max bid ') + amt + ' (' + (await page.textContent('#callWord')) + ')');
    if (mode === 'trade') {
      ok(await page.isVisible('#callEquity'), 'payoff/equity shown: ' + await page.textContent('#callEquity'));
      ok(await page.isVisible('#custBtn'), 'customer copy button shown');
    } else ok(!(await page.isVisible('#custBtn')), 'no customer copy button');
  }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, mode + '.png'), fullPage: true });
  if (mode !== 'checkin') { await page.click('#nextBtn'); await page.waitForTimeout(300); ok(!(await page.isVisible('#resultCard')), 'next vehicle clears the screen'); }
  ok((await page.$$('#hist li')).length >= 1, 'saved in recent list');
  const sent = await page.evaluate(() => window.__sent);
  ok(sent.length > 20, sent.length + ' scanner commands sent');
  ok(!sent.some((c) => c === '04' || /^04/.test(c)), 'never sent mode 04 (clear codes)');
  ok(monday.length === 0, 'no monday.com calls from the demo truck (' + monday.length + ')');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

async function migration(browser, base) {
  console.log('\nmigration from the old apps');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/nhtsa|fonts\.|monday/, (r) => r.abort());
  await page.goto(base + 'tests/blank.html');
  await page.evaluate(() => {
    localStorage.setItem('lccScan.settings', JSON.stringify({ name: 'Dylan', token: 'tok', fill: true }));
    localStorage.setItem('lccScan.history', JSON.stringify([{ id: 'a1', at: new Date().toISOString(), vin: '1FTEW1EP0KFA00001', stock: 'A00001', assessment: { overall: 'good', findings: [] }, scan: {} }]));
    localStorage.setItem('lccAcq.settings', JSON.stringify({ name: 'Jonathan', minProfit: 3000, fees: 150 }));
    localStorage.setItem('lccAcq.history', JSON.stringify([{ id: 'b1', at: new Date().toISOString(), vin: '1FTEW1EP0KFA00002', assessment: { overall: 'watch', findings: [] }, scan: {} }]));
  });
  await page.goto(base);
  ok((await page.textContent('#modeTitle')) === 'Check-In', 'phone with a monday token opens in Check-In');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('lccVS.settings')));
  ok(s.token === 'tok' && s.name === 'Dylan', 'token and name carried over');
  ok(s.per.auction.minProfit === 3000 && s.per.auction.fees === 150, 'auction profit and fees carried over');
  const h = await page.evaluate(() => JSON.parse(localStorage.getItem('lccVS.history')));
  ok(h.length === 2 && h.find((r) => r.id === 'a1').mode === 'checkin' && h.find((r) => r.id === 'b1').mode === 'auction', 'both histories carried over, tagged by mode');
  ok(await page.evaluate(() => localStorage.getItem('lccScan.settings') !== null && localStorage.getItem('lccAcq.history') !== null), 'old keys left alone');
  await ctx.close();
}

async function testCopy(browser, base) {
  console.log('\ntest copy');
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  await page.route(/nhtsa\.(dot\.)?gov|fonts\.(googleapis|gstatic)\.com|api\.monday\.com/, (r) => r.abort());
  await page.goto(base + 'tests/blank.html');
  await page.evaluate(() => {
    localStorage.setItem('lccVS.settings', JSON.stringify({ name: 'Dylan', token: 'tok', fill: true, per: {} }));
    localStorage.setItem('lccVS.history', JSON.stringify([{ id: 'live1', mode: 'checkin', at: new Date().toISOString(), assessment: { overall: 'good', findings: [] }, scan: {} }]));
    localStorage.setItem('lccVS.mode', JSON.stringify('checkin'));
  });
  await page.goto(base + 'lcc-vehicle-scan-test/?mode=auction');
  ok(await page.isVisible('.testbar'), 'TEST banner shows');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lccVST.settings')));
  ok(st && st.token === 'tok', 'test copy borrows the live token');
  const lv = await page.evaluate(() => ({ h: JSON.parse(localStorage.getItem('lccVS.history')), m: JSON.parse(localStorage.getItem('lccVS.mode')), th: localStorage.getItem('lccVST.history') }));
  ok(lv.h.length === 1 && lv.h[0].id === 'live1' && lv.m === 'checkin', 'live app data untouched (history and mode)');
  ok(!lv.th || !JSON.parse(lv.th).some((r) => r.id === 'live1'), 'test copy keeps its own history');
  await page.goto(base);
  ok(!(await page.isVisible('.testbar')), 'no TEST banner on the live address');
  await ctx.close();
}


/* Glasses: Claude is faked here (no key, no cost). Checks that a glasses walkaround or photo fills the vehicle,
   carries into the scan, flags what it should, and that coaching never sends the customer's name or deal #. */
const DEMO_VIN = '1FTEW1EP4JFD00042';
const FAKE = {
  walkaround: { vin: DEMO_VIN, odometer: 133500, summary: 'Clean truck; rear tires worn and a dent in the tailgate.',
    areas: [{ area: 'Tires', seen: true, ok: false, note: 'Both rears about 3/32, fronts OK' }, { area: 'Body / paint condition', seen: true, ok: false, note: 'Dent, tailgate center' },
      { area: 'Windshield', seen: true, ok: true, note: 'No chips seen' }, { area: 'Interior condition', seen: false, ok: true, note: '' }],
    recon: [{ item: 'Two rear tires', low: 260, high: 400 }, { item: 'PDR tailgate dent', low: 125, high: 250 }] },
  photo: { vin: DEMO_VIN, lane: '214', miles: 133500, vehicle: '2018 Ford F-150 XLT', flags: [{ title: 'Frame damage announced', hard: true }], say: 'Lane 214, 2018 F-150 XLT, frame damage announced.' },
  coach: { say: 'Lead with the misfire.', present: 'Walk them through the scan first.', value_points: ['Misfire on cylinder 3'], objections: [{ they_say: 'KBB says more', you_say: 'That assumes it runs right.' }] }
};
async function glasses(browser, base) {
  console.log('\nglasses');
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], claude = [], monday = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/nhtsa\.(dot\.)?gov|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('https://api.monday.com/**', (r) => { monday.push(r.request().url()); r.abort(); });
  await page.route('https://api.anthropic.com/**', (r) => {
    const body = JSON.parse(r.request().postData()); claude.push({ body, headers: r.request().headers() });
    const name = body.tool_choice.name;
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'tool_use', id: 't1', name, input: FAKE[name] }] }) });
  });
  await page.goto(base + 'tests/blank.html');
  await page.evaluate(() => localStorage.setItem('lccVS.settings', JSON.stringify({ name: 'Simon', token: '', claudeKey: 'sk-test', talk: false, per: {} })));
  const photo = { name: 'glasses.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(ROOT, 'icon-512.png')) };

  // Check-In: walkaround before the scanner, then the scan takes it over
  await page.goto(base + '?mode=checkin');
  ok(await page.isVisible('#glassCard'), 'Check-In shows the glasses walkaround');
  await page.setInputFiles('#glassFiles', photo);
  await page.waitForSelector('#glassResult:not(.hidden)', { timeout: 20000 });
  const req = claude[0];
  ok(req && req.headers['x-api-key'] === 'sk-test' && req.body.messages[0].content[0].type === 'image', 'sends the picture to Claude with the phone’s key');
  ok((await page.inputValue('#stock')) === 'D00042', 'stock # from the VIN the glasses read: ' + await page.inputValue('#stock'));
  ok((await page.inputValue('#miles')) === '133500', 'miles from the odometer the glasses read');
  ok(/Two rear tires/.test(await page.textContent('#estLines')), 'walkaround recon lines in the Day-1 estimate');
  ok(await page.isVisible('#sendBtn'), 'can send a walkaround to monday.com without a scan');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'glasses-walkaround.png'), fullPage: true });
  await page.click('#demoBtn'); await page.waitForSelector('#connPill.demo');
  await page.click('#scanBtn'); await page.waitForSelector('#resultCard:not(.hidden)', { timeout: 90000 });
  ok(/Two rear tires/.test(await page.textContent('#estLines')), 'scan keeps the walkaround lines');
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('lccVS.history')));
  ok(hist.filter((r) => r.mode === 'checkin').length === 1 && hist[0].walk && !hist[0].noScan, 'one record: scan + walkaround');

  // Auction: photo flags, buy rules, nothing to monday.com
  await page.goto(base + '?mode=auction');
  await page.setInputFiles('#glassFiles', photo);
  await page.waitForSelector('#callCard:not(.hidden)', { timeout: 20000 });
  ok((await page.inputValue('#stock')) === '214', 'lane # from the run sheet');
  ok(/walk away/i.test(await page.textContent('#callWord')), 'frame damage on the run sheet = Walk away');
  await page.click('#demoBtn'); await page.waitForSelector('#connPill.demo');
  await page.click('#quickBtn'); await page.waitForSelector('#idleResult:not(.hidden)', { timeout: 90000 });
  await page.waitForTimeout(300);
  const flags = await page.textContent('#flags');
  ok(/Misfire code/.test(flags), 'buy rule: misfire code P0303 is a hard flag');
  ok(/Frame damage/.test(flags), 'run-sheet flag carries into the scan');

  // Trade: coach me sends no customer name, deal # or notes
  await page.goto(base + '?mode=trade');
  await page.fill('#stock', 'Smith deal 88');
  await page.click('#demoBtn'); await page.waitForSelector('#connPill.demo');
  await page.click('#quickBtn'); await page.waitForSelector('#callCard:not(.hidden)', { timeout: 90000 }); await page.waitForSelector('#idleResult:not(.hidden)', { timeout: 60000 });
  await page.fill('#notes', 'Customer John Smith, 402-555-0100');
  await page.fill('#salePrice', '24000'); await page.fill('#payoff', '9000');
  await page.click('#coachBtn');
  await page.waitForSelector('#coachBox:not(.hidden) li', { timeout: 20000 });
  const coachReq = JSON.stringify(claude[claude.length - 1].body);
  ok(/Trade offer/.test(coachReq) && !/Smith|402-555|deal 88/.test(coachReq), 'coaching gets the math, not the customer’s name, phone or deal #');
  ok(/KBB says more/.test(await page.textContent('#coachBox')), 'coaching shown');
  if (SHOTS) await page.locator('#callCard').screenshot({ path: path.join(SHOTS, 'glasses-coach.png') });
  ok(monday.length === 0, 'glasses in Auction/Trade make no monday.com calls (' + monday.length + ')');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    await migration(browser, base);
    await testCopy(browser, base);
    await glasses(browser, base);
    for (const m of (process.env.MODES || 'checkin auction trade').split(' ')) await runMode(browser, base, m);
  } catch (e) { console.log('  FAIL ' + e.message); failed++; }
  await browser.close(); server.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
