/**
 * Restaurant dataset loader.
 * Provides utilities for loading and working with Fodors-Zagat style restaurant benchmark datasets.
 */

import { parseCSV, createLoadedDataset, type LoadedDataset, type LabeledPair } from '../../infrastructure/dataset-loader'

export interface RestaurantRecord {
  id: string
  name: string
  addr: string
  city: string
  phone: string
  type: string
  class: string
  source: 'fodors' | 'zagat' | 'synthetic'
  [key: string]: unknown
}

export interface RestaurantDatasetInfo {
  name: string
  description: string
  fodorsCount: number
  zagatCount: number
  truePairCount: number
}

export const RESTAURANT_DATASET_INFO: RestaurantDatasetInfo = {
  name: 'fodors-zagat',
  description: 'Restaurant listings from Fodors and Zagat guides',
  fodorsCount: 533,
  zagatCount: 331,
  truePairCount: 112,
}

/**
 * Loads a restaurant dataset from CSV content.
 */
export function loadRestaurantFromCSV(
  name: string,
  csvContent: string,
  source: 'fodors' | 'zagat'
): RestaurantRecord[] {
  const records = parseCSV<RestaurantRecord>(csvContent, {
    idField: 'id',
  })

  return records.map((record, index) => ({
    ...record,
    id: record.id || `${source}-${index}`,
    source,
  }))
}

/**
 * Generates synthetic restaurant data for testing.
 * Creates records with realistic variations and known duplicate pairs.
 */
export function generateSyntheticRestaurantData(
  options: {
    recordCount?: number
    duplicateRate?: number
    corruptionProbability?: number
  } = {}
): LoadedDataset<RestaurantRecord> {
  const {
    recordCount = 500,
    duplicateRate = 0.3,
    corruptionProbability = 0.25,
  } = options

  const startTime = performance.now()

  const restaurantNames = [
    "joe's crab shack", "olive garden", "red lobster", "applebee's",
    "chili's grill & bar", "outback steakhouse", "the cheesecake factory",
    "buffalo wild wings", "texas roadhouse", "cracker barrel",
    "ihop", "denny's", "waffle house", "panera bread", "chipotle",
    "five guys", "shake shack", "in-n-out burger", "whataburger",
    "panda express", "p.f. chang's", "benihana", "nobu", "masa",
    "le bernardin", "eleven madison park", "per se", "alinea",
    "french laundry", "noma", "el bulli", "osteria francescana",
    "the fat duck", "central", "gaggan", "mirazur", "geranium",
    "asador etxebarri", "mugaritz", "steirereck", "tickets",
    "momofuku ko", "blue hill", "gramercy tavern", "daniel",
  ]

  const streetNames = [
    'main street', 'broadway', 'park avenue', 'first avenue', 'second street',
    'oak lane', 'maple drive', 'elm street', 'washington blvd', 'market street',
    'high street', 'church road', 'mill lane', 'river road', 'lake drive',
    'sunset boulevard', 'hollywood blvd', 'wilshire blvd', 'rodeo drive',
    'fifth avenue', 'madison avenue', 'lexington ave', 'michigan avenue',
  ]

  const cities = [
    'new york', 'los angeles', 'chicago', 'houston', 'phoenix',
    'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
    'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
    'san francisco', 'indianapolis', 'seattle', 'denver', 'boston',
    'las vegas', 'portland', 'miami', 'atlanta', 'minneapolis',
  ]

  const cuisineTypes = [
    'american', 'italian', 'mexican', 'chinese', 'japanese',
    'indian', 'thai', 'french', 'mediterranean', 'steakhouse',
    'seafood', 'bbq', 'pizza', 'burger', 'sushi',
    'vietnamese', 'korean', 'greek', 'spanish', 'middle eastern',
  ]

  const priceClasses = ['$', '$$', '$$$', '$$$$']

  const randomChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

  const generatePhone = (): string => {
    const area = randomInt(200, 999)
    const prefix = randomInt(200, 999)
    const line = randomInt(1000, 9999)
    return `${area}-${prefix}-${line}`
  }

  const generateAddress = (): string => {
    const number = randomInt(1, 9999)
    const street = randomChoice(streetNames)
    return `${number} ${street}`
  }

  const corruptString = (s: string, probability: number): string => {
    if (Math.random() > probability || s.length === 0) return s

    const corruptionType = randomInt(0, 5)
    const result = s.split('')

    switch (corruptionType) {
      case 0: // Character substitution
        if (result.length > 0) {
          const pos = randomInt(0, result.length - 1)
          result[pos] = String.fromCharCode(97 + randomInt(0, 25))
        }
        break
      case 1: // Character deletion
        if (result.length > 1) {
          result.splice(randomInt(0, result.length - 1), 1)
        }
        break
      case 2: // Character transposition
        if (result.length > 1) {
          const pos = randomInt(0, result.length - 2)
          ;[result[pos], result[pos + 1]] = [result[pos + 1], result[pos]]
        }
        break
      case 3: // Abbreviation changes
        const abbrevs: Record<string, string[]> = {
          'street': ['st', 'st.', 'str'],
          'avenue': ['ave', 'ave.', 'av'],
          'boulevard': ['blvd', 'blvd.', 'blv'],
          'drive': ['dr', 'dr.'],
          'road': ['rd', 'rd.'],
          'lane': ['ln', 'ln.'],
        }
        for (const [full, shorts] of Object.entries(abbrevs)) {
          if (s.toLowerCase().includes(full)) {
            return s.toLowerCase().replace(full, randomChoice(shorts))
          }
          for (const short of shorts) {
            if (s.toLowerCase().includes(short)) {
              return s.toLowerCase().replace(short, full)
            }
          }
        }
        break
      case 4: // Punctuation changes
        if (s.includes("'")) {
          return s.replace("'", '')
        }
        if (s.includes('.')) {
          return s.replace('.', '')
        }
        break
      case 5: // Case change
        return Math.random() > 0.5 ? s.toUpperCase() : s.toLowerCase()
    }

    return result.join('')
  }

  const corruptPhone = (phone: string, probability: number): string => {
    if (Math.random() > probability) return phone

    const formats = [
      (p: string) => p.replace(/-/g, ' '),
      (p: string) => p.replace(/-/g, '/'),
      (p: string) => p.replace(/-/g, '.'),
      (p: string) => {
        const parts = p.split('-')
        return `(${parts[0]}) ${parts[1]}-${parts[2]}`
      },
      (p: string) => p.replace(/-/g, ''),
    ]

    return randomChoice(formats)(phone)
  }

  const corruptType = (type: string, probability: number): string => {
    if (Math.random() > probability) return type

    // Semantic variations
    const synonyms: Record<string, string[]> = {
      'american': ['new american', 'traditional american', 'usa'],
      'steakhouse': ['steak', 'steaks', 'american steakhouse'],
      'italian': ['ital', 'tuscan', 'roman'],
      'mexican': ['tex-mex', 'mex', 'latin'],
      'chinese': ['cantonese', 'szechuan', 'asian'],
      'japanese': ['sushi', 'asian', 'ramen'],
      'seafood': ['fish', 'oyster bar', 'shellfish'],
      'bbq': ['barbecue', 'barbeque', 'smokehouse'],
    }

    if (synonyms[type.toLowerCase()]) {
      return randomChoice(synonyms[type.toLowerCase()])
    }

    return type
  }

  const numOriginals = Math.ceil(recordCount / (1 + duplicateRate))
  const records: RestaurantRecord[] = []
  const pairs: LabeledPair[] = []

  // Generate original records
  for (let i = 0; i < numOriginals; i++) {
    const record: RestaurantRecord = {
      id: `rest-${i}-org`,
      name: randomChoice(restaurantNames),
      addr: generateAddress(),
      city: randomChoice(cities),
      phone: generatePhone(),
      type: randomChoice(cuisineTypes),
      class: randomChoice(priceClasses),
      source: 'synthetic',
    }
    records.push(record)
  }

  // Generate duplicates
  let dupIndex = 0
  for (const original of records.slice(0, numOriginals)) {
    if (records.length >= recordCount) break

    const dupCount = duplicateRate >= 1
      ? Math.floor(duplicateRate) + (Math.random() < duplicateRate % 1 ? 1 : 0)
      : (Math.random() < duplicateRate ? 1 : 0)

    for (let d = 0; d < dupCount && records.length < recordCount; d++) {
      const dupId = `rest-${dupIndex}-dup-${d}`
      dupIndex++

      const duplicate: RestaurantRecord = {
        id: dupId,
        name: corruptString(original.name, corruptionProbability),
        addr: corruptString(original.addr, corruptionProbability),
        city: corruptString(original.city, corruptionProbability * 0.3), // Cities less likely to be corrupted
        phone: corruptPhone(original.phone, corruptionProbability),
        type: corruptType(original.type, corruptionProbability * 0.5),
        class: Math.random() > corruptionProbability ? original.class : randomChoice(priceClasses),
        source: 'synthetic',
      }
      records.push(duplicate)

      pairs.push({
        id1: original.id,
        id2: dupId,
        isMatch: true,
      })
    }
  }

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(
    `synthetic-restaurant-${recordCount}`,
    records,
    pairs,
    'custom',
    loadTimeMs
  )
}

/**
 * Creates a subset of a restaurant dataset for faster testing.
 */
export function createRestaurantSubset(
  dataset: LoadedDataset<RestaurantRecord>,
  maxRecords: number
): LoadedDataset<RestaurantRecord> {
  const startTime = performance.now()

  const records = dataset.records.slice(0, maxRecords)
  const recordIds = new Set(records.map(r => r.id))

  const pairs = dataset.truePairs?.filter(
    p => recordIds.has(String(p.id1)) && recordIds.has(String(p.id2))
  )

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(
    `${dataset.name}-subset-${maxRecords}`,
    records,
    pairs,
    'custom',
    loadTimeMs
  )
}

/**
 * Gets field statistics from a restaurant dataset.
 */
export function analyzeRestaurantDataset(dataset: LoadedDataset<RestaurantRecord>): {
  nullRates: Record<string, number>
  uniqueValues: Record<string, number>
  avgFieldLength: Record<string, number>
} {
  const fields = ['name', 'addr', 'city', 'phone', 'type', 'class'] as const

  const nullRates: Record<string, number> = {}
  const uniqueValues: Record<string, number> = {}
  const avgFieldLength: Record<string, number> = {}

  const n = dataset.records.length

  for (const field of fields) {
    const values = dataset.records.map(r => r[field])
    const nonNull = values.filter(v => v != null && v !== '')
    const unique = new Set(nonNull)

    nullRates[field] = (n - nonNull.length) / n
    uniqueValues[field] = unique.size
    avgFieldLength[field] = nonNull.length > 0
      ? nonNull.reduce((sum, v) => sum + String(v).length, 0) / nonNull.length
      : 0
  }

  return { nullRates, uniqueValues, avgFieldLength }
}

/**
 * Creates a matching function configuration suitable for restaurant records.
 */
export function getDefaultRestaurantMatchingConfig(): Array<{
  field: keyof RestaurantRecord
  weight: number
  algorithm: 'exact' | 'levenshtein' | 'jaroWinkler' | 'soundex'
}> {
  return [
    { field: 'name', weight: 30, algorithm: 'jaroWinkler' },
    { field: 'addr', weight: 25, algorithm: 'levenshtein' },
    { field: 'city', weight: 15, algorithm: 'exact' },
    { field: 'phone', weight: 20, algorithm: 'exact' },
    { field: 'type', weight: 10, algorithm: 'levenshtein' },
  ]
}

/**
 * Creates a blocking configuration suitable for restaurant records.
 */
export function getDefaultRestaurantBlockingConfig(): Array<{
  fields: Array<keyof RestaurantRecord>
  transform?: 'firstLetter' | 'soundex' | 'exact'
}> {
  return [
    { fields: ['city'] },
    { fields: ['name'], transform: 'firstLetter' },
  ]
}

/**
 * Normalizes a phone number for comparison.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/[^0-9]/g, '')
}

/**
 * Normalizes an address for comparison.
 */
export function normalizeAddress(addr: string): string {
  if (!addr) return ''

  return addr
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
