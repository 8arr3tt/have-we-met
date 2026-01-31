/**
 * Helper functions for generating synthetic datasets for blocking benchmarks.
 * These utilities create controlled test data with known characteristics.
 */

/**
 * Person record type for benchmarking.
 */
export interface PersonRecord {
  id: number
  firstName: string
  lastName: string
  email: string
  dateOfBirth: Date
  birthYear: number
  phone: string
  address: string
  postcode: string
}

/**
 * Configuration for dataset generation.
 */
export interface DatasetConfig {
  /** Number of records to generate */
  size: number
  /** Percentage of records that are duplicates (0-1) */
  duplicateRate?: number
  /** Whether to introduce typos in duplicate records */
  withTypos?: boolean
}

// Sample data pools for realistic variation
const firstNames = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'William',
  'Elizabeth',
  'David',
  'Barbara',
  'Richard',
  'Susan',
  'Joseph',
  'Jessica',
  'Thomas',
  'Sarah',
  'Christopher',
  'Karen',
  'Charles',
  'Nancy',
  'Daniel',
  'Lisa',
  'Matthew',
  'Betty',
  'Anthony',
  'Margaret',
  'Mark',
  'Sandra',
]

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
]

const streetNames = [
  'Main',
  'Oak',
  'Maple',
  'Cedar',
  'Elm',
  'Washington',
  'Lake',
  'Hill',
  'Park',
  'Pine',
]

const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'test.com']

/**
 * Generates a random integer between min and max (inclusive).
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Picks a random element from an array.
 */
function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)]
}

/**
 * Introduces a random typo into a string (insertion, deletion, or substitution).
 */
function introduceTypo(str: string): string {
  if (str.length === 0) return str

  const typoType = randomInt(0, 2)
  const position = randomInt(0, str.length - 1)

  switch (typoType) {
    case 0: // Insertion
      return str.slice(0, position) + 'x' + str.slice(position)
    case 1: // Deletion
      return str.slice(0, position) + str.slice(position + 1)
    case 2: // Substitution
      return str.slice(0, position) + 'x' + str.slice(position + 1)
    default:
      return str
  }
}

/**
 * Generates a single person record.
 */
function generatePerson(id: number): PersonRecord {
  const firstName = randomElement(firstNames)
  const lastName = randomElement(lastNames)
  const birthYear = randomInt(1950, 2005)
  const month = randomInt(1, 12)
  const day = randomInt(1, 28)
  const dateOfBirth = new Date(birthYear, month - 1, day)
  const streetNumber = randomInt(1, 9999)
  const streetName = randomElement(streetNames)
  const postcode = randomInt(10000, 99999).toString()

  return {
    id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomElement(domains)}`,
    dateOfBirth,
    birthYear,
    phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
    address: `${streetNumber} ${streetName} St`,
    postcode,
  }
}

/**
 * Creates a duplicate of a person record with optional typos.
 */
function createDuplicate(person: PersonRecord, newId: number, withTypos: boolean): PersonRecord {
  if (!withTypos) {
    return { ...person, id: newId }
  }

  // Introduce typos in some fields
  return {
    ...person,
    id: newId,
    firstName: Math.random() > 0.5 ? introduceTypo(person.firstName) : person.firstName,
    lastName: Math.random() > 0.5 ? introduceTypo(person.lastName) : person.lastName,
    email: Math.random() > 0.3 ? person.email : introduceTypo(person.email),
  }
}

/**
 * Generates a synthetic dataset of person records.
 *
 * @param config - Configuration for dataset generation
 * @returns Array of person records
 */
export function generatePersonDataset(config: DatasetConfig): PersonRecord[] {
  const { size, duplicateRate = 0, withTypos = false } = config
  const records: PersonRecord[] = []

  // Calculate how many unique vs duplicate records to create
  const numDuplicates = Math.floor(size * duplicateRate)
  const numUnique = size - numDuplicates

  // Generate unique records
  for (let i = 0; i < numUnique; i++) {
    records.push(generatePerson(i))
  }

  // Generate duplicate records
  for (let i = 0; i < numDuplicates; i++) {
    // Pick a random existing record to duplicate
    const originalIndex = randomInt(0, records.length - 1)
    const original = records[originalIndex]
    const duplicate = createDuplicate(original, numUnique + i, withTypos)
    records.push(duplicate)
  }

  // Shuffle the records to mix duplicates throughout the dataset
  for (let i = records.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[records[i], records[j]] = [records[j], records[i]]
  }

  return records
}

/**
 * Counts the number of comparisons needed without blocking.
 *
 * @param recordCount - Number of records
 * @returns Number of comparisons (n*(n-1)/2)
 */
export function comparisonsWithoutBlocking(recordCount: number): number {
  return recordCount > 1 ? (recordCount * (recordCount - 1)) / 2 : 0
}

/**
 * Calculates the percentage reduction in comparisons.
 *
 * @param withBlocking - Number of comparisons with blocking
 * @param withoutBlocking - Number of comparisons without blocking
 * @returns Reduction percentage (0-100)
 */
export function calculateReduction(
  withBlocking: number,
  withoutBlocking: number
): number {
  if (withoutBlocking === 0) return 0
  return ((withoutBlocking - withBlocking) / withoutBlocking) * 100
}

/**
 * Analyzes block distribution to detect skewness.
 *
 * @param blocks - Map of block keys to record arrays
 * @returns Distribution statistics
 */
export function analyzeBlockDistribution<T>(blocks: Map<string, T[]>) {
  const blockSizes = Array.from(blocks.values()).map((block) => block.length)

  if (blockSizes.length === 0) {
    return {
      totalBlocks: 0,
      avgBlockSize: 0,
      minBlockSize: 0,
      maxBlockSize: 0,
      stdDeviation: 0,
      skewness: 0,
    }
  }

  const totalBlocks = blockSizes.length
  const avgBlockSize = blockSizes.reduce((sum, size) => sum + size, 0) / totalBlocks
  const minBlockSize = Math.min(...blockSizes)
  const maxBlockSize = Math.max(...blockSizes)

  // Calculate standard deviation
  const squaredDiffs = blockSizes.map((size) => Math.pow(size - avgBlockSize, 2))
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / totalBlocks
  const stdDeviation = Math.sqrt(variance)

  // Calculate skewness (simple measure: (max - avg) / stdDev)
  const skewness = stdDeviation > 0 ? (maxBlockSize - avgBlockSize) / stdDeviation : 0

  return {
    totalBlocks,
    avgBlockSize,
    minBlockSize,
    maxBlockSize,
    stdDeviation,
    skewness,
  }
}

/**
 * Measures execution time of a function.
 *
 * @param fn - Function to measure
 * @returns Execution time in milliseconds
 */
export function measureTime(fn: () => void): number {
  const start = performance.now()
  fn()
  const end = performance.now()
  return end - start
}
