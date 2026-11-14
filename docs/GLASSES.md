# Glasses in Vehicle Scan

Started Nov 13, 2026 from the two "Glasses" items in the Issues group on the LCC Goals board (monday.com board 18439218628). Ideas and sign-off: Jonathan. Code owner: Dylan (shared files), each mode owner for their mode's wording.

## What it does (version 1, no new app)

The Meta glasses work with Vehicle Scan as they are today:

- **Camera:** videos and photos taken on the glasses land in the Pixel's gallery (Meta AI app auto-import). You pick them in Vehicle Scan; Claude reads them.
- **Earpiece:** the glasses are a Bluetooth headset for the phone, so whatever Vehicle Scan says plays in the glasses.

| Mode | Who | What the glasses do |
|---|---|---|
| Check-In | Dylan | **Talk me through the walkaround** says each shot in your ear (door sticker, odometer, each tire, each side, bed, hood, interior) and writes down what you say out loud. Pick the video: Claude reads the VIN (stock #), odometer, tires, damage and leaks, and adds recon lines to the Day-1 estimate. Works before the scanner is plugged in; the scan joins the same record. Send fills in the matching walk-around items on monday.com (Tires, Body / paint, Windshield, Visible fluid leaks, Interior condition, Blinkers, Other notes): Needs Attention when something was found, a note only when it looked OK. |
| Auction | Jonathan | Photo of the VIN plate, run sheet or window card. Reads VIN, run #, miles and announcements, says them in your ear, copies the VIN for SCOUT. Title brand, frame/structural, flood, odometer and airbag announcements are a Walk away. After the quick appraisal, and when SCOUT's sale price comes in, it says the call and the max bid. |
| Trade | Simon | Photo of the door sticker or dash fills VIN and miles. **Coach me on this number** (after the appraisal and sale price): how to present the offer, why the number, and answers to likely pushback, on screen and in your ear. It sends Claude the vehicle and the math only, never the customer's name, deal # or notes. |

Jonathan's auction buy rules are now in Auction mode (`modes/auction.js`, `walkCodes`): misfire codes (P0300–P0312), camshaft codes (P0011–P0025, P0340–P0349, P0365–P0369, P0390–P0394) and misfires counted on the idle check are a Walk away.

## Setup (once per phone)

1. **Claude API key.** Jonathan makes one at console.anthropic.com (API Keys → Create key, one per person so each can be turned off on its own) and gives it to each person. Vehicle Scan → gear → **Claude API key** → paste. It's saved only on that phone. A walkaround costs a few cents.
2. **Meta AI app** on the Pixel → glasses settings → **Media** → turn on auto-import to the phone's gallery. Set the video length to **3 minutes** so a whole walkaround fits in one clip.
3. Pair the glasses to the phone as usual (they're the phone's Bluetooth audio). Leave **Talk to me** on in Vehicle Scan settings.

## Watch-outs

- Glasses pictures are ultra-wide and a little soft: good for condition notes, not listing photos. For the VIN, a close photo of the door jamb sticker reads best. The app only takes a VIN that passes the check digit.
- Spoken notes during the walkaround use Chrome's speech recognition: best effort, and it needs the screen on (the app keeps it on).
- Nothing from the glasses goes anywhere public. No customer faces or plates in anything posted.
- Claude's recon prices are ballpark, like the scanner's. Dylan's real numbers replace them.

## Version 2: hands-free (not built)

Only worth building once version 1 is used on every truck for 3–4 weeks.

- A small native Android app on Meta's Wearables Device Access Toolkit for Android (github.com/facebook/meta-wearables-dat-android; it ships a Claude Code plugin). It gets the glasses' camera stream, mic and speakers directly, so: say "check in", no gallery step, live VIN read while looking at the sticker.
- It would hand results to Vehicle Scan through the same record format (or the `#vin=` link), not replace it: the scanner needs Chrome's Web Serial, which only works in Chrome itself.
- Builds on a Windows PC with Android Studio; installs straight onto the four Pixels (no Play Store, no Apple fee). Hire an Android (Kotlin) developer or build it in Claude Code.
- **Simon live coaching while the customer is there** belongs here, not in version 1, and needs a decision first: it means the glasses listen to the customer. Tell the customer, keep nothing recorded, and coach only on our vehicle and numbers.
- SCOUT numbers by voice at the lane (no typing the sale price) also need this, plus a private way for the app to read SCOUT's sales data. SCOUT's data must never go into this public repo.
