# Ghana insurance facts used by the online sales system (researched 2026-11-06)

Confidence: **verified** = primary source or two consistent reputable sources; **likely** = one good
source; **unverified** = market practice, shown to customers only as "indicative, subject to
underwriting". Every rate below is a configurable value in the admin portal (Products & rates), so
Serene's underwriters can correct it without a release.

## Before go-live (for Serene)

* Obtain the NIC circular for the 16 Feb 2026 motor tariff and confirm the current TPPD limit.
* Serene's own comprehensive and non-motor rate guide to replace the indicative defaults.
* Finance to confirm VAT/NHIL/GETFund treatment under the VAT Act 2025 (Act 1151).
* NIC licence number and Data Protection Commission registration number for the footer and certificates.
* An SMS provider account (Hubtel or Arkesel both offer OTP APIs) and a payment gateway (Hubtel or Paystack: MTN MoMo, Telecel Cash, AirtelTigo Money, cards). Until then both are simulated.

## Motor: third-party (TPO) minimum premiums, effective 16 Feb 2026 (likely, corroborated)

Priced by **class of use, not engine capacity** (cc bands were scrapped in the 2024 tariff).
Sources: InsureGhana 13 Feb 2026 (insureghana.net/insights-details/motor-insurance-premiums-adjusted-effective-16-february-2026), RMAS broker (rmasbroker.com/news/premium).

| Class | GH₵ / year |
|---|---|
| Private individual / private corporate | 557 |
| Taxi | 744 |
| Hiring / rental car | 744 |
| Mini bus / trotro, 12 seats | 919 |
| Trotro, 15 seats | 894 (as published) |
| Trotro, 23 seats | 1,194 |
| Maxi bus / coach (base) | 744 |
| Own goods (Z.300) | 761 |
| General cartage (Z.301) | 893 |
| Articulated / tankers | 1,052 |
| Ambulance / hearse (Z.802) | 733 |
| On-site vehicles (Z.801) | 431 |
| Agricultural / heavy GW1 class 1 / 2 / 3 | 607 / 744 / 920 |
| Motorcycle | 331 |
| Tricycle / aboboyaa / quadricycle | 431 |

* Extra seats: GH₵ 15 per seat above 5 (private individual, private corporate, ambulance/hearse); GH₵ 25 per extra seat for other classes.
* **TPPD limit: GH₵ 8,000** (GIA 2025 package, +33.33% from 6,000; InsureGhana Oct 2025; Enterprise and Unique sites). NIC's consumer page says a minimum of 7,000. Conflicting, so configurable; default 8,000.
* Comprehensive: market practice 5–7% of the insured value (unverified). Default 5%, never below the TPO premium for the class. Third party, fire & theft: no published rate; default 2.5% of value, never below TPO.
* Short period scale (unverified market scale): 1 mo 20%, 2 mo 30%, 3 mo 40%, 4 mo 50%, 5 mo 60%, 6 mo 70%, 7 mo 75%, 8 mo 80%, 9 mo 85%, over 9 mo 100%.
* ECOWAS Brown Card: included in the premium, no separate fee (likely). Brown Card certificates went digital around Dec 2025.
* NIC Motor Insurance Database (MID) since 1 Jan 2020: every policy is uploaded and gets an electronic sticker with a QR code; the public verifies with USSD `*920*57#`. Our certificate adds its own QR code to `/verify`.
* VAT: motor premiums are **exempt**.

## Law

* Motor Vehicles (Third Party Insurance) Act, 1958 (No. 42) is still in force and governs compulsory motor cover and the certificate. The Insurance Act, 2021 (Act 1061) repealed Act 724, not Act 42 (s.255 applies alongside Act 42). Certificates therefore keep the "Act 1958 (Ghana)" wording.
* Certificate contents: certificate no., policy no., index mark and registration, policyholder, effective date, expiry, persons entitled to drive, limitations as to use, certifying statement, authorised signature (as on Serene's sample certificate).
* Electronic Transactions Act 2008 (Act 772, amended by Act 838): electronic signatures are valid if linked to the signatory, under their control, and alterations are detectable. Insurance proposals are not excluded. We record the OTP-verified phone, IP address, timestamp and a SHA-256 hash of the submitted answers with the signature.
* Data Protection Act 2012 (Act 843): consent to processing before collection, separate unticked consent for marketing, privacy notice, timestamped consent records, DPC registration.
* Workmen's Compensation Law 1987 (PNDCL 187): compensation is earnings-based.

## Formats

* Ghana Card PIN `GHA-123456789-0` (also the individual's TIN since 1 Apr 2021). Company TIN: a letter + 10 digits.
* GhanaPost GPS `GA-543-0125` (region letter, district letter, 3–4 digits, 4 digits).
* Plates: `GR 1234-22` (2009–2025: region code + digits + year) and, from 1 Jan 2026, `GR 2224-AD` (DVLA zone code instead of year). Both accepted.
* Mobile prefixes: MTN 024/025/053/054/055/059; Telecel 020/050; AirtelTigo 026/027/056/057. Because of number portability the customer picks the MoMo network; we never infer it.

## Taxes on non-motor premiums

* Since 1 Jul 2025, VAT applies to non-life premiums except motor. From 1 Jan 2026 (Act 1151): 15% VAT + 2.5% NHIL + 2.5% GETFund on the same base = **20%**; the COVID levy is abolished (likely; finance to confirm). Shown as a separate line on quotes and receipts.

## Travel

* Schengen visas need at least **EUR 30,000** medical, emergency and repatriation cover valid in all Schengen states for the whole stay (Visa Code, Art. 15).
* Ghanaian insurers quote by **zone** (Africa; Schengen/Europe; Worldwide excl. USA/Canada; Worldwide incl. USA/Canada), **duration band** and **age band**. Indicative grids are configurable (bands: 1–7, 8–15, 16–21, 22–31, 32–45, 46–62, 63–92, 93–180, 181–365 days; under 18 at 50%; 66–75 +75%; 76–80 +150%; over 80 referred).

## Indicative non-motor rates (unverified; "indicative, subject to underwriting")

| Line | Basis | Default |
|---|---|---|
| Fire & special perils | % of sum insured | 0.15%, min GH₵ 500; allied perils +0.05% |
| Home (buildings / contents) | % of sum insured | 0.10% / 0.35%, min GH₵ 250 |
| Personal accident | % of capital sum by occupation class | I clerical 0.20%; II non-clerical 0.35%; III hazardous 0.75% |
| Burglary | % of contents | 0.50%, min GH₵ 300 |
| Goods in transit | % of annual carry | 0.50% |
| Money | % annual carry + % in-safe limit | 0.15% + 1.5% |
| Public liability | % of limit | 0.50%, min GH₵ 500 |
| Workmen's compensation | % of wage roll | 0.5% clerical / 2% manual / 4% construction |
| Contractors' all risks | % of contract value | 0.25% |
| Bid / performance / advance payment bonds | % of bond | 1% flat (min 300) / 1.5% p.a. / 2% p.a. |

## Serene's legacy portal (serene.sibapps.com, BIC Technologies)

Sells motor (new and renewal), travel, personal accident and home owners online, with SMS
verification codes, an online claim form (product, policy no., branch, registration no., details,
uploads) and help via SMS 7420. Numbers seen on its documents: customer `USR00962`, policy
`SE24MTP91228-E`, certificate `C04-24-89549`. Serene's issued policies (MG Management Consult
samples) use `AAGPAC0000802600` / `AAWCAC0000882600`.

## Identity checks (KYC) and supporting documents

* **L.I. 2523, National Identity Register (Amendment) Regulations, 2026** (in force 9 Jun 2026; enforcement from
  2 Nov 2026): organisations, insurers included, may not request, reproduce or keep a photocopy, scan or image
  of the Ghana Card; identity must be confirmed biometrically against the chip or the National Identity
  Register (fines 500–2,000 penalty units). Sources: afriwise.com (30 Jul 2026), ghanaiantimes.com.gh (2 Nov 2026). **Verified.**
  → Our forms collect the Ghana Card **number** and a **live face photo**; Serene runs the NIA check and records
  the result (status, NIA reference) on the customer in the admin portal. No card images anywhere.
* **NIC directive (17 Dec 2025, effective 1 Jan 2026):** Ghana Card mandatory to buy or renew motor insurance;
  companies give their TIN (graphic.com.gh). **Verified.**
* Anti-Money Laundering Act, 2020 (Act 1044) and the NIC/FIC AML/CFT guidelines: customer due diligence;
  for companies, incorporation documents, TIN, directors/signatories (each NIA-verified), beneficial owners.
* Foreign nationals without a Ghana Card: passport bio page (not covered by L.I. 2523).
* Supporting documents follow Serene's own forms: motor NCD renewal notice; vehicle photos and registration
  document for comprehensive and fire & theft (the roadworthy certificate is optional, DVLA issues it after
  insurance); passport page for travel; bonds: signed contract, 3 years' audited accounts, counter-indemnity,
  collateral evidence; CAR/EAR: plans, bills of quantities, plant lists; marine hull: survey report; D&O:
  audited accounts (mandatory on the form). Since 1 Feb 2026 commercial imports must be insured locally
  (Act 1061 s.222).

## Legacy portal details (public pages only)

* SibaDigital/SIBAGEN white-label by BIC Technologies (ASP.NET MVC). Product codes: MP01 comprehensive, MP02 third
  party only, MP03 third party fire & theft, FP01 home owners, PA001 personal accident, TV001 travel.
  Office codes: AC head office, AE Accra East, BR03 Lapaz, BR04 Community 11, BR05 Kumasi Main, BR06 Accra West,
  BR07 Ho, BR08 Community 25, TL Tamale, KS Kasoa, CH Techiman, TK Takoradi, SM Kumasi North.
* Motor quote fields: use, cc, seats, engine type (ICE/EV), registration year, year of manufacture, start date
  (end = start + 1 year − 1 day), value (not for TPO), extra TPPD, buy-back excess. Insurance period 1–8 or 12 months.
  Travel: single/multiple trip; categories World Economy, Europe/Schengen, Student, World Pearl; dependants
  under 18. PA: nature of work Clerical / Non-clerical / Offshore. Payment: Hubtel checkout (MoMo, card).
  NIC MID sticker and ECOWAS Brown Card are generated through a MID integration.
* **Security problems seen in its public JavaScript** (for Serene to act on, not to be carried over): hard-coded
  NIC MID API credentials and token, an exposed Slydepay merchant key and a third-party API key, passwords
  MD5-hashed in the browser, and a renewal lookup that appears to return a policyholder's details for any
  vehicle registration number without signing in.
