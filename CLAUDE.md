# LCC Vehicle Scan — notes for Claude

One web app for Little Country Cars' Veepeak Bluetooth OBD2 scanner, with three modes. Made Nov 10, 2026 by merging Check-In Scan (littlecountrycars/lcc-check-in-scan) and Acquisition Scan (littlecountrycars/lcc-aquisition-scan) so the shared scanner code is kept in one place. The old repos are archived; their addresses redirect here.

Live: https://littlecountrycars.github.io/lcc-vehicle-scan/ (GitHub Pages from `main`, root). Repo: littlecountrycars/lcc-vehicle-scan. Pushing to `main` publishes; phones get the new version next open.

## Who owns what
| Part | Files | Owner | Sign-off |
|---|---|---|---|
| Shared engine and screens | `obd.js`, `app.js`, `index.html`, `sw.js`, tests | **Dylan** | Jonathan for process/money changes |
| Check-In mode (recon, monday.com) | `modes/checkin.js` + the monday.com section of `app.js` | **Dylan** | Jonathan (recon SOP, $1,000 rule) |
| Auction mode (buying) | `modes/auction.js` | **Jonathan** | Jonathan |
| Trade mode (sales) | `modes/trade.js` | **Simon** | Jonathan for the offer math |
| Money math (max bid, trade offer, red flags) | `maxBid`, `theCall`, `redFlags` in `app.js` | Dylan maintains | **Jonathan** |

A mode owner changes their own `modes/*.js` freely (wording, labels, defaults, keep days). Anything in the shared files affects every mode.

## How to make changes without stepping on each other
1. **Never push straight to `main`.** Work on a branch named for the person and change (`simon/trade-offer-wording`), open a pull request.
2. The **Demo truck test** (GitHub Actions, `tests/demo-test.js`) runs on every push and pull request: all three modes scan, idle, drive and show their result; Auction and Trade make no monday.com calls; mode 04 is never sent; old data carries over. Merge only when it's green.
3. A change to a shared file (`obd.js`, `app.js`, `index.html`, `sw.js`) needs **Dylan** to approve the pull request. A change to the money math also needs **Jonathan**.
4. Change only your own mode file unless the pull request says why.
5. Bump `VERSION` in `sw.js` on every change that ships, so phones fetch the new files.
6. Run `node tests/demo-test.js` locally before opening the pull request (`npm i --no-save playwright && npx playwright install chromium` once).

## Modes
- **Check-In** (`checkin`): a vehicle LCC bought arrives. Stock # = last 6 of the VIN. Full test drive. Day-1 estimate. Sends to monday.com Inventory Recon; over $1,000 notifies Jonathan. Kept on the phone 30 days.
- **Auction** (`auction`): appraising at a physical auction, including vehicles we may not buy. Quick appraisal (scan + freeze frame + Ford modules + 15-second idle), the call (Bid / Caution / Walk away), max bid, next vehicle (bumps a numeric lane/run #), lane drive (~300 m, 35-45 mph; torque converter shudder can't be checked), lookups retried when signal returns. **Never touches monday.com.** Kept 8 days by default (the same unit can come back at next week's auction).
- **Trade** (`trade`): Simon valuing a customer's trade at the desk. Quick appraisal, full test drive, the call (Good trade / Adjust offer / Wholesale only), trade offer, payoff and customer equity, a customer copy with no prices or internal notes. **Never touches monday.com.** Kept 30 days.

Max bid / trade offer = expected sale price (typed, from SCOUT's expected sale price) − this vehicle's estimated recon − minimum profit/gross wanted (setting, default $2,500 per Jonathan) − fees/transport (setting, default $0). Don't use SCOUT's max bid as the input: SCOUT already subtracts its own typical recon and gross. Hard red flags (Walk away / Wholesale only): codes cleared recently with 2+ self-tests unfinished, odometer mismatch > 1,000 mi (typed dash vs computer), transmission codes, airbag faults, active transmission-module faults, slipping/shudder on the drive, or an offer at or below $0.

The mode is picked on first open and remembered per phone; tap the name at the top to switch. `?mode=checkin|auction|trade` in the link opens a mode (home-screen shortcuts use this). `#vin=<VIN>&sale=<price>` fills a sale price into a saved Auction/Trade appraisal (for a future SCOUT "send back" button).

## Files
- `obd.js`: scanner engine. Transports (Web Serial classic Bluetooth, Web Bluetooth LE, demo truck), ELM327 commands, code parsing, idle/misfire, cranking test, freeze frame, Ford module codes (UDS 0x19), drive analysis (`assessDrive(r, before, after, { lane })`), fix/parts/cost table (`FIXES`), parts links (`SHOPS`).
- `app.js`: screens, modes, estimate, red flags/call/offer, reports, share/PDF, monday.com (Check-In only), history, settings, migration from the old apps.
- `modes/checkin.js`, `modes/auction.js`, `modes/trade.js`: each mode's wording and defaults.
- `index.html`: layout and styles. Elements with `data-modes="..."`, `data-money="bid"`, `data-dest="monday|phone"` or `data-quick` show only where they apply.
- `sw.js`: offline copy in this app's own IndexedDB database (`lcc-vehicle-scan`), never Cache Storage. Only handles its own folder.
- `manifest.webmanifest`: home-screen install, with a shortcut per mode.
- `tests/demo-test.js`: the demo-truck test. `.github/workflows/demo-test.yml` runs it.
- `docs/HANDOFF-check-in-history.md`: the original Check-In Scan history (decisions, scanner troubleshooting). Its addresses refer to the old app.

## Saved on the phone
- localStorage keys `lccVS.*` only (`settings`, `history`, `lastTransport`, `mode`, `migrated`). Never read or clear other apps' keys, except the one-time read of `lccScan.*` (Check-In) and `lccAcq.*` (Acquisition) on first open, which copies the monday token, name, Auction profit/fees and both histories. The old keys are left in place.
- One history list; each record has `mode`; each mode shows its own and keeps it for its own number of days.
- Each user's monday.com token is stored only on their phone. Never commit tokens.

## monday.com (Check-In mode only)
- Board: Inventory Recon (new) `18410463373`; subitems board `18410479838`.
- Columns: Stock # `text_mm2txesd`, Stage `color_mm2tny8k`, Location `color_mm2yxmdw`, Day-1 Estimate `numeric_mm8x1pk1`. Subitem columns: Status `color_mm2t1egg`, Notes `long_text_mm2t42xe`, Parts Needed `text_mm2tdxxp`.
- Over $1,000 notifies Jonathan (user `101601751`).
- Auction and Trade must not read or write monday.com unless Jonathan asks for it.

## Scanner won't connect
The Veepeak is classic Bluetooth: one app at a time. Another scan app (Car Scanner, Torque, OBD Fusion, Veepeak's own app) with auto-connect on can grab it in the background, and then this app can't open it. Fix: turn off auto-connect in that app (or uninstall unused scan apps), force-stop it, unplug the Veepeak 5 seconds, key ON, Try again. The app shows these steps under "Scanner won't connect?" when a connection fails, and the Connection log (Copy log) shows every step. More in `docs/HANDOFF-check-in-history.md` section 2.

## Rules
- Read-only scanner: never send mode 04 (clear codes). The test checks this.
- SCOUT (LCC's buy guide) is a private claude.ai artifact: https://claude.ai/artifact/6bBGxC5drP42KJE9sGJYgZ. The app only links to it and copies the VIN. Never copy SCOUT's sales data, costs or gross into this public repo.
- LCC Brand Kit (lcc-brand skill): Country Orange #FF8C00, black, white, #666666 small print; status green #2E7D32 / red #C62828 only for state. Fjalla One headings, Arial body. Rounded corners. Nebraska orange icon. Plain, specific wording.
- Parts: AutoZone Pro (button copies the VIN for Pro's VIN lookup), Advance, NAPA, Amazon.
- Process lives in the SOP "Recon Intake And The Day-1 Estimate" (Recon & Lot folder). Keep Check-In mode and the SOP in step.
- Test with the demo truck before merging; nothing posts to monday from the demo.
