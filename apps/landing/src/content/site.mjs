// Company facts used across the site. Every fact here is published by Serene Insurance:
//   sereneinsurance.com home page (phone, WhatsApp), /contacts (office hours, email),
//   /contacts/branches (head office address), /sections/pages/company-profile (dates, licence,
//   capitalisation, First Sky Group), /sections/pages/who-we-are (vision, values, reinsurers, claim
//   principle, shareholders and capital raised). Fetched again on 2026-11-06.
// Note for Serene: the site footer shows info@sereneinsurance.com.gh, while /contacts and
// /contacts/branches show info@sereneinsurance.com. The latter is used; please confirm.

export const COMPANY = {
  name: 'Serene Insurance',
  legalName: 'Serene Insurance Company Limited',
  incorporated: '21 July 2016',
  commencement: '4 April 2018',
  fullOperations: 'September 2018',
  group: 'First Sky Group',
  shareholders: 'First Sky Construction and Volta Serene Hotel',
  capital: 'GH₵ 59 million raised against the National Insurance Commission’s GH₵ 50 million requirement',
  licence:
    'Licensed by the National Insurance Commission to carry out general (non-life) insurance business in Ghana.',
  vision:
    'Our ambition is to be the leading model for delivering value all the time in the insurance industry.',
  values: ['Teamwork', 'Integrity', 'Customer focus'],
  claimPrinciple:
    'No outstanding claim should stand in our books one week after receiving the last documents from the claimant.',
  reinsurers: ['Ghana Re', 'African Re', 'WAICA Re', 'Mainstream Re', 'GN Re'],
};

export const CONTACT = {
  phoneDisplay: '030 291 7444',
  phoneRange: '030 291 7444 to 7446',
  phoneTel: '+233302917444',
  whatsappDisplay: '050 051 7114',
  whatsappUrl: 'https://wa.me/233500517114',
  email: 'info@sereneinsurance.com',
  headOffice: {
    line1: '4th Floor, SU Tower',
    line2: 'No. 18 Castle Road, Ridge, Accra',
  },
  // Source: sereneinsurance.com /contacts ("Business Hours").
  hours: [
    ['Monday to Friday', '9am to 5pm'],
    ['Saturday', '9am to 2pm'],
    ['Sunday', 'Closed'],
  ],
};

export const mapsUrl = (address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * Main navigation: four dropdowns (desktop) that become accordions in the phone menu. Each menu
 * starts with its overview page, so the section is reachable in one tap even without the submenu.
 */
export const NAV = [
  {
    label: 'Personal',
    id: 'personal',
    links: [
      ['All personal insurance', '/insurance/#personal'],
      ['Motor insurance', '/insurance/motor/'],
      ['Travel insurance', '/insurance/travel/'],
      ['Home insurance', '/insurance/home/'],
      ['Personal accident', '/insurance/personal-accident/'],
      ['Fire & burglary', '/insurance/fire-and-burglary/'],
      ['Burglary (private premises)', '/insurance/burglary-home/'],
      ['Professional indemnity', '/insurance/professional-indemnity/'],
    ],
  },
  {
    label: 'Business',
    id: 'business',
    wide: true,
    links: [
      ['All business insurance', '/insurance/#business'],
      ['Motor and fleets', '/insurance/motor/'],
      ['Fire & special perils', '/insurance/fire/'],
      ['Business interruption', '/insurance/business-interruption/'],
      ['Public liability', '/insurance/public-liability/'],
      ['Workmen’s compensation', '/insurance/workmens-compensation/'],
      ['Group personal accident', '/insurance/group-personal-accident/'],
      ['Marine cargo', '/insurance/marine-cargo/'],
      ['Goods in transit', '/insurance/goods-in-transit/'],
      ['Contractors’ all risks', '/insurance/contractors-all-risks/'],
      ['Cyber crime', '/insurance/cyber/'],
      ['Bonds & guarantees', '/insurance/bonds/'],
    ],
  },
  {
    label: 'Claims',
    id: 'claims',
    links: [
      ['How to make a claim', '/claims/'],
      ['Documents for each claim', '/claims/#documents'],
      ['Unhappy with a decision', '/claims/#complaints'],
      ['Check a certificate', '/verify/'],
    ],
  },
  {
    label: 'About',
    id: 'about',
    links: [
      ['About Serene', '/about/'],
      ['Branches', '/branches/'],
      ['Contact us', '/contact/'],
      ['Help and questions', '/help/'],
      ['Proposal forms', '/downloads/'],
    ],
  },
];
