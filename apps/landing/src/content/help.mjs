// Help centre answers. Facts come from docs/sales/architecture.md (sign-in codes, files, payments,
// certificates, quote validity) and packages/proposals/src/kyc.ts (identity check, L.I. 2523).
// Test-mode wording: payments and SMS are simulated until Serene connects a gateway and an SMS account.

export const HELP = [
  {
    id: 'buying-online',
    title: 'Buying online',
    items: [
      {
        q: 'Which policies can I buy online?',
        a: [
          'All 28 of our products have an online proposal form. Motor, travel, home and personal accident get a price straight away. Everything else is priced by an underwriter, usually within one working day, and you pay online once you accept the price.',
        ],
      },
      {
        q: 'Do I need to sign in to get a price?',
        a: [
          'No. Use the quick quote on the home page for motor and travel. You sign in with your phone number only when you continue to the proposal form.',
        ],
      },
      {
        q: 'How long is a quote valid?',
        a: ['30 days from the day it is issued, unless the quote says otherwise.'],
      },
      {
        q: 'Can my agent or broker still handle my policy?',
        a: [
          'Yes. Enter their name in the “Agent or broker” box on the declaration page, or ask them to submit the paper proposal form for you.',
        ],
      },
    ],
  },
  {
    id: 'sign-in',
    title: 'Signing in',
    items: [
      {
        q: 'How do I sign in?',
        a: [
          'Enter your Ghana mobile number. We send a 6-digit code by SMS. Type it in within 5 minutes. There is no password to remember.',
          'You can ask for a new code after 30 seconds. After 5 wrong attempts the code stops working and you need a new one.',
        ],
      },
      {
        q: 'Why does the screen show my code?',
        a: [
          'While we are connecting our SMS provider, the sign-in page runs in test mode and shows the code on screen in a labelled banner instead of sending an SMS.',
        ],
      },
      {
        q: 'How long do I stay signed in?',
        a: [
          'Up to 30 days on the same device, or 7 days if you do not use it. Sign out on shared phones and computers.',
        ],
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    items: [
      {
        q: 'How can I pay?',
        a: ['MTN MoMo, Telecel Cash, AirtelTigo Money, or a debit or credit card.'],
      },
      {
        q: 'Is online payment live?',
        a: [
          'Not yet. Online checkout is in test mode while we connect our payment provider. No money is taken in test mode, and a policy issued from a test payment is not valid cover. To buy cover today, pay at any branch or through your agent or broker.',
        ],
      },
      {
        q: 'Do you keep my card details?',
        a: [
          'No. We keep only the last four digits of a card, or a masked MoMo number, as a record of the payment.',
        ],
      },
      {
        q: 'Why is there VAT on my quote?',
        a: [
          'Since 2025, VAT applies to general insurance premiums other than motor. Quotes show VAT, the NHIL and the GETFund levy as separate lines. Motor insurance is exempt.',
        ],
      },
    ],
  },
  {
    id: 'identity',
    title: 'The identity check',
    items: [
      {
        q: 'Why do you need my Ghana Card number?',
        a: [
          'Insurers must confirm who their customers are under the Anti-Money Laundering Act, 2020 (Act 1044). For motor insurance, the National Insurance Commission requires a Ghana Card from 1 January 2026.',
        ],
      },
      {
        q: 'Why don’t you ask for a photo of my Ghana Card?',
        a: [
          'The National Identity Register (Amendment) Regulations, 2026 (L.I. 2523) do not allow insurers to request, copy, scan or keep images of the Ghana Card. Instead, you give us the card number and take a live photo of your face. Serene checks both with the National Identification Authority.',
          'Foreign nationals without a Ghana Card upload the photo page of their passport instead.',
        ],
      },
      {
        q: 'How do I take a good face photo?',
        a: [
          'Face the camera in good light, without a hat or sunglasses, against a plain background. Use your phone’s front camera when the form asks.',
        ],
      },
      {
        q: 'What if I am buying for a company?',
        a: [
          'Upload the certificate of incorporation or business registration, and give the Ghana Card number and a face photo of the person signing for the company.',
        ],
      },
    ],
  },
  {
    id: 'documents',
    title: 'Documents and photos',
    items: [
      {
        q: 'What files can I upload?',
        a: ['Photos and PDFs, up to 10 MB each. Photos taken with a phone camera are fine.'],
      },
      {
        q: 'Which documents does my product need?',
        a: [
          'Each product page lists them under “Documents you’ll need”, marked required or optional. The form only asks for the ones that apply to your answers.',
        ],
      },
      {
        q: 'Can I fill in a paper form instead?',
        a: [
          'Yes. Download it from the proposal forms page, fill it in, and take it to any branch or send it through your broker.',
        ],
      },
    ],
  },
  {
    id: 'renewals',
    title: 'Renewals',
    items: [
      {
        q: 'How do I renew?',
        a: [
          'Sign in and choose Renew on the policy. We copy your answers into a new proposal with the dates moved on, so you only check what has changed, sign and pay.',
        ],
      },
      {
        q: 'Will my no-claim discount carry over?',
        a: ['Your renewal price includes any no-claim discount you have earned on the policy.'],
      },
    ],
  },
  {
    id: 'claims',
    title: 'Claims',
    items: [
      {
        q: 'How do I make a claim?',
        a: [
          'Sign in, open the policy and choose Make a claim, or contact any branch, call us, or message us on WhatsApp. The claims page lists the documents for each type of claim.',
        ],
      },
      {
        q: 'How quickly do you pay?',
        a: [
          'Our claim principle is that no outstanding claim should stay in our books more than one week after we receive the last document from you.',
        ],
      },
      {
        q: 'Can I see where my claim is?',
        a: [
          'Yes. Claims made online show their status in your account: received, being assessed, we need more from you, approved, or paid.',
        ],
      },
    ],
  },
  {
    id: 'certificates',
    title: 'Certificates',
    items: [
      {
        q: 'When do I get my certificate?',
        a: [
          'As soon as payment is confirmed. Download it from your account at any time; we also email it if you gave an email address.',
        ],
      },
      {
        q: 'How can a police officer or garage check my certificate?',
        a: [
          'They can scan the QR code on the certificate, or enter the certificate number on our verify page. For motor, the NIC electronic sticker can also be checked by dialling *920*57#.',
        ],
      },
    ],
  },
  {
    id: 'cancellations',
    title: 'Changes and cancellations',
    items: [
      {
        q: 'Can I cancel a proposal before paying?',
        a: ['Yes. Open it in your account and choose Cancel. Nothing is charged.'],
      },
      {
        q: 'Can I cancel a policy?',
        a: ['Yes. Contact your branch. Any refund is worked out as set out in your policy wording.'],
      },
      {
        q: 'How do I change my vehicle, address or phone number?',
        a: [
          'Update your profile in your account for contact details. For changes to the cover, such as a new vehicle, contact your branch.',
        ],
      },
    ],
  },
  {
    id: 'data',
    title: 'Your data',
    items: [
      {
        q: 'What do you do with my information?',
        a: [
          'We use it to assess, issue and administer your insurance and to handle claims, under the Data Protection Act, 2012 (Act 843). We do not sell it. Read the privacy notice for the full detail.',
        ],
      },
      {
        q: 'Will you send me marketing messages?',
        a: [
          'Only if you tick the separate marketing box. You can change your mind at any time in your profile.',
        ],
      },
    ],
  },
];
