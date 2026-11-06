// Product pages. Catalogue fields (code, name, category, audience, purchase, summary) mirror PRODUCTS in
// packages/proposals/src/products.ts (snapshot 2026-11-06); keep them in step when that file changes.
// Cover wording follows Serene's own product pages where they exist:
//   sereneinsurance.com /sections/product_details/1 (motor), /2 (fire & allied perils, business
//   interruption), /4 (general accident: money, goods in transit, fidelity, burglary, bankers' indemnity,
//   professional indemnity, cyber), /5 (engineering), /7 (workmen's compensation), /8 (bonds),
//   /10 (marine cargo and hull), /12 (travel).
// Where Serene publishes nothing (pages 3, 6, 9 and 11 hold placeholder text), the wording describes the
// cover asked about on Serene's own proposal form. "Usually not covered" lists only standard exclusions
// found in Ghanaian policy wordings; the policy schedule and wording are what apply.

export const CATEGORY_LABELS = {
  motor: 'Motor',
  property: 'Home and property',
  travel: 'Travel',
  accident: 'Personal and group accident',
  liability: 'Liability',
  financial: 'Financial lines',
  engineering: 'Engineering',
  marine: 'Marine and transit',
  bonds: 'Bonds',
};

const WAR = 'War, invasion, civil war, and nuclear or radioactive contamination';
const DELIBERATE = 'Loss or damage you cause on purpose';
const WEAR = 'Wear and tear, gradual deterioration and mechanical or electrical breakdown';

export const PRODUCTS = [
  {
    code: 'MTR',
    slug: 'motor',
    name: 'Motor insurance',
    category: 'motor',
    audience: ['individual', 'business'],
    purchase: 'instant',
    summary:
      'Third party only, third party fire & theft, or comprehensive cover for private and commercial vehicles.',
    file: 'serene-motor-proposal-form.pdf',
    intro:
      'Every vehicle on a Ghanaian road must have at least third-party insurance under the Motor Vehicles (Third Party Insurance) Act, 1958. Serene sells all three levels of cover for private cars, taxis, ride-hailing cars, trotros, goods vehicles, motorcycles and tricycles.',
    covers: [
      '**Third party only:** injury or death of other people, and damage to their property up to GH₵ 8,000. Injury and death claims are paid up to the limits the National Insurance Commission sets.',
      '**Third party, fire & theft:** the above, plus loss of or damage to your vehicle by fire or theft.',
      '**Comprehensive:** the above, plus accidental damage from collision or overturning; fire, explosion, self-ignition or lightning; theft, burglary or housebreaking; malicious acts; flood, storm, hurricane, volcanic eruption or earthquake.',
      '**Extensions you can ask for:** emergency medical treatment for accident victims, cover for passengers and household members, personal accident cover for the policyholder or driver, towing and storage, tyre and windscreen replacement, car pooling, and driving a similar vehicle you do not own.',
    ],
    notCovered: [
      'Damage to your own vehicle under third party only cover',
      'Accident damage to your own vehicle under third party, fire & theft',
      'Anyone driving without a valid licence, or under the influence of drink or drugs',
      'Using the vehicle for a purpose your certificate does not allow, such as carrying fare-paying passengers on a private car policy',
      WEAR,
      'Tyres that were worn, rethreaded or recapped before the accident',
      WAR,
    ],
    whoFor:
      'Anyone who owns or drives a vehicle in Ghana, from a private car to a fleet of trucks. Companies insure their vehicles with the company’s TIN.',
    pricing: {
      basis:
        'Third party only is the NIC minimum tariff for your class of vehicle, so the online price is final. Third party, fire & theft and comprehensive add a percentage of the vehicle’s value; that price is indicative until an underwriter has seen your vehicle photos.',
    },
    faqs: [
      {
        q: 'Do I need a Ghana Card to buy motor insurance?',
        a: 'Yes. Since 1 January 2026 the National Insurance Commission requires a Ghana Card number to buy or renew motor insurance. Companies give their TIN. We check the number and a photo of your face with the National Identification Authority; we never ask for a photo of the card.',
      },
      {
        q: 'How do I insure a vehicle for less than a year?',
        a: 'Choose your own end date. Covers shorter than a year are charged on the short-period scale shown on this page, from 20% of the annual premium for one month.',
      },
      {
        q: 'Can I keep my no-claim discount from another insurer?',
        a: 'Yes. Upload the renewal notice from your previous insurer. We apply the discount once we have checked it.',
      },
      {
        q: 'Where is my electronic sticker?',
        a: 'Every policy is uploaded to the NIC Motor Insurance Database, which issues the electronic sticker. Anyone can check it by dialling *920*57#.',
      },
    ],
    claimTypes: ['motor_own_damage', 'motor_theft', 'motor_third_party_property', 'motor_third_party_injury'],
  },
  {
    code: 'TRV',
    slug: 'travel',
    name: 'Travel insurance',
    category: 'travel',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Emergency medical cover, evacuation and baggage protection, accepted for Schengen visas.',
    file: 'serene-travel-proposal-form.docx',
    intro:
      'Covers the costs of falling ill or getting hurt abroad, getting you home, and losing your bags. Our Schengen cover meets the visa requirement of at least EUR 30,000 for medical treatment and repatriation.',
    covers: [
      'Medical expenses from illness or bodily injury, up to EUR 30,000',
      'Hospitalisation, and repatriation to Ghana after treatment',
      'Repatriation of your body or ashes to Ghana',
      'Baggage loss or delay, up to EUR 210',
    ],
    notCovered: [
      'Treatment you planned before you left, or are travelling to receive',
      'Illness you already had and did not tell us about',
      'Trips longer than the dates on your certificate',
      'Losses you did not report to the airline, police or hotel at the time',
      WAR,
    ],
    whoFor:
      'Anyone travelling from Ghana for business, study, a visit or a holiday, alone or with family. Travellers over 80 are priced by an underwriter.',
    pricing: {
      basis:
        'Priced per traveller by destination zone, number of days and age, in euros and shown in cedis. The online price is indicative; VAT, NHIL and the GETFund levy are added as separate lines.',
    },
    zones: true,
    faqs: [
      {
        q: 'Will the embassy accept this for a Schengen visa?',
        a: 'Choose the Schengen and Europe zone. The certificate shows medical and repatriation cover of at least EUR 30,000, valid in every Schengen country for the whole stay, as the Visa Code requires.',
      },
      {
        q: 'Can I cover my children on the same policy?',
        a: 'Yes. Add each person travelling with you and their date of birth. Children under 18 are charged half the adult price.',
      },
      {
        q: 'What do I do if I fall ill abroad?',
        a: 'Call the assistance line printed on your certificate before you are admitted to hospital, unless it is an emergency. Keep every bill and medical report.',
      },
    ],
    claimTypes: ['travel_medical', 'travel_baggage'],
  },
  {
    code: 'HMF',
    slug: 'home',
    name: 'Home insurance (Home Flexible)',
    category: 'property',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Your house and everything in it, against fire, flood, burglary and more.',
    file: 'serene-home-flexible-proposal-form.pdf',
    intro:
      'One policy for the building, its contents, or both. You choose the sections you need on the form: buildings, contents, burglary, personal accident, glass, legal expenses and loss of rent.',
    covers: [
      'The building against fire, lightning, explosion, flood, storm and burst pipes',
      'Furniture, appliances and personal belongings in the home',
      'Theft following a break-in, if you add the burglary section',
      'Optional sections for personal accident, glass, pedal cycles, legal expenses and loss of rent',
    ],
    notCovered: [
      'Theft without forcible entry, unless the policy says otherwise',
      'Homes left empty for long periods without telling us',
      WEAR,
      DELIBERATE,
      WAR,
    ],
    whoFor: 'Homeowners, landlords and tenants. Tenants can insure their contents only.',
    pricing: {
      basis:
        'A percentage of the value of the building and contents you insure, with a minimum premium. Buildings and contents get an instant indicative price; the other sections are priced by an underwriter. VAT, NHIL and the GETFund levy are shown as separate lines.',
    },
    faqs: [
      {
        q: 'How much should I insure my house for?',
        a: 'The cost of rebuilding it today, not its market value or what you paid. If you have a valuation report, upload it.',
      },
      {
        q: 'Do I have to list everything I own?',
        a: 'No. Give the total value of your contents. An inventory helps if you ever claim, so upload one if you have it.',
      },
    ],
    claimTypes: ['property_damage', 'burglary_theft'],
  },
  {
    code: 'FIR',
    slug: 'fire',
    name: 'Fire & special perils',
    category: 'property',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'Buildings, contents, machinery and stock against fire, lightning, explosion and allied perils.',
    file: 'serene-fire-special-perils-proposal-form.pdf',
    intro:
      'Our standard fire policy covers loss of or damage to your property caused by fire, lightning and explosion of gas or boilers used for domestic purposes. It can be extended to the special perils most businesses in Ghana need.',
    covers: [
      'Buildings; furniture, fixtures and fittings; plant, machinery and equipment; office equipment; stock from raw materials to finished goods',
      'Removal of debris, and architects’, surveyors’ and consulting engineers’ fees after an insured loss',
      'Extensions: earthquake, windstorm, flood, explosion, riot, strike and civil commotion, bursting or overflowing of tanks and pipes, malicious damage, impact by vehicles and animals, and aircraft',
    ],
    notCovered: [
      'Perils you did not add as extensions',
      'Stock or property not declared on the schedule',
      WEAR,
      DELIBERATE,
      WAR,
    ],
    whoFor:
      'Property owners and businesses: shops, warehouses, factories, offices, schools, churches and landlords.',
    faqs: [
      {
        q: 'Does a fire policy cover flood or riot?',
        a: 'Not on its own. The standard policy covers fire, lightning and domestic gas or boiler explosion. Flood, storm, riot, burst pipes and the other special perils are added as extensions, and each one shows on your schedule.',
      },
      {
        q: 'Can I cover stock that goes up and down during the year?',
        a: 'Yes. Tell us the highest value you expect to hold. The underwriter can arrange a declaration basis for stock that varies.',
      },
    ],
    claimTypes: ['property_damage'],
  },
  {
    code: 'FBG',
    slug: 'fire-and-burglary',
    name: 'Fire & burglary',
    category: 'property',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'One policy for fire and break-in theft at your home or shop.',
    file: 'serene-fire-and-burglary-proposal-form.pdf',
    intro:
      'Combines fire cover for the building and contents with burglary cover for theft involving a break-in, so a small shop or home needs only one policy and one renewal date.',
    covers: [
      'Fire, lightning and explosion damage to the building and contents',
      'Theft of contents or stock following forcible and violent entry or exit',
      'Damage to the premises caused by the burglars',
    ],
    notCovered: [
      'Theft without signs of forcible entry or exit',
      'Theft by members of your household or staff',
      'Cash and valuables, unless listed on the schedule',
      WEAR,
      WAR,
    ],
    whoFor: 'Owners of homes, shops and small business premises who want fire and burglary in one policy.',
    faqs: [
      {
        q: 'What counts as forcible entry?',
        a: 'Visible damage to a door, window, lock, roof or wall where the thieves got in or out. Keep the damage as it is until we or the police have seen it.',
      },
    ],
    claimTypes: ['property_damage', 'burglary_theft'],
  },
  {
    code: 'BGP',
    slug: 'burglary-home',
    name: 'Burglary (private premises)',
    category: 'property',
    audience: ['individual'],
    purchase: 'underwriter',
    summary: 'Household contents against theft following forcible entry.',
    file: 'serene-burglary-private-premises-proposal-form.pdf',
    intro:
      'Covers the contents of your home against theft involving forcible and violent entry or exit, and the damage done getting in.',
    covers: [
      'Furniture, appliances, electronics and personal belongings stolen after a break-in',
      'Damage to doors, windows and locks caused by the burglars',
    ],
    notCovered: [
      'Theft without forcible entry or exit',
      'Theft by people living in the home, or by domestic staff',
      'Items left outside the building or in an open compound',
      'Homes left unoccupied for longer than the policy allows',
    ],
    whoFor: 'Homeowners and tenants who want burglary cover on its own.',
    faqs: [
      {
        q: 'Why do you ask for photos of my locks and burglar-proofing?',
        a: 'Security is the biggest factor in a burglary price. Photos let the underwriter price your home without a visit in most cases.',
      },
    ],
    claimTypes: ['burglary_theft'],
  },
  {
    code: 'BGB',
    slug: 'burglary-business',
    name: 'Burglary (business premises)',
    category: 'property',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Stock, equipment and fittings at your business premises against break-in theft.',
    file: 'serene-burglary-business-premises-proposal-form.pdf',
    intro:
      'Covers stock in trade, fixtures and similar property against theft involving forcible and violent entry or exit, and the damage caused to the point of entry.',
    covers: [
      'Stock in trade, fixtures, fittings and office equipment',
      'Damage to the premises caused by the burglars',
    ],
    notCovered: [
      'Theft without forcible entry or exit',
      'Theft by employees (see fidelity guarantee)',
      'Cash (see money insurance)',
      'Stock shortages found only at stocktaking',
    ],
    whoFor: 'Shops, warehouses, offices and workshops.',
    faqs: [
      {
        q: 'Will you need to visit my premises?',
        a: 'Sometimes, for larger stock values. Clear photos of the building, the shop floor and your security usually let the underwriter price it first.',
      },
    ],
    claimTypes: ['burglary_theft'],
  },
  {
    code: 'BIN',
    slug: 'business-interruption',
    name: 'Business interruption',
    category: 'property',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Lost gross profit and running costs while you recover from insured damage.',
    file: 'serene-business-interruption-proposal-form.pdf',
    intro:
      'Also called consequential loss. When a fire or other insured damage stops or slows your business, this pays what you lose while you get back on your feet. It sits alongside a fire policy.',
    covers: [
      'Loss of net profit',
      'Standing charges such as rent, taxes and loan interest',
      'Wages of employees you need to keep',
      'Increased costs of working to limit the disruption',
      'Optionally, losses caused by damage at a supplier’s or customer’s premises',
    ],
    notCovered: [
      'Interruption not caused by damage insured under your fire policy',
      'Losses beyond the indemnity period you choose',
      'Losses from a general fall in trade',
    ],
    whoFor:
      'Businesses that could not trade for weeks or months after a fire: factories, hotels, retailers, schools.',
    faqs: [
      {
        q: 'Do I need a fire policy as well?',
        a: 'Yes. Business interruption pays only when the damage is covered by a material damage policy such as fire and special perils.',
      },
      {
        q: 'What is the indemnity period?',
        a: 'The longest time after the damage that the policy pays for. Choose how long it would really take to rebuild and win your customers back, often 12 to 24 months.',
      },
    ],
    claimTypes: ['property_damage'],
  },
  {
    code: 'PAC',
    slug: 'personal-accident',
    name: 'Personal accident',
    category: 'accident',
    audience: ['individual'],
    purchase: 'instant',
    summary: 'Lump sums for accidental death or disability, plus medical expenses, 24 hours a day.',
    file: 'serene-personal-accident-proposal-form.pdf',
    intro:
      'Pays a lump sum if an accident kills or disables you, and helps with medical bills. Cover runs 24 hours a day, at work and at home.',
    covers: [
      'Accidental death',
      'Permanent total or partial disability, on the scale in the policy',
      'Temporary total disability: a weekly benefit while you cannot work',
      'Medical expenses after an accident, up to the limit you choose',
    ],
    notCovered: [
      'Illness or disease not caused by an accident',
      'Self-inflicted injury',
      'Injury while under the influence of alcohol or drugs',
      'Dangerous sports and activities you did not declare',
      WAR,
    ],
    whoFor: 'Adults who want their family protected if an accident stops them earning.',
    pricing: {
      basis:
        'A percentage of the capital sum you choose, set by the kind of work you do (office, manual, or hazardous). The online price is indicative; VAT, NHIL and the GETFund levy are added as separate lines.',
    },
    faqs: [
      {
        q: 'Who receives the money if I die?',
        a: 'The beneficiary you name on the proposal form. You can change the beneficiary at any branch.',
      },
    ],
    claimTypes: ['personal_injury'],
  },
  {
    code: 'GPA',
    slug: 'group-personal-accident',
    name: 'Group personal accident',
    category: 'accident',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Accident cover for your staff or members, priced as a group.',
    file: 'serene-group-personal-accident-proposal-form.docx',
    intro:
      'Personal accident cover for a whole workforce, association or church group under one policy, with benefits linked to each person’s salary or a fixed sum.',
    covers: [
      'Accidental death of a member',
      'Permanent and temporary disability',
      'Medical expenses after an accident',
    ],
    notCovered: [
      'Illness or disease not caused by an accident',
      'People not on the declaration list',
      'Self-inflicted injury',
      WAR,
    ],
    whoFor: 'Employers, associations, schools and churches.',
    faqs: [
      {
        q: 'Do I need to send names for everyone?',
        a: 'Yes: a declaration list of names, occupations and either salaries or sums insured. Type it into the form, or upload a spreadsheet or scan.',
      },
    ],
    claimTypes: ['personal_injury'],
  },
  {
    code: 'WCA',
    slug: 'workmens-compensation',
    name: 'Workmen’s compensation',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary:
      'Your legal liability for employees injured at work, under the Workmen’s Compensation Law, 1987.',
    file: 'serene-workmens-compensation-proposal-form.pdf',
    intro:
      'Indemnifies an employer for its legal liability to employees for occupational injury or disease. The Workmen’s Compensation Law, 1987 (PNDCL 187) and common law require employers to pay compensation when an employee is injured or killed in the course of and arising out of their employment.',
    covers: [
      'Compensation due under PNDCL 187 for injury or death at work',
      'Occupational disease',
      'Medical expenses, within the limits of the law and the policy',
      'Common-law liability, if you add it',
    ],
    notCovered: [
      'Employees not declared in the wage roll',
      'Injury from the employee’s own serious and wilful misconduct, where the law excludes it',
      'Contractors who are not your employees',
    ],
    whoFor: 'Every employer, from offices to construction sites and factories.',
    faqs: [
      {
        q: 'How is the premium worked out?',
        a: 'Compensation under PNDCL 187 depends on earnings, so the premium is a rate on your annual wage roll, set by the type of work each group of employees does.',
      },
    ],
    claimTypes: ['personal_injury'],
  },
  {
    code: 'PLI',
    slug: 'public-liability',
    name: 'Public liability',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Injury to members of the public or damage to their property caused by your business.',
    file: 'serene-public-liability-proposal-form.pdf',
    intro:
      'Pays compensation and legal costs if a member of the public is injured, or their property damaged, because of your premises or your work.',
    covers: [
      'Bodily injury to members of the public',
      'Damage to third-party property',
      'Legal costs of defending a claim, with our agreement',
    ],
    notCovered: [
      'Injury to your own employees (see workmen’s compensation)',
      'Damage to property you own or are looking after',
      'Liability you accept under a contract that you would not otherwise have',
      'Faulty work or products themselves',
    ],
    whoFor: 'Shops, hotels, restaurants, event organisers, schools, churches and contractors.',
    faqs: [
      {
        q: 'How much cover should I buy?',
        a: 'Enough for the worst injury claim you could face. Landlords and clients often state a minimum in their contracts.',
      },
    ],
    claimTypes: ['liability_claim'],
  },
  {
    code: 'GLI',
    slug: 'general-liability',
    name: 'General liability',
    category: 'liability',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Broad third-party liability for your premises, operations and products.',
    file: 'serene-general-liability-proposal-form.pdf',
    intro:
      'A wider liability policy for businesses whose risks go beyond their premises: work done at clients’ sites, products sold, and hazards such as waste handling.',
    covers: ['Premises and operations liability', 'Products liability, if you add it', 'Legal defence costs'],
    notCovered: [
      'Injury to your own employees',
      'Professional advice (see professional indemnity)',
      'Gradual pollution, unless the policy includes it',
      'Fines and penalties',
    ],
    whoFor: 'Manufacturers, distributors, contractors and service companies.',
    faqs: [
      {
        q: 'How is this different from public liability?',
        a: 'Public liability is mainly about your premises. General liability also looks at your operations away from your premises and the products you supply, so the form asks more about your work and hazards.',
      },
    ],
    claimTypes: ['liability_claim'],
  },
  {
    code: 'PIN',
    slug: 'professional-indemnity',
    name: 'Professional indemnity',
    category: 'liability',
    audience: ['individual', 'business'],
    purchase: 'underwriter',
    summary: 'Claims for negligence, errors or omissions in your professional services.',
    file: 'serene-professional-indemnity-proposal-form.pdf',
    intro:
      'Covers your legal liability to clients and third parties arising from your professional work. Serene’s own example: a medical officer sued for negligently prescribing the wrong drug.',
    covers: [
      'Compensation for negligent acts, errors or omissions in your professional services',
      'Legal costs of defending a claim',
    ],
    notCovered: [
      'Fraud or dishonesty',
      'Claims you knew about before the policy started',
      'Work outside the profession you declared',
      'Fines, penalties and contractual guarantees',
    ],
    whoFor:
      'Doctors, lawyers, accountants, engineers, architects, surveyors, consultants and IT firms. Some regulators and clients require it.',
    faqs: [
      {
        q: 'Does it cover work I did in earlier years?',
        a: 'Professional indemnity usually covers claims made during the policy year. Whether earlier work is included depends on the retroactive date in your schedule.',
      },
    ],
    claimTypes: ['liability_claim'],
  },
  {
    code: 'DNO',
    slug: 'directors-and-officers',
    name: 'Directors & officers liability',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Personal liability of directors and officers for wrongful acts in managing the company.',
    file: 'serene-directors-and-officers-proposal-form.pdf',
    intro:
      'Protects the personal assets of directors and officers when they are sued for a wrongful act in managing the company, and reimburses the company when it indemnifies them.',
    covers: [
      'Defence costs and damages for wrongful acts by directors and officers',
      'Company reimbursement where the company indemnifies its directors',
      'Investigations by regulators, where the policy includes them',
    ],
    notCovered: [
      'Fraud, dishonesty or criminal acts, once proven',
      'Personal profit the director was not entitled to',
      'Claims known before the policy started',
      'Fines and penalties that the law does not allow to be insured',
    ],
    whoFor: 'Boards of companies, banks, microfinance institutions and NGOs.',
    faqs: [
      {
        q: 'Why do you need audited accounts?',
        a: 'Serene’s D&O form requires the latest audited accounts. A company’s finances are the main driver of claims against its directors, so the underwriter cannot price without them.',
      },
    ],
    claimTypes: ['liability_claim'],
  },
  {
    code: 'CYB',
    slug: 'cyber',
    name: 'Cyber crime',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Data breaches, cyber extortion, funds-transfer fraud and the cost of getting back online.',
    file: 'serene-cyber-crime-proposal-form.pdf',
    intro:
      'Protects businesses from internet and IT risks. Serene’s cyber cover can include first-party losses, liability to others, and help in the hours after an attack.',
    covers: [
      'Data destruction, extortion, theft, hacking and denial-of-service attacks',
      'Liability to others for failing to protect data, errors and omissions, or defamation',
      'Security audits, public relations after an incident, investigation costs and criminal reward funds',
    ],
    notCovered: [
      'Weaknesses you knew about and did not fix',
      'Failure of power, internet or telecoms infrastructure you do not control',
      'Loss of value of crypto-assets',
      'Fines that the law does not allow to be insured',
    ],
    whoFor:
      'Banks, fintechs, hospitals, schools, retailers and any business that holds customer data or moves money online.',
    faqs: [
      {
        q: 'The form is long. Why?',
        a: 'The underwriter prices cyber by how well you protect your systems: backups, access control, outsourcing and card payments. The more complete your answers, the better the price.',
      },
    ],
    claimTypes: ['liability_claim', 'cash_loss'],
  },
  {
    code: 'FGT',
    slug: 'fidelity-guarantee',
    name: 'Fidelity guarantee',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Loss of money or goods through fraud or dishonesty by your employees.',
    file: 'serene-fidelity-guarantee-proposal-form.pdf',
    intro:
      'Reimburses employers for money or goods lost through fraud or dishonesty by employees in connection with their employment.',
    covers: [
      'Money and goods stolen or embezzled by a named employee or position',
      'Losses discovered during the policy period, up to the guaranteed amount',
    ],
    notCovered: [
      'Losses by an employee you already knew to be dishonest',
      'Losses from weak checks you agreed to keep in place but did not',
      'Losses discovered after the discovery period ends',
    ],
    whoFor:
      'Employers whose staff handle cash, stock or payments: cashiers, accountants, storekeepers, sales agents.',
    faqs: [
      {
        q: 'Do I insure named people or positions?',
        a: 'Either. The form lets you list employees by name or by position, with the amount guaranteed for each.',
      },
    ],
    claimTypes: ['cash_loss'],
  },
  {
    code: 'BBI',
    slug: 'bankers-indemnity',
    name: 'Bankers’ indemnity',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Cash, securities and fraud risks for banks, savings and loans, and microfinance companies.',
    file: 'serene-bankers-indemnity-proposal-form.docx',
    intro:
      'Indemnifies banks and other financial institutions for losses within stated limits, under clauses for employee infidelity, premises, transit, forgery, counterfeit currency, office damage, professional negligence and lost documents.',
    covers: [
      'Employee infidelity',
      'Cash and valuables on the premises and in transit',
      'Forged cheques, forged securities and counterfeit currency',
      'Damage to offices and contents',
      'Professional negligence and loss of documents, where included',
    ],
    notCovered: [
      'Trading and lending losses',
      'Losses above the limit for each clause',
      'Losses discovered after the policy ends, unless an extended discovery period applies',
    ],
    whoFor: 'Banks, savings and loans companies, microfinance institutions and rural banks.',
    faqs: [
      {
        q: 'Do you need our Bank of Ghana licence?',
        a: 'It is optional on the form but speeds things up. The underwriter will ask for the latest annual report or audited accounts in any case.',
      },
    ],
    claimTypes: ['cash_loss', 'liability_claim'],
  },
  {
    code: 'MNY',
    slug: 'money',
    name: 'Money insurance',
    category: 'financial',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Cash in transit, in the safe and on the premises, against robbery and theft.',
    file: 'serene-money-proposal-form.docx',
    intro:
      'Covers cash, bank notes, cheques and postal and money orders against accidental loss, damage or destruction, from any cause not specifically excluded, while in transit, on your premises during business hours, or in a locked safe or strong room.',
    covers: [
      'Money in transit to and from the bank',
      'Money on the premises during business hours',
      'Money in a locked safe or strong room, if you add it',
      'Damage to the safe or strong room in a robbery',
    ],
    notCovered: [
      'Shortages from errors in counting or accounting',
      'Theft by employees (see fidelity guarantee)',
      'Money left out of the safe outside business hours',
      'Amounts above the limit for each transit or for the safe',
    ],
    whoFor: 'Retailers, fuel stations, hospitals, schools, churches and anyone moving cash regularly.',
    faqs: [
      {
        q: 'What does the underwriter look at?',
        a: 'How much you carry at a time and how often, who carries it, how you travel, and the safe. Photos of the safe and how it is anchored are required if you insure money in a safe.',
      },
    ],
    claimTypes: ['cash_loss'],
  },
  {
    code: 'GIT',
    slug: 'goods-in-transit',
    name: 'Goods in transit',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Goods carried by road within Ghana, against accident, fire and theft.',
    file: 'serene-goods-in-transit-proposal-form.pdf',
    intro:
      'Indemnifies you for goods damaged or lost through fire, accident, or theft following an accident to the carrying vehicle, on journeys by road within Ghana.',
    covers: [
      'Fire and accident to the carrying vehicle',
      'Theft following an accident to the vehicle',
      'Goods in your own vehicles or a carrier’s',
    ],
    notCovered: [
      'Theft from an unattended vehicle',
      'Poor packing, and goods that spoil naturally',
      'Journeys outside Ghana (see marine cargo)',
      'Loads above the limit for any one vehicle',
    ],
    whoFor: 'Distributors, transporters, traders and manufacturers moving goods by road.',
    faqs: [
      {
        q: 'Can one policy cover a whole year of journeys?',
        a: 'Yes. Give your estimated annual carry and the most you put on one vehicle. The premium is based on those figures.',
      },
    ],
    claimTypes: ['cargo_loss'],
  },
  {
    code: 'MCG',
    slug: 'marine-cargo',
    name: 'Marine cargo',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Imports and exports by sea or air, single shipment or open cover.',
    file: 'serene-marine-cargo-questionnaire.pdf',
    intro:
      'Keeps your imports and exports safe against loss or damage, by sea, air and other freight. Since 1 February 2026 commercial imports into Ghana must be insured with a Ghanaian insurer under the Insurance Act, 2021 (Act 1061).',
    covers: [
      'Single covers: one policy per shipment, for occasional importers',
      'Open covers: one master policy with declarations for each shipment, for regular importers',
      'Institute Cargo Clauses A, B or C, as agreed',
    ],
    notCovered: [
      'Poor or unsuitable packing',
      'Delay, even if caused by an insured peril',
      'Inherent vice, ordinary leakage and loss of weight',
      'Insolvency of the ship owner or operator',
      WAR + ', unless added',
    ],
    whoFor: 'Importers, exporters and clearing agents.',
    faqs: [
      {
        q: 'What do you need before I ship?',
        a: 'The proforma or commercial invoice. Add the bill of lading or airway bill and packing list when you have them.',
      },
    ],
    claimTypes: ['cargo_loss'],
  },
  {
    code: 'MHL',
    slug: 'marine-hull',
    name: 'Marine hull',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Vessels and boats, their machinery and equipment.',
    file: 'serene-marine-hull-proposal-form.pdf',
    intro:
      'Covers vessels against perils of the sea, under Institute clauses, including loss or damage attributable to fire or explosion, stranding, grounding, sinking or capsizing, and collision or contact.',
    covers: [
      'Hull and machinery',
      'Fire or explosion',
      'Stranding, grounding, sinking or capsizing',
      'Collision or contact with another vessel or object',
      'Equipment and personal effects you list',
    ],
    notCovered: [
      'Lack of maintenance and wear and tear',
      'Use outside the navigation limits you declared',
      'An unseaworthy vessel that you knew about',
      WAR + ', unless added',
    ],
    whoFor: 'Owners of fishing vessels, passenger boats, tugs, barges and pleasure craft.',
    faqs: [
      {
        q: 'Do I need a survey?',
        a: 'Often, for larger or older vessels. If the vessel has been surveyed, the report is required with the proposal.',
      },
    ],
    claimTypes: ['other'],
  },
  {
    code: 'STV',
    slug: 'stevedores-liability',
    name: 'Stevedores’ liability',
    category: 'marine',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Liability for cargo and property in your care during loading and discharge.',
    file: 'serene-stevedores-liability-proposal-form.docx',
    intro:
      'For companies loading and discharging ships at Tema, Takoradi and other ports: pays for loss of or damage to cargo and property in your care, and injury to third parties, caused by your operations.',
    covers: [
      'Loss of or damage to cargo in your care during loading and discharge',
      'Damage to ships, quay equipment and other third-party property',
      'Injury to third parties',
    ],
    notCovered: [
      'Injury to your own employees (see workmen’s compensation)',
      'Liability you accept under a contract beyond what the law imposes, unless agreed',
      'Your own equipment (insure it under plant and machinery)',
    ],
    whoFor: 'Stevedoring companies and terminal operators.',
    faqs: [
      {
        q: 'Do you need our GPHA licence?',
        a: 'It helps. Upload your Ghana Ports and Harbours Authority stevedoring licence or permit if you have it.',
      },
    ],
    claimTypes: ['liability_claim', 'cargo_loss'],
  },
  {
    code: 'CAR',
    slug: 'contractors-all-risks',
    name: 'Contractors’ all risks',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Construction works, plant and third-party liability from groundbreaking to handover.',
    file: 'serene-contractors-all-risks-proposal-form.pdf',
    intro:
      'A package policy covering the risks a construction project faces. Section I covers property on site against sudden and unforeseen physical loss or damage from any cause not excluded. Section II covers your legal liability for injury and damage to third parties caused by the works.',
    covers: [
      'Section I: the contract works, materials, and construction plant and machinery on site',
      'Section II: third-party injury and property damage on or near the site',
      'Debris removal and professional fees after an insured loss',
    ],
    notCovered: [
      'Faulty design, materials or workmanship themselves (resulting damage may be covered)',
      'Penalties for delay or non-completion',
      WEAR,
      'Loss found only at stocktaking',
    ],
    whoFor: 'Building and civil-engineering contractors, developers and employers on construction contracts.',
    faqs: [
      {
        q: 'Who should buy it: contractor or employer?',
        a: 'Either, as the contract says. Both are usually named as insured.',
      },
    ],
    claimTypes: ['property_damage', 'liability_claim'],
  },
  {
    code: 'EAR',
    slug: 'erection-all-risks',
    name: 'Erection all risks',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Machinery and plant while being erected, installed and tested.',
    file: 'serene-erection-all-risks-proposal-form.pdf',
    intro:
      'All-risks cover for plant, machinery, equipment or steel structures during installation, including commissioning and testing, with third-party injury and property damage.',
    covers: [
      'The plant and steel structures being erected',
      'Erection equipment and construction plant',
      'Commissioning and testing, for the period agreed',
      'Third-party injury and property damage',
    ],
    notCovered: [
      'Faulty design, materials or workmanship themselves',
      'Testing beyond the agreed period',
      'Penalties for delay',
      WEAR,
    ],
    whoFor: 'Manufacturers, installers and owners of factories, power plants and telecoms installations.',
    faqs: [
      {
        q: 'Is the existing plant covered too?',
        a: 'Only if you tell us it keeps running during the work and the underwriter agrees. Plans of the existing plant are then required.',
      },
    ],
    claimTypes: ['property_damage', 'liability_claim'],
  },
  {
    code: 'EEI',
    slug: 'electronic-equipment',
    name: 'Electronic equipment',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Computers, servers, medical and office electronics against sudden damage and theft.',
    file: 'serene-electronic-equipment-proposal-form.pdf',
    intro:
      'Covers electronic and electrical systems, such as communication equipment, computers and other data processing equipment, against sudden physical loss or damage that needs repair or replacement.',
    covers: [
      'Sudden physical loss or damage from any cause not excluded',
      'Theft with forcible entry',
      'Optional: data media, and increased costs of working after a loss',
    ],
    notCovered: [
      WEAR,
      'Faults covered by a manufacturer’s warranty or maintenance contract',
      'Cosmetic damage that does not affect operation',
      'Loss of data unless you add data media cover',
    ],
    whoFor: 'Offices, hospitals and clinics, banks, radio and TV stations, and data centres.',
    faqs: [
      {
        q: 'Do I need serial numbers?',
        a: 'Yes. List each item with its serial number and replacement value. Photos of the serial plates and invoices help.',
      },
    ],
    claimTypes: ['property_damage'],
  },
  {
    code: 'PMB',
    slug: 'plant-and-machinery',
    name: 'Plant & machinery',
    category: 'engineering',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Contractors’ plant and machinery on site and in transit.',
    file: 'serene-plant-and-machinery-proposal-form.pdf',
    intro:
      'Covers excavators, graders, cranes, generators and other mobile plant against accidental damage, fire and theft, on site and moving between sites.',
    covers: [
      'Accidental damage, overturning and collision',
      'Fire, lightning and explosion',
      'Theft',
      'Transit between sites, where included',
    ],
    notCovered: [
      WEAR,
      'Damage to tyres, unless the machine is damaged at the same time',
      'Use on public roads (needs motor insurance)',
    ],
    whoFor: 'Construction, mining, quarrying and agricultural businesses.',
    faqs: [
      {
        q: 'Is this the same as motor insurance?',
        a: 'No. Plant that is driven on public roads also needs motor insurance for third-party liability.',
      },
    ],
    claimTypes: ['property_damage'],
  },
  {
    code: 'BND',
    slug: 'bonds',
    name: 'Bonds & guarantees',
    category: 'bonds',
    audience: ['business'],
    purchase: 'underwriter',
    summary: 'Bid, performance, advance mobilisation, customs and other bonds for contractors and importers.',
    file: 'serene-bonds-proposal-form.pdf',
    intro:
      'Serene issues bonds that guarantee your obligations to a client or to Customs. We assess your company, your track record and the contract before issuing, and you sign a counter-indemnity.',
    bondTypes: [
      ['Bid bond', 'Guarantees that you will not withdraw from a tender once submitted.'],
      ['Performance bond', 'Assures the client that you will carry out the contract.'],
      [
        'Advance mobilisation bond',
        'Assures the client that you will use the advance payment for the contract.',
      ],
      ['Transit bond', 'Guarantees duty to Customs on goods in transit through Ghana.'],
      ['Warehouse bond', 'Lets importers store goods before paying duty; pays Customs if you default.'],
      ['Re-export and export bonds', 'Cover duty if goods meant for re-export or export are sold in Ghana.'],
      ['Removal bond', 'Pays Customs if goods moved between locations do not arrive.'],
    ],
    covers: [],
    notCovered: [],
    whoFor:
      'Contractors bidding for public and private contracts, and importers and clearing agents dealing with Customs.',
    faqs: [
      {
        q: 'How long does a bond take?',
        a: 'Once we have the tender or contract, three years of audited accounts and the signed counter-indemnity, an underwriter usually decides within one working day. Large bonds may need more time.',
      },
      {
        q: 'What is a counter-indemnity?',
        a: 'Your written promise to repay Serene if we have to pay out under the bond. We may also ask for collateral, such as property with a valuation report and title.',
      },
    ],
    claimTypes: ['other'],
  },
];

export const productBySlug = (slug) => PRODUCTS.find((p) => p.slug === slug);
export const productByCode = (code) => PRODUCTS.find((p) => p.code === code);
