/* Trade mode. Owner: Simon (sales).
   Valuing a customer's trade-in at the desk. Same scan and red flags as Auction, with a full test drive
   (it's on our lot, so you can take it on the road) and a trade offer instead of a max bid.
   Never touches monday.com; trade appraisals stay on the phone until shared.
   Simon: this is a working first version. Change wording and defaults here; ask Dylan before changing
   obd.js or app.js (shared by every mode), and Jonathan before changing the money math. */
(window.LCC_MODES = window.LCC_MODES || {}).trade = {
  id: 'trade',
  label: 'Trade',
  title: 'Trade',
  who: 'Simon, sales',
  blurb: 'Value a customer’s trade: scan, test drive, trade offer, customer copy.',
  record: 'trade appraisal', records: 'trade appraisals',

  stockLabel: 'Customer / deal #',
  stockPlaceholder: 'Optional',
  stockFromVin: false,
  stockShort: 'deal',
  scanHint: 'Ask the customer for the keys, plug in, key on. Miles fills in from the scan on most vehicles. Quick appraisal takes about 2 minutes; do the test drive after if you can.',
  quick: true,

  lane: false,
  driveName: 'Test drive',
  driveIntro: 'Tap start <b>before</b> you pull out, set the phone in a mount, and don’t touch it while driving. 5–10 minutes: a few firm accelerations and, if you can, 30 seconds at a steady 45–65 mph. Tap End when you’re parked.',

  money: 'bid',
  estimateName: 'Estimated recon',
  estimateHint: 'What we’d spend to make it front-line ready. Prefilled from typical parts + labor for each finding; add tires, glass, body, detail.',
  overThousand: 'Over $1,000 in likely recon, or a big-ticket repair. It’s in the offer below; if it’s a hard flag, think wholesale.',
  priceLabel: 'Expected retail sale price',
  pricePlaceholder: 'From SCOUT',
  priceHint: 'What we’d sell it for on our lot (SCOUT’s <b>expected sale price</b>). The offer takes off this vehicle’s recon and the gross we want.',
  resultName: 'Trade offer',
  feesName: 'Other costs (inspection, transport)',
  minProfit: 2500,               // gross wanted on a trade; Jonathan signs off on changes
  fees: 0,
  calls: { good: 'Good trade', watch: 'Adjust offer', problem: 'Wholesale only' },
  problemNote: 'The offer below assumes we retail it. For a wholesale-only unit, base the offer on what a wholesaler would pay instead.',
  payoff: true,                  // shows payoff and the customer's equity
  customerCopy: true,            // a plain summary for the customer, without our numbers
  scout: true,

  // Glasses (glasses.js): photo of the door sticker or dash, and coaching before Simon goes back to the desk
  glasses: {
    kind: 'photo',
    title: 'Glasses photo',
    intro: 'Photo of the door jamb sticker or the dash on the glasses, then pick it here. It fills in the VIN and miles so you can open SCOUT before the scanner is even plugged in.',
    pick: 'Pick glasses photo',
    prompt: 'You are helping the salesman at Little Country Cars, a small used truck lot in Lincoln, Nebraska, value a customer\u2019s trade-in. The photos are from his smart glasses: the door jamb sticker, VIN plate, or the dash. Read the VIN only if every character is clear. Read the miles from the odometer. Note any warning lights on the dash or damage you can see.',
    coachBtn: 'Coach me on this number',
    coachPrompt: 'You coach the salesman at Little Country Cars, a small used truck lot in Lincoln, Nebraska. Our style is low-key and conversational: a handshake, not a sales pitch. Be honest with the customer; never invent problems, never pressure, never talk down their vehicle beyond what the scan found. Help him present the trade number so it makes sense to the customer: tie it to what the scan and drive actually found and what it takes to make the vehicle front-line ready. Keep it short and practical; he reads it on his phone or hears it in his ear before walking back to the desk.'
  },

  destination: 'phone',
  keepDays: 30,
  keepOptions: [8, 30, 90]
};
