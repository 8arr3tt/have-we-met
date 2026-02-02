/**
 * Febrl dataset loader.
 * Provides utilities for loading and working with Febrl synthetic benchmark datasets.
 */

import {
  parseFebrl,
  createLoadedDataset,
  type LoadedDataset,
  type LabeledPair,
} from '../../infrastructure/dataset-loader'

export interface FebrlRecord {
  id: string
  rec_id: string
  given_name: string
  surname: string
  street_number: string
  address_1: string
  address_2: string
  suburb: string
  postcode: string
  state: string
  date_of_birth: string
  soc_sec_id: string
  org_rec?: string
  [key: string]: unknown
}

export type FebrlDatasetName = 'febrl1' | 'febrl2' | 'febrl3' | 'febrl4'

export interface FebrlDatasetInfo {
  name: FebrlDatasetName
  description: string
  recordCount: number
  truePairCount: number
  corruptionLevel: 'low' | 'moderate' | 'high'
}

export const FEBRL_DATASETS: Record<FebrlDatasetName, FebrlDatasetInfo> = {
  febrl1: {
    name: 'febrl1',
    description: 'Small dataset with 1,000 records and 500 duplicate pairs',
    recordCount: 1000,
    truePairCount: 500,
    corruptionLevel: 'low',
  },
  febrl2: {
    name: 'febrl2',
    description: 'Medium dataset with 5,000 records and 1,934 duplicate pairs',
    recordCount: 5000,
    truePairCount: 1934,
    corruptionLevel: 'moderate',
  },
  febrl3: {
    name: 'febrl3',
    description:
      'Challenging dataset with 5,000 records and 6,538 duplicate pairs',
    recordCount: 5000,
    truePairCount: 6538,
    corruptionLevel: 'high',
  },
  febrl4: {
    name: 'febrl4',
    description: 'Large dataset with 10,000 records (5,000 pairs)',
    recordCount: 10000,
    truePairCount: 5000,
    corruptionLevel: 'moderate',
  },
}

/**
 * Loads a Febrl dataset from CSV content.
 */
export function loadFebrlFromCSV(
  name: string,
  csvContent: string
): LoadedDataset<FebrlRecord> {
  const startTime = performance.now()

  const { records, pairs } = parseFebrl<FebrlRecord>(csvContent, {
    includeOriginalId: true,
  })

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(name, records, pairs, 'febrl', loadTimeMs)
}

/**
 * Generates synthetic Febrl-like data for testing when actual datasets aren't available.
 * Creates records with realistic variations and known duplicate pairs.
 */
export function generateSyntheticFebrlData(
  options: {
    recordCount?: number
    duplicateRate?: number
    corruptionProbability?: number
  } = {}
): LoadedDataset<FebrlRecord> {
  const {
    recordCount = 1000,
    duplicateRate = 0.5,
    corruptionProbability = 0.3,
  } = options

  const startTime = performance.now()

  const firstNames = [
    'james',
    'robert',
    'john',
    'michael',
    'william',
    'david',
    'richard',
    'joseph',
    'thomas',
    'charles',
    'mary',
    'patricia',
    'jennifer',
    'linda',
    'barbara',
    'elizabeth',
    'susan',
    'jessica',
    'sarah',
    'karen',
    'nancy',
    'betty',
    'margaret',
    'sandra',
    'ashley',
    'dorothy',
    'kimberly',
    'emily',
    'donna',
  ]

  const surnames = [
    'smith',
    'johnson',
    'williams',
    'brown',
    'jones',
    'garcia',
    'miller',
    'davis',
    'rodriguez',
    'martinez',
    'hernandez',
    'lopez',
    'gonzalez',
    'wilson',
    'anderson',
    'thomas',
    'taylor',
    'moore',
    'jackson',
    'martin',
    'lee',
    'perez',
    'thompson',
    'white',
    'harris',
    'sanchez',
    'clark',
    'ramirez',
    'lewis',
    'robinson',
  ]

  const streets = [
    'main street',
    'oak avenue',
    'maple road',
    'cedar lane',
    'pine drive',
    'elm street',
    'washington street',
    'park avenue',
    'lake road',
    'hill street',
    'river road',
    'forest drive',
    'sunset boulevard',
    'spring lane',
    'valley road',
  ]

  const suburbs = [
    'lakeside',
    'riverside',
    'hillview',
    'greenville',
    'fairview',
    'springfield',
    'franklin',
    'clinton',
    'madison',
    'georgetown',
    'oakwood',
    'pleasant hill',
    'clearwater',
    'northside',
    'southgate',
    'westview',
    'eastgate',
    'central',
  ]

  const states = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act']

  const randomChoice = <T>(arr: T[]): T =>
    arr[Math.floor(Math.random() * arr.length)]
  const randomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min

  const generateDateOfBirth = (): string => {
    const year = randomInt(1950, 2000)
    const month = String(randomInt(1, 12)).padStart(2, '0')
    const day = String(randomInt(1, 28)).padStart(2, '0')
    return `${year}${month}${day}`
  }

  const corruptString = (s: string, probability: number): string => {
    if (Math.random() > probability || s.length === 0) return s

    const corruptionType = randomInt(0, 4)
    const result = s.split('')

    switch (corruptionType) {
      case 0: // Character substitution
        if (result.length > 0) {
          const pos = randomInt(0, result.length - 1)
          result[pos] = String.fromCharCode(97 + randomInt(0, 25))
        }
        break
      case 1: // Character insertion
        result.splice(
          randomInt(0, result.length),
          0,
          String.fromCharCode(97 + randomInt(0, 25))
        )
        break
      case 2: // Character deletion
        if (result.length > 1) {
          result.splice(randomInt(0, result.length - 1), 1)
        }
        break
      case 3: // Character transposition
        if (result.length > 1) {
          const pos = randomInt(0, result.length - 2)
          ;[result[pos], result[pos + 1]] = [result[pos + 1], result[pos]]
        }
        break
      case 4: // Phonetic variation
        const phonetic: Record<string, string[]> = {
          ph: ['f'],
          f: ['ph'],
          c: ['k', 's'],
          k: ['c'],
          ee: ['ie', 'ea'],
          ie: ['ee', 'y'],
          oo: ['u'],
          ou: ['ow'],
        }
        for (const [from, tos] of Object.entries(phonetic)) {
          if (s.includes(from)) {
            return s.replace(from, randomChoice(tos))
          }
        }
        break
    }

    return result.join('')
  }

  const corruptDate = (date: string, probability: number): string => {
    if (Math.random() > probability) return date

    const result = date.split('')
    const pos = randomInt(0, result.length - 1)
    result[pos] = String(randomInt(0, 9))
    return result.join('')
  }

  const numOriginals = Math.ceil(recordCount / (1 + duplicateRate))
  const records: FebrlRecord[] = []
  const pairs: LabeledPair[] = []

  // Generate original records
  for (let i = 0; i < numOriginals; i++) {
    const recId = `rec-${i}-org`
    const record: FebrlRecord = {
      id: recId,
      rec_id: recId,
      given_name: randomChoice(firstNames),
      surname: randomChoice(surnames),
      street_number: String(randomInt(1, 999)),
      address_1: randomChoice(streets),
      address_2: Math.random() > 0.7 ? `unit ${randomInt(1, 50)}` : '',
      suburb: randomChoice(suburbs),
      postcode: String(randomInt(1000, 9999)),
      state: randomChoice(states),
      date_of_birth: generateDateOfBirth(),
      soc_sec_id: String(randomInt(1000000, 9999999)),
    }
    records.push(record)
  }

  // Generate duplicates
  let dupIndex = 0
  for (const original of records.slice(0, numOriginals)) {
    if (records.length >= recordCount) break

    const dupCount =
      duplicateRate >= 1
        ? Math.floor(duplicateRate) +
          (Math.random() < duplicateRate % 1 ? 1 : 0)
        : Math.random() < duplicateRate
          ? 1
          : 0

    for (let d = 0; d < dupCount && records.length < recordCount; d++) {
      const dupId = `rec-${dupIndex}-dup-${d}`
      dupIndex++

      const duplicate: FebrlRecord = {
        id: dupId,
        rec_id: dupId,
        given_name: corruptString(original.given_name, corruptionProbability),
        surname: corruptString(original.surname, corruptionProbability),
        street_number:
          Math.random() > corruptionProbability
            ? original.street_number
            : String(randomInt(1, 999)),
        address_1: corruptString(original.address_1, corruptionProbability),
        address_2: original.address_2,
        suburb: corruptString(original.suburb, corruptionProbability),
        postcode:
          Math.random() > corruptionProbability
            ? original.postcode
            : String(randomInt(1000, 9999)),
        state: original.state,
        date_of_birth: corruptDate(
          original.date_of_birth,
          corruptionProbability
        ),
        soc_sec_id: corruptString(
          original.soc_sec_id,
          corruptionProbability * 0.5
        ),
        org_rec: original.rec_id,
      }
      records.push(duplicate)

      pairs.push({
        id1: original.rec_id,
        id2: dupId,
        isMatch: true,
      })
    }
  }

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(
    `synthetic-febrl-${recordCount}`,
    records,
    pairs,
    'febrl',
    loadTimeMs
  )
}

/**
 * Creates a subset of a Febrl dataset for faster testing.
 */
export function createFebrlSubset(
  dataset: LoadedDataset<FebrlRecord>,
  maxRecords: number
): LoadedDataset<FebrlRecord> {
  const startTime = performance.now()

  const records = dataset.records.slice(0, maxRecords)
  const recordIds = new Set(records.map((r) => r.rec_id))

  const pairs = dataset.truePairs?.filter(
    (p) => recordIds.has(String(p.id1)) && recordIds.has(String(p.id2))
  )

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(
    `${dataset.name}-subset-${maxRecords}`,
    records,
    pairs,
    'febrl',
    loadTimeMs
  )
}

/**
 * Gets field statistics from a Febrl dataset.
 */
export function analyzeFebrlDataset(dataset: LoadedDataset<FebrlRecord>): {
  nullRates: Record<string, number>
  uniqueValues: Record<string, number>
  avgFieldLength: Record<string, number>
} {
  const fields = [
    'given_name',
    'surname',
    'street_number',
    'address_1',
    'address_2',
    'suburb',
    'postcode',
    'state',
    'date_of_birth',
    'soc_sec_id',
  ] as const

  const nullRates: Record<string, number> = {}
  const uniqueValues: Record<string, number> = {}
  const avgFieldLength: Record<string, number> = {}

  const n = dataset.records.length

  for (const field of fields) {
    const values = dataset.records.map((r) => r[field])
    const nonNull = values.filter((v) => v != null && v !== '')
    const unique = new Set(nonNull)

    nullRates[field] = (n - nonNull.length) / n
    uniqueValues[field] = unique.size
    avgFieldLength[field] =
      nonNull.length > 0
        ? nonNull.reduce((sum, v) => sum + String(v).length, 0) / nonNull.length
        : 0
  }

  return { nullRates, uniqueValues, avgFieldLength }
}

/**
 * Creates a matching function configuration suitable for Febrl person records.
 */
export function getDefaultFebrlMatchingConfig(): Array<{
  field: keyof FebrlRecord
  weight: number
  algorithm: 'exact' | 'levenshtein' | 'jaroWinkler' | 'soundex' | 'metaphone'
}> {
  return [
    { field: 'given_name', weight: 15, algorithm: 'jaroWinkler' },
    { field: 'surname', weight: 20, algorithm: 'jaroWinkler' },
    { field: 'date_of_birth', weight: 15, algorithm: 'exact' },
    { field: 'soc_sec_id', weight: 25, algorithm: 'exact' },
    { field: 'postcode', weight: 10, algorithm: 'exact' },
    { field: 'address_1', weight: 10, algorithm: 'levenshtein' },
    { field: 'suburb', weight: 5, algorithm: 'levenshtein' },
  ]
}

/**
 * Creates a blocking configuration suitable for Febrl person records.
 */
export function getDefaultFebrlBlockingConfig(): Array<{
  fields: Array<keyof FebrlRecord>
  transform?: 'firstLetter' | 'soundex' | 'metaphone' | 'year'
}> {
  return [
    { fields: ['surname'], transform: 'soundex' },
    { fields: ['postcode'] },
    { fields: ['date_of_birth'], transform: 'year' },
  ]
}
