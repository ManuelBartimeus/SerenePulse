// Motor facts. Third-party premiums are DEFAULT_RATES.motor.tpo in packages/proposals/src/rating.ts:
// the National Insurance Commission's minimum third-party tariff effective 16 February 2026
// (InsureGhana, 13 Feb 2026; RMAS broker). Staff can change the live rates in the admin portal; the
// quick quote always uses the live ones. TPPD limit: setting sales_tppd_limit (8,000), from the GIA 2025
// package. See docs/sales/research-ghana-insurance.md.

export const TARIFF_DATE = '16 February 2026';
export const TPPD_LIMIT = 8000;

/** [label, annual GH₵, note] in the order of MOTOR_CLASSES. */
export const TPO_TARIFF = [
  ['Private car (individual or company)', 557, 'Includes 5 seats. GH₵ 15 for each extra seat.'],
  ['Taxi', 744, 'Includes 5 seats. GH₵ 25 for each extra seat.'],
  [
    'Hiring, rental and ride-hailing (Uber, Bolt, Yango)',
    744,
    'Includes 5 seats. GH₵ 25 for each extra seat.',
  ],
  ['Minibus or trotro, up to 12 seats', 919, ''],
  ['Trotro, 13 to 15 seats', 894, 'As published by the NIC.'],
  ['Trotro, 16 to 23 seats', 1194, 'Buses over 23 seats are priced by an underwriter.'],
  ['Goods vehicle, own goods (Z.300)', 761, ''],
  ['Goods vehicle, general cartage (Z.301)', 893, 'Carrying other people’s goods for payment.'],
  ['Articulated truck or tanker', 1052, ''],
  ['Ambulance or hearse (Z.802)', 733, 'GH₵ 15 for each seat above 5.'],
  ['Motorcycle', 331, ''],
  ['Tricycle, aboboyaa or quadricycle', 431, ''],
];

/** Short-period scale (DEFAULT_RATES.shortPeriod): share of the annual premium. */
export const SHORT_PERIOD = [
  ['Up to 1 month', '20%'],
  ['2 months', '30%'],
  ['3 months', '40%'],
  ['4 months', '50%'],
  ['5 months', '60%'],
  ['6 months', '70%'],
  ['7 months', '75%'],
  ['8 months', '80%'],
  ['9 months', '85%'],
  ['10 to 12 months', '100%'],
];

/** What each cover pays for. Source: sereneinsurance.com /sections/product_details/1. */
export const COVER_ROWS = [
  ['Injury or death of other people', true, true, true],
  [`Damage to other people’s property, up to GH₵ 8,000 (you can buy a higher limit)`, true, true, true],
  ['Your vehicle if it is stolen', false, true, true],
  ['Your vehicle if it catches fire', false, true, true],
  ['Damage to your vehicle in an accident (collision or overturning)', false, false, true],
  ['Malicious damage, flood, storm and earthquake', false, false, true],
  ['Windscreen, towing and accident-damaged tyres', false, false, 'Can be added'],
];

export const COVERS = [
  {
    value: 'tpo',
    name: 'Third party only',
    short: 'The legal minimum. Pays for injury, death or property damage you cause to others.',
    price: 'Fixed NIC tariff, from GH₵ 557 a year for a private car',
  },
  {
    value: 'tpft',
    name: 'Third party, fire & theft',
    short: 'Third party, plus your own vehicle if it is stolen or catches fire.',
    price: 'Tariff plus a share of the vehicle’s value',
  },
  {
    value: 'comprehensive',
    name: 'Comprehensive',
    short: 'Everything above, plus accident damage to your own vehicle.',
    price: 'A percentage of the vehicle’s value, never below the tariff',
  },
];

/** Plain-words vehicle picker for the quick quote, mapped to the motor form's vehicle_use / body_type. */
export const VEHICLE_TYPES = [
  { value: 'private', label: 'Private car or SUV', use: 'private', body: 'saloon', tpo: 557 },
  { value: 'taxi', label: 'Taxi', use: 'taxi', body: 'saloon', tpo: 744 },
  {
    value: 'hiring',
    label: 'Hiring or ride-hailing (Uber, Bolt, Yango)',
    use: 'hiring',
    body: 'saloon',
    tpo: 744,
  },
  {
    value: 'trotro',
    label: 'Trotro or minibus',
    use: 'passenger_bus',
    body: 'minibus',
    tpo: 919,
    seats: true,
  },
  {
    value: 'own_goods',
    label: 'Goods vehicle, carrying your own goods',
    use: 'own_goods',
    body: 'truck',
    tpo: 761,
    goods: true,
  },
  {
    value: 'general_cartage',
    label: 'Goods vehicle, carrying goods for others',
    use: 'general_cartage',
    body: 'truck',
    tpo: 893,
    goods: true,
  },
  { value: 'motorcycle', label: 'Motorcycle', use: 'motorcycle', body: 'motorcycle', tpo: 331 },
  // An aboboyaa carries goods; the tariff class follows the tricycle body whatever the use.
  { value: 'tricycle', label: 'Tricycle or aboboyaa', use: 'own_goods', body: 'tricycle', tpo: 431 },
];

export const GOODS_BODIES = [
  ['pick-up', 'Pick-up or van'],
  ['truck', 'Truck, lorry or tipper'],
  ['tanker', 'Tanker or articulator'],
];

export const TRAVEL_ZONES = [
  ['africa', 'Africa'],
  ['schengen_europe', 'Schengen countries and the rest of Europe'],
  ['worldwide_excl_us_ca', 'Worldwide, except the USA and Canada'],
  ['worldwide_incl_us_ca', 'Worldwide, including the USA and Canada'],
];
