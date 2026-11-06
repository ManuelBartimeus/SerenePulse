// Option lists shared by several proposal forms. Values are stable keys stored in answers;
// labels can be reworded without touching stored data.
import type { Option } from './schema';

const o = (value: string, label: string, hint?: string): Option =>
  hint ? { value, label, hint } : { value, label };

export const YES_NO: readonly Option[] = [o('yes', 'Yes'), o('no', 'No')];

export const TITLES: readonly Option[] = [
  o('mr', 'Mr'),
  o('mrs', 'Mrs'),
  o('ms', 'Ms'),
  o('miss', 'Miss'),
  o('dr', 'Dr'),
  o('prof', 'Prof'),
  o('rev', 'Rev'),
  o('nana', 'Nana'),
  o('hon', 'Hon'),
];

export const GENDERS: readonly Option[] = [o('male', 'Male'), o('female', 'Female')];

export const MARITAL_STATUS: readonly Option[] = [
  o('single', 'Single'),
  o('married', 'Married'),
  o('divorced', 'Divorced'),
  o('widowed', 'Widowed'),
];

/**
 * Identification for individuals. The Ghana Card is mandatory for Ghanaians (and for every motor
 * policy from 1 Jan 2026, NIC directive); foreign nationals use a non-citizen Ghana Card or a
 * passport. Other IDs are no longer accepted for insurance KYC. See kyc.ts on L.I. 2523.
 */
export const ID_TYPES: readonly Option[] = [
  o('ghana_card', 'Ghana Card'),
  o('non_citizen_card', 'Non-citizen Ghana Card'),
  o('passport', 'Passport (foreign nationals)'),
];

/** The 16 regions of Ghana. */
export const GHANA_REGIONS: readonly Option[] = [
  o('greater-accra', 'Greater Accra'),
  o('ashanti', 'Ashanti'),
  o('central', 'Central'),
  o('eastern', 'Eastern'),
  o('western', 'Western'),
  o('western-north', 'Western North'),
  o('volta', 'Volta'),
  o('oti', 'Oti'),
  o('northern', 'Northern'),
  o('savannah', 'Savannah'),
  o('north-east', 'North East'),
  o('upper-east', 'Upper East'),
  o('upper-west', 'Upper West'),
  o('bono', 'Bono'),
  o('bono-east', 'Bono East'),
  o('ahafo', 'Ahafo'),
];

/** Serene's 13 branches (directory seeds, sereneinsurance.com/contacts/branches). */
export const SERENE_BRANCHES: readonly Option[] = [
  o('accra-main', 'Accra Main (Head office, Ridge)'),
  o('accra-east', 'Accra East (Adenta)'),
  o('accra-west', 'Accra West (Mataheko)'),
  o('lapaz', 'Lapaz'),
  o('tema-community-11', 'Tema Community 11'),
  o('tema-community-25', 'Tema Community 25'),
  o('kumasi-main', 'Kumasi Main (Ahodwo)'),
  o('kumasi-north', 'Kumasi North (Suame)'),
  o('kasoa', 'Kasoa'),
  o('takoradi', 'Takoradi'),
  o('ho', 'Ho'),
  o('tamale', 'Tamale'),
  o('techiman', 'Techiman'),
];

/** Non-life insurers in Ghana, for "previous insurer" questions (always offered with "Other"). */
export const GHANA_INSURERS: readonly Option[] = [
  'Activa International Insurance',
  'Bedrock Insurance',
  'Best Assurance',
  'Coronation Insurance Ghana',
  'Donewell Insurance',
  'Enterprise Insurance',
  'Ghana Union Assurance',
  'Glico General Insurance',
  'Hollard Insurance Ghana',
  'Imperial General Assurance',
  'Loyalty Insurance',
  'Millennium Insurance',
  'NSIA Insurance',
  'Phoenix Insurance',
  'Prime Insurance',
  'Priority Insurance',
  'Provident Insurance',
  'Quality Insurance',
  'RegencyNem Insurance',
  'Sanlam Allianz General Insurance',
  'Serene Insurance',
  'SIC Insurance',
  'Star Assurance',
  'SUNU Assurances Ghana',
  'Unique Insurance',
  'Vanguard Assurance',
].map((name) => o(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name));

export const VEHICLE_MAKES: readonly Option[] = [
  'Toyota',
  'Hyundai',
  'Kia',
  'Nissan',
  'Honda',
  'Mercedes-Benz',
  'Ford',
  'Mitsubishi',
  'Volkswagen',
  'Suzuki',
  'Mazda',
  'Lexus',
  'BMW',
  'Peugeot',
  'Chevrolet',
  'Land Rover',
  'Isuzu',
  'Renault',
  'Opel',
  'Audi',
  'Jeep',
  'Infiniti',
  'Acura',
  'Subaru',
  'Dodge',
  'Tata',
  'Kantanka',
  'Geely',
  'Changan',
  'JAC',
  'Foton',
  'Sinotruk (Howo)',
  'DAF',
  'MAN',
  'Scania',
  'Volvo',
  'Haojue',
  'Apsonic',
  'Royal',
  'Bajaj',
  'TVS',
  'Yamaha',
].map((name) => o(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name));

export const BODY_TYPES: readonly Option[] = [
  o('saloon', 'Saloon'),
  o('hatchback', 'Hatchback'),
  o('station-wagon', 'Station wagon / estate'),
  o('suv', 'SUV / 4x4'),
  o('pick-up', 'Pick-up'),
  o('coupe', 'Coupe'),
  o('van', 'Van'),
  o('minibus', 'Minibus'),
  o('bus', 'Bus / coach'),
  o('truck', 'Truck / lorry'),
  o('tipper', 'Tipper'),
  o('tanker', 'Tanker'),
  o('articulator', 'Articulator / trailer head'),
  o('motorcycle', 'Motorcycle'),
  o('tricycle', 'Tricycle (e.g. Aboboyaa, Pragya)'),
  o('tractor', 'Tractor / agricultural'),
  o('ambulance', 'Ambulance'),
];

export const VEHICLE_COLOURS: readonly Option[] = [
  'White',
  'Black',
  'Silver',
  'Grey',
  'Blue',
  'Red',
  'Green',
  'Gold',
  'Brown',
  'Beige',
  'Yellow',
  'Orange',
  'Maroon',
  'Purple',
].map((c) => o(c.toLowerCase(), c));

export const CURRENCIES: readonly Option[] = [
  o('GHS', 'Ghana cedi (GH₵)'),
  o('USD', 'US dollar (US$)'),
  o('EUR', 'Euro (€)'),
  o('GBP', 'Pound sterling (£)'),
];

/** Construction of a building, for fire/burglary/home forms. */
export const WALL_MATERIALS: readonly Option[] = [
  o('concrete-block', 'Concrete / sandcrete blocks'),
  o('brick', 'Burnt bricks'),
  o('stone', 'Stone'),
  o('wood', 'Wood'),
  o('mud', 'Mud / swish'),
  o('metal', 'Metal sheets / prefabricated'),
];

export const ROOF_MATERIALS: readonly Option[] = [
  o('aluminium', 'Aluminium sheets'),
  o('roofing-tiles', 'Roofing tiles'),
  o('concrete-slab', 'Concrete slab'),
  o('asbestos', 'Asbestos'),
  o('zinc', 'Corrugated iron / zinc'),
  o('thatch', 'Thatch'),
];

export const COUNTRIES_COMMON: readonly Option[] = [
  'Ghana',
  'Nigeria',
  "Côte d'Ivoire",
  'Togo',
  'Burkina Faso',
  'Benin',
  'United Kingdom',
  'United States',
  'Canada',
  'Germany',
  'France',
  'Netherlands',
  'Italy',
  'Spain',
  'China',
  'India',
  'United Arab Emirates',
  'South Africa',
  'Lebanon',
].map((c) => o(c.toLowerCase().replace(/[^a-z0-9]+/g, '-'), c));
