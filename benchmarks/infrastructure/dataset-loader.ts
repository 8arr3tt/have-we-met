/**
 * Dataset loading utilities for benchmark testing.
 * Supports CSV, JSON, and common record linkage benchmark formats.
 */

export interface DatasetRecord {
  id: string | number
  [key: string]: unknown
}

export interface LabeledPair {
  id1: string | number
  id2: string | number
  isMatch: boolean
}

export interface LoadedDataset<T extends DatasetRecord = DatasetRecord> {
  name: string
  records: T[]
  truePairs?: LabeledPair[]
  metadata: DatasetMetadata
}

export interface DatasetMetadata {
  recordCount: number
  fieldCount: number
  fields: string[]
  truePairCount?: number
  loadTimeMs: number
  format: 'csv' | 'json' | 'febrl' | 'custom'
}

export interface CSVParseOptions {
  delimiter?: string
  hasHeader?: boolean
  headerRow?: string[]
  skipRows?: number
  encoding?: BufferEncoding
  idField?: string
}

export interface JSONParseOptions {
  recordsPath?: string
  idField?: string
  pairsPath?: string
}

export interface FebrlParseOptions {
  includeOriginalId?: boolean
}

/**
 * Parses a CSV string into records.
 */
export function parseCSV<T extends DatasetRecord = DatasetRecord>(
  content: string,
  options: CSVParseOptions = {}
): T[] {
  const {
    delimiter = ',',
    hasHeader = true,
    headerRow,
    skipRows = 0,
    idField = 'id',
  } = options

  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(skipRows)

  if (lines.length === 0) {
    return []
  }

  let headers: string[]
  let dataLines: string[]

  if (headerRow) {
    headers = headerRow
    dataLines = lines
  } else if (hasHeader) {
    headers = parseCSVLine(lines[0], delimiter)
    dataLines = lines.slice(1)
  } else {
    headers = Array.from(
      { length: parseCSVLine(lines[0], delimiter).length },
      (_, i) => `field_${i}`
    )
    dataLines = lines
  }

  const records: T[] = []
  let autoId = 1

  for (const line of dataLines) {
    const values = parseCSVLine(line, delimiter)
    const record: Record<string, unknown> = {}

    headers.forEach((header, index) => {
      record[header] = values[index] ?? null
    })

    if (record[idField] === undefined || record[idField] === null) {
      record[idField] = autoId++
    }

    records.push(record as T)
  }

  return records
}

/**
 * Parses a single CSV line, handling quoted fields.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Parses a JSON string into records.
 */
export function parseJSON<T extends DatasetRecord = DatasetRecord>(
  content: string,
  options: JSONParseOptions = {}
): { records: T[]; pairs?: LabeledPair[] } {
  const { recordsPath, idField = 'id', pairsPath } = options

  const data = JSON.parse(content) as Record<string, unknown>

  let records: T[]
  if (recordsPath) {
    const path = recordsPath.split('.')
    let current: unknown = data
    for (const key of path) {
      current = (current as Record<string, unknown>)?.[key]
    }
    records = (current as T[]) ?? []
  } else if (Array.isArray(data)) {
    records = data as T[]
  } else if (data.records && Array.isArray(data.records)) {
    records = data.records as T[]
  } else {
    records = [data as T]
  }

  let autoId = 1
  records = records.map((record) => {
    if (record[idField] === undefined || record[idField] === null) {
      return { ...record, [idField]: autoId++ }
    }
    return record
  })

  let pairs: LabeledPair[] | undefined
  if (pairsPath) {
    const path = pairsPath.split('.')
    let current: unknown = data
    for (const key of path) {
      current = (current as Record<string, unknown>)?.[key]
    }
    pairs = current as LabeledPair[]
  } else if (data.pairs && Array.isArray(data.pairs)) {
    pairs = data.pairs as LabeledPair[]
  }

  return { records, pairs }
}

/**
 * Parses Febrl synthetic dataset format.
 * Febrl datasets have records with rec_id field and optional org_rec for duplicates.
 */
export function parseFebrl<T extends DatasetRecord = DatasetRecord>(
  content: string,
  options: FebrlParseOptions = {}
): { records: T[]; pairs: LabeledPair[] } {
  const { includeOriginalId = true } = options

  const records = parseCSV<T & { rec_id: string; org_rec?: string }>(content)
  const pairs: LabeledPair[] = []

  const originalRecords = new Map<string, string>()

  for (const record of records) {
    const recId = record.rec_id

    if (record.org_rec) {
      originalRecords.set(recId, record.org_rec)
    }
  }

  for (const [dupId, origId] of originalRecords.entries()) {
    pairs.push({
      id1: origId,
      id2: dupId,
      isMatch: true,
    })
  }

  const processedRecords = records.map((record) => {
    const processed = { ...record, id: record.rec_id }
    if (!includeOriginalId) {
      delete (processed as Record<string, unknown>).org_rec
    }
    return processed as T
  })

  return { records: processedRecords, pairs }
}

/**
 * Parses a pairs file (true matches file).
 * Supports CSV format with id1,id2 columns.
 */
export function parsePairsFile(
  content: string,
  options: { delimiter?: string; hasHeader?: boolean } = {}
): LabeledPair[] {
  const { delimiter = ',', hasHeader = true } = options

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  const dataLines = hasHeader ? lines.slice(1) : lines
  const pairs: LabeledPair[] = []

  for (const line of dataLines) {
    const values = parseCSVLine(line, delimiter)
    if (values.length >= 2) {
      pairs.push({
        id1: values[0],
        id2: values[1],
        isMatch:
          values.length > 2
            ? values[2].toLowerCase() === 'true' || values[2] === '1'
            : true,
      })
    }
  }

  return pairs
}

/**
 * Creates a LoadedDataset from parsed data.
 */
export function createLoadedDataset<T extends DatasetRecord>(
  name: string,
  records: T[],
  truePairs: LabeledPair[] | undefined,
  format: DatasetMetadata['format'],
  loadTimeMs: number
): LoadedDataset<T> {
  const fields = records.length > 0 ? Object.keys(records[0]) : []

  return {
    name,
    records,
    truePairs,
    metadata: {
      recordCount: records.length,
      fieldCount: fields.length,
      fields,
      truePairCount: truePairs?.length,
      loadTimeMs,
      format,
    },
  }
}

/**
 * Loads a dataset from string content based on format.
 */
export function loadDataset<T extends DatasetRecord = DatasetRecord>(
  name: string,
  content: string,
  format: 'csv' | 'json' | 'febrl',
  options: CSVParseOptions | JSONParseOptions | FebrlParseOptions = {}
): LoadedDataset<T> {
  const startTime = performance.now()

  let records: T[]
  let pairs: LabeledPair[] | undefined

  switch (format) {
    case 'csv': {
      records = parseCSV<T>(content, options as CSVParseOptions)
      break
    }
    case 'json': {
      const result = parseJSON<T>(content, options as JSONParseOptions)
      records = result.records
      pairs = result.pairs
      break
    }
    case 'febrl': {
      const result = parseFebrl<T>(content, options as FebrlParseOptions)
      records = result.records
      pairs = result.pairs
      break
    }
    default:
      throw new Error(`Unsupported format: ${format}`)
  }

  const loadTimeMs = performance.now() - startTime

  return createLoadedDataset(name, records, pairs, format, loadTimeMs)
}

/**
 * Generates synthetic record pairs for testing.
 * Creates all possible pairs (n*(n-1)/2) between records.
 */
export function generateAllPairs<T extends DatasetRecord>(
  records: T[],
  idField: keyof T = 'id' as keyof T
): Array<[T, T]> {
  const pairs: Array<[T, T]> = []

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      pairs.push([records[i], records[j]])
    }
  }

  return pairs
}

/**
 * Converts labeled pairs to a Set for fast lookup.
 */
export function createPairLookup(pairs: LabeledPair[]): Set<string> {
  const lookup = new Set<string>()

  for (const pair of pairs) {
    const key1 = `${pair.id1}|${pair.id2}`
    const key2 = `${pair.id2}|${pair.id1}`
    if (pair.isMatch) {
      lookup.add(key1)
      lookup.add(key2)
    }
  }

  return lookup
}

/**
 * Checks if a pair is a true match.
 */
export function isPairMatch(
  id1: string | number,
  id2: string | number,
  truePairLookup: Set<string>
): boolean {
  return truePairLookup.has(`${id1}|${id2}`)
}
