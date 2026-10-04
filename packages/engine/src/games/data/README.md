# Decision Lab data

Static subsets used by the Mail Sorter, Switchboard, Checkpoint and SMS Inbox tasks, built by `research/lab/fetch.py` and `research/lab/inbox.py`.

| File | Source | Licence |
| --- | --- | --- |
| `sms.json` | [SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection), UCI Machine Learning Repository | CC BY 4.0 |
| `bfcl.json` | [Berkeley Function Calling Leaderboard v3](https://gorilla.cs.berkeley.edu/leaderboard.html), `multiple` and `live_multiple` | Apache-2.0 |
| `paysim.json` | [PaySim](https://www.kaggle.com/datasets/ealaxi/paysim1), a simulated mobile-money dataset | CC BY-SA 4.0 |
| `inbox.json` | ArcadeBench generator (`research/lab/inbox.py`) plus real messages from the [SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection) | CC BY 4.0 (generated part, by ArcadeBench; real part, UCI) |

The PaySim subset is a derivative of PaySim and is shared under CC BY-SA 4.0.

## SMS Inbox

`inbox.json` holds 3,224 rows of `[sender, text, type]`, plus a spending category for expenses. `inbox.stats.json` is written by the generator with the per-class and per-category counts below.

**Method.** The generator is plain Python (standard library, fixed seed), so the file is reproducible and no model wrote any message. 2,654 messages are generated from about 355 hand-written templates modelled on real Indian and US messages: bank, card, UPI and wallet alerts from 14 Indian and 12 US banks, OTPs from banks, apps and government services, bills and due reminders, delivery updates, security, appointment and travel notices, marketing, and scams. Each template is filled from tables of banks, merchants, people, amounts, dates, references and senders, with noise (casing, double spaces, typos, clipped links). Expenses take their category from a merchant table of about 20 merchants per category and region. The other 570 rows are real: 340 `personal` messages (UCI ham, filtered to drop anything promotional, transactional or adult) and 230 `spam` messages (UCI spam with a clear scam or premium-rate cue), read through the same filtered pool as `sms.json`.

**Hard cases.** 466 rows (14.5%) are written to be tricky and carry one unambiguous label each: promos that mention an OTP or a code; scams that imitate bank alerts, KYC notices, parcel fees or refunds; refunds, cashback and reversed transactions (income); credit card bill payments (expense, bills) against bill due reminders (bill); money sent to a person (expense, transfer) against money received (income); failed transactions with no money moved (alert); delivery messages that ask for a payment on delivery or give a pickup or handover code (delivery).

**Labelling rules.** `otp`: a code to authenticate or confirm. `expense`: money out, including card payments, UPI and wallet debits and money sent to a person. `income`: money in, including salary, refunds, cashback, reversals and money received. `bill`: a bill generated or a payment due reminder. `delivery`: order, parcel or pickup updates. `alert`: security and login notices, appointments, travel or booking changes, failed or declined payments. `personal`: a message from a person. `promo`: legitimate marketing. `spam`: scams, phishing, lottery, fake KYC. Expense categories: `food` (dining and food delivery), `groceries`, `shopping`, `transport` (cabs, fuel, metro, parking), `travel` (flights, trains, hotels, car rental), `bills` (utilities, phone, broadband, rent, insurance, credit card payments), `entertainment`, `health`, `transfer` (money sent to a person), `other` (cash withdrawals, fees, donations, services).

**Coherence.** Every generated message has a domain, and a template only runs for senders of its domain. Senders come from pools by kind: bank (retail bank with checking against card issuer: Discover and American Express never send checking, deposit, Zelle, ATM or debit text), wallet and BNPL, hospital, clinic, dental, garage, airline, train, hotel, online travel agency, telecom, each utility, insurer, e-commerce, store, grocery, food app, restaurant and pharmacy. Brands send from brand headers or 5 to 6 digit short codes, never from a personal-looking number; only scams and the real UCI messages use phone numbers.

**Quality gates.** The generator fails the build if any of these break: exact and near-duplicate removal on normalised text (letters only, case folded, three-word shingles at 0.85 Jaccard), a total between 2,500 and 3,500, no class under 6%, exactly one category on every expense and none elsewhere, no label word in a text (`expense`, `income`, `spam`, `promo`, and an expense's own category name), a hard share between 12% and 18%, no single template above 5% of its class (the sampler enforces the same cap), at least 25 generated templates in every class that has generated rows, at least 40 rows and 15 merchants per category, and the coherence rules: each sender is in the pool of its domain, text cues (vaccination, dental, flights and fares, hotel stay, premium, electricity, broadband, postpaid, rent, cart, in-store, pharmacy, SIM, train, groceries) only appear for matching domains, card issuers never send checking-account text, and no brand sender looks like a personal phone number.

| Class | Rows | Templates | Senders | Merchants | Hard |
| --- | --: | --: | --: | --: | --: |
| otp | 330 | 40 | 285 | 22 | 0 |
| expense | 544 | 47 | 362 | 289 | 84 |
| income | 300 | 38 | 229 | 25 | 97 |
| bill | 300 | 37 | 261 | 72 | 25 |
| delivery | 300 | 37 | 232 | 40 | 55 |
| alert | 320 | 52 | 290 | 80 | 40 |
| personal | 340 | UCI | 176 | – | 0 |
| promo | 330 | 47 | 304 | 88 | 69 |
| spam | 460 | 50 + UCI | 455 | – | 96 |

Expense categories: food 62, groceries 56, shopping 60, transport 56, travel 52, bills 60, entertainment 48, health 48, transfer 62, other 40.

**Known limitations.** Generated messages share templates, so a model can learn a template family, and the near-duplicate gate cannot tell two merchants in one template apart. Senders carry some signal (scam senders are mostly phone numbers, real ones mostly brand headers), as in a real inbox. The real part comes from 2003 to 2012 and is mostly British and Singaporean, so `personal` and UCI `spam` read differently from the generated Indian and US messages. Text is English only, with some transliterated Indian languages in `personal`. Merchants and brands are real names used only to make the text realistic; no message is a real person's. Category labels follow the rules above, so a mixed merchant (a supermarket that also sells clothes) is avoided rather than judged.
