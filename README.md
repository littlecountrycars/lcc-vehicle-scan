# LCC Vehicle Scan

Little Country Cars' scan app for the Veepeak Bluetooth OBD2 scanner, on an Android phone in Chrome (138+). One app, three modes:

- **Check-In** (Dylan, recon): scan a vehicle we bought, Day-1 estimate, send to monday.com Inventory Recon.
- **Auction** (Jonathan, buying): quick appraisal, red flags, max bid, lane drive. Stays on the phone.
- **Trade** (Simon, sales): quick appraisal, test drive, trade offer with payoff/equity, customer copy. Stays on the phone.

Open https://littlecountrycars.github.io/lcc-vehicle-scan/ in Chrome → ⋮ → Add to Home screen. Pick your mode the first time; tap the name at the top to switch.

- Read-only: it never clears codes.
- No keys or customer data live here. A monday.com token is stored only on the phone that uses it.
- How the code is laid out, who owns what, and how to make changes: see `CLAUDE.md`.
