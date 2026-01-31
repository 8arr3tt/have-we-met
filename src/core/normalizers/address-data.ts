/**
 * Lookup tables for address normalization.
 * Contains US states, Canadian provinces, street type abbreviations, and more.
 */

/**
 * US states: full name to two-letter abbreviation mapping.
 */
export const US_STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
}

/**
 * Set of valid US state abbreviations (for validation).
 */
export const US_STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
])

/**
 * Canadian provinces: full name to two-letter abbreviation mapping.
 */
export const CANADIAN_PROVINCES: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'northwest territories': 'NT',
  'nova scotia': 'NS',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
}

/**
 * Set of valid Canadian province codes (for validation).
 */
export const CANADIAN_PROVINCE_CODES = new Set([
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NT',
  'NS',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
])

/**
 * Street type abbreviations per USPS standards.
 */
export const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  alley: 'Aly',
  avenue: 'Ave',
  boulevard: 'Blvd',
  circle: 'Cir',
  court: 'Ct',
  drive: 'Dr',
  expressway: 'Expy',
  freeway: 'Fwy',
  highway: 'Hwy',
  lane: 'Ln',
  parkway: 'Pkwy',
  place: 'Pl',
  road: 'Rd',
  route: 'Rte',
  square: 'Sq',
  street: 'St',
  terrace: 'Ter',
  trail: 'Trl',
  turnpike: 'Tpke',
  way: 'Way',
}

/**
 * Directional abbreviations.
 */
export const DIRECTIONAL_ABBREVIATIONS: Record<string, string> = {
  north: 'N',
  south: 'S',
  east: 'E',
  west: 'W',
  northeast: 'NE',
  northwest: 'NW',
  southeast: 'SE',
  southwest: 'SW',
}

/**
 * Unit type abbreviations per USPS standards.
 */
export const UNIT_TYPE_ABBREVIATIONS: Record<string, string> = {
  apartment: 'Apt',
  building: 'Bldg',
  department: 'Dept',
  floor: 'Fl',
  suite: 'Ste',
  unit: 'Unit',
  room: 'Rm',
  '#': '#',
}

/**
 * Common unit type patterns for detection.
 */
export const UNIT_TYPE_PATTERNS = [
  /\b(?:apt|apartment)\s*\.?\s*([a-z0-9]+)/i,
  /\b(?:ste|suite)\s*\.?\s*([a-z0-9]+)/i,
  /\bunit\s*\.?\s*([a-z0-9]+)/i,
  /\b(?:bldg|building)\s*\.?\s*([a-z0-9]+)/i,
  /\bfloor\s*\.?\s*([a-z0-9]+)/i,
  /\b(?:rm|room)\s*\.?\s*([a-z0-9]+)/i,
  /#\s*([a-z0-9]+)/i,
  /\bflat\s*\.?\s*([a-z0-9]+)/i, // UK-specific
]

/**
 * UK counties: full name to abbreviation mapping.
 * Using traditional/ceremonial counties (commonly used in addresses).
 */
export const UK_COUNTIES: Record<string, string> = {
  bedfordshire: 'Beds',
  berkshire: 'Berks',
  buckinghamshire: 'Bucks',
  cambridgeshire: 'Cambs',
  cheshire: 'Ches',
  cornwall: 'Corn',
  cumbria: 'Cumb',
  derbyshire: 'Derby',
  devon: 'Devon',
  dorset: 'Dorset',
  durham: 'Durham',
  'east sussex': 'E Sussex',
  essex: 'Essex',
  gloucestershire: 'Glos',
  'greater london': 'London',
  'greater manchester': 'Gr Man',
  hampshire: 'Hants',
  herefordshire: 'Heref',
  hertfordshire: 'Herts',
  kent: 'Kent',
  lancashire: 'Lancs',
  leicestershire: 'Leics',
  lincolnshire: 'Lincs',
  merseyside: 'Merse',
  norfolk: 'Norf',
  northamptonshire: 'Northants',
  northumberland: 'Northumb',
  'north yorkshire': 'N Yorks',
  nottinghamshire: 'Notts',
  oxfordshire: 'Oxon',
  shropshire: 'Shrops',
  somerset: 'Som',
  staffordshire: 'Staffs',
  suffolk: 'Suff',
  surrey: 'Surrey',
  'tyne and wear': 'T & W',
  warwickshire: 'Warks',
  'west midlands': 'W Mids',
  'west sussex': 'W Sussex',
  'west yorkshire': 'W Yorks',
  wiltshire: 'Wilts',
  worcestershire: 'Worcs',
  // Scotland
  aberdeenshire: 'Aberdeens',
  angus: 'Angus',
  argyll: 'Argyll',
  ayrshire: 'Ayrs',
  banffshire: 'Banffs',
  berwickshire: 'Berwicks',
  clackmannanshire: 'Clacks',
  dumfriesshire: 'Dumfries',
  'east lothian': 'E Loth',
  fife: 'Fife',
  inverness: 'Inverness',
  lanarkshire: 'Lanarks',
  midlothian: 'Midloth',
  moray: 'Moray',
  perthshire: 'Perths',
  renfrewshire: 'Renfrews',
  'scottish borders': 'Borders',
  stirlingshire: 'Stirlings',
  'west lothian': 'W Loth',
  // Wales
  anglesey: 'Anglesey',
  carmarthenshire: 'Carmarthen',
  ceredigion: 'Ceredig',
  conwy: 'Conwy',
  denbighshire: 'Denbs',
  flintshire: 'Flints',
  glamorgan: 'Glam',
  gwynedd: 'Gwynedd',
  monmouthshire: 'Monmouth',
  pembrokeshire: 'Pembs',
  powys: 'Powys',
  // Northern Ireland
  antrim: 'Antrim',
  armagh: 'Armagh',
  down: 'Down',
  fermanagh: 'Fermanagh',
  londonderry: 'L\'derry',
  tyrone: 'Tyrone',
}

/**
 * UK street type abbreviations.
 * UK uses similar patterns to US but with some differences.
 */
export const UK_STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  road: 'Rd',
  street: 'St',
  avenue: 'Ave',
  drive: 'Dr',
  lane: 'Ln',
  way: 'Way',
  place: 'Pl',
  close: 'Cl',
  court: 'Ct',
  crescent: 'Cres',
  grove: 'Gr',
  gardens: 'Gdns',
  park: 'Pk',
  square: 'Sq',
  terrace: 'Ter',
  walk: 'Wlk',
  green: 'Grn',
  hill: 'Hill',
  mews: 'Mews',
  rise: 'Rise',
  row: 'Row',
}

/**
 * UK postcode validation pattern.
 * Matches valid UK postcode formats:
 * - A9 9AA, A99 9AA, AA9 9AA, AA99 9AA
 * - A9A 9AA, AA9A 9AA
 * - GIR 0AA (special Girobank postcode)
 */
export const UK_POSTCODE_PATTERN =
  /^([A-Z]{1,2}\d{1,2}[A-Z]?|GIR)\s*(\d[A-Z]{2})$/i

/**
 * UK unit type abbreviations.
 */
export const UK_UNIT_TYPE_ABBREVIATIONS: Record<string, string> = {
  flat: 'Flat',
  apartment: 'Apt',
  maisonette: 'Mais',
  unit: 'Unit',
  suite: 'Suite',
  room: 'Rm',
  floor: 'Fl',
}
