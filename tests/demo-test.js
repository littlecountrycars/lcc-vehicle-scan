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
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
  // Auction: pretend the VIN decodes as a SuperCab so the SuperCab rule is exercised
  await page.route(/vpic\.nhtsa\.dot\.gov/, (r) => mode === 'auction'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ Results: [{ ModelYear: '2018', Make: 'FORD', Model: 'F-150', Trim: 'XLT', BodyCabType: 'Extra/Super/Quad/Double/King/Extended', DisplacementL: '5.0', EngineCylinders: '8' }] }) })
    : r.abort());
  await page.route(/api\.nhtsa\.gov|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
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
    } else {
      ok(!(await page.isVisible('#custBtn')), 'no customer copy button');
      const flags = await page.textContent('#flags');
      ok(!/your rule is never buy/.test(flags) && /Misfires on cylinder/.test(flags), 'in-person auction: misfire is a caution, not a never-buy');
      ok(/SuperCab cushion/.test(await page.textContent('#bidMath')), 'SuperCab cushion taken off the max bid');
    }
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    await migration(browser, base);
    for (const m of (process.env.MODES || 'checkin auction trade').split(' ')) await runMode(browser, base, m);
  } catch (e) { console.log('  FAIL ' + e.message); failed++; }
  await browser.close(); server.close();
  console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
