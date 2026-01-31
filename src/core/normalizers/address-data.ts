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
]
