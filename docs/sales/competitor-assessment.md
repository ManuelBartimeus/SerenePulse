# Competitor assessment and what Serene's site adopts (2026-11-06)

Sites reviewed: Star Assurance, SIC, Glico General, Enterprise, Hollard, Ghana Union Assurance,
Vanguard, Phoenix (and its snap.insure app), Sanlam Allianz General. Full teardown notes are in the
session record; this file keeps the conclusions and the decisions taken.

## Where the market is

* Only Phoenix (snap.insure), Star and Vanguard let a member of the public get a price and pay online.
  Everyone else's "Get a quote" is a call-back form. Phoenix's flow is the best: phone + 6-digit code
  sign-in, price before personal details, NIC class picker, Ghana Card checked with NIA, MoMo/card via
  Paystack, certificate and digital sticker on payment.
* Outside motor and travel, nobody sells end to end online; Star sends every other product to a chatbot.
* Claims: Star and SIC publish the best guidance (procedure, who can claim, time limits, document
  checklists per claim type); Enterprise promises same-day payout under GH₵ 7,500; almost nobody shows
  claim status to the customer.
* Nobody shows how to verify a motor certificate (NIC's `*920*57#`), and stated TPPD limits contradict
  each other (GH₵ 5,000 to 8,000).
* Recurring defects: counters showing "0", empty galleries, dead "#" links, stale copyright years,
  injected spam links (Phoenix), agents' personal data exposed (SIC), pinch-zoom disabled (Star),
  pop-up overload (Glico, Enterprise), US +1 as default country code.

## Adopted for Serene

| Idea | Seen best at | Where it lives |
|---|---|---|
| Phone + one-time code sign-in, no password | Phoenix | `/account` |
| Price first, details later (quick quote on the home page, no sign-in) | Phoenix | Home hero, `/insurance/motor` |
| Vehicle class picker in plain words, mapped to the NIC tariff | Phoenix | Quick quote, motor proposal |
| "What each cover pays for" comparison (third party / fire & theft / comprehensive) | Phoenix, Sanlam | Home, motor page |
| Certificate on payment, downloadable any time, verifiable by QR | Phoenix, Star | `/account`, `/verify` |
| MoMo first (MTN MoMo, Telecel Cash, AirtelTigo Money) and card | Star, Phoenix | Checkout (simulated until a gateway is connected) |
| Short-period motor cover | Phoenix | Motor proposal (short-period scale) |
| Ghana Card number + face photo checked with NIA, never a card photo | Phoenix (L.I. 2523) | Every proposal |
| One-tap renewal | Enterprise | `/account` |
| Online claim with per-type document checklist and visible status | Phoenix, Star | `/account`, admin Claims |
| Full claims guidance page | Star, Hollard | `/claims` |
| Get a quote / Cover details / Make a claim on every product card | Enterprise | Product cards |
| Plain "what's covered / not covered / who it's for / documents" product pages | Sanlam | `/insurance/<product>` |
| Agent/broker field at checkout | Phoenix | Proposal declaration |
| Branch finder by region with search, map links, phone, email | SIC, Glico | `/branches` |
| Public certificate check + NIC `*920*57#` | gap | `/verify` |
| A stated TPPD limit (GH₵ 8,000) and a "from GH₵ 557" third-party price | gap | Motor page, quick quote |
| Downloadable paper proposal forms for brokers and corporates | SIC, Phoenix | `/downloads` |
| WhatsApp as a channel | Hollard, Glico, SIC | Header, contact, claims |

## Deliberately not adopted

* **Gallery page.** Only Sanlam keeps one current; Phoenix's is empty. Serene has no photo library
  to keep one alive, and a stale gallery costs trust. Photos belong in About.
* **News page.** No content source; same-day-dated or stale news hurts more than none. Add when
  Serene has a publishing routine.
* Chatbot personas, pop-up lead forms, promo sliders, award banners, counters, testimonials (none are
  available to quote truthfully), a mobile-app banner (Serene's app is not confirmed live), USSD buying
  (needs a telco shortcode agreement).
* Identity-first quote forms and call-back "quotes".
