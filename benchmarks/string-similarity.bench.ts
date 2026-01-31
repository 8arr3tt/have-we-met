import { bench, describe } from 'vitest'
import {
  levenshtein,
  jaroWinkler,
  soundex,
  soundexEncode,
  metaphone,
  metaphoneEncode,
} from '../src/core/comparators'

// Test data sets
const shortStrings = {
  a: 'Martha',
  b: 'Marhta',
}

const mediumStrings = {
  a: '123 Main Street, Apartment 4B',
  b: '123 Main St, Apt 4B',
}

const longStrings = {
  a: 'The quick brown fox jumps over the lazy dog. This is a longer string used to test performance on larger text.',
  b: 'The quick brown fox jumped over the lazy dog. This is a longer string used to test performance with larger text.',
}

const nameList = [
  'Robert',
  'Rupert',
  'Smith',
  'Smyth',
  'Christine',
  'Kristine',
  'Knight',
  'Night',
]

// Benchmark suites
describe('Levenshtein Performance', () => {
  bench('short strings (5-10 chars)', () => {
    levenshtein(shortStrings.a, shortStrings.b)
  })

  bench('medium strings (20-50 chars)', () => {
    levenshtein(mediumStrings.a, mediumStrings.b)
  })

  bench('long strings (100+ chars)', () => {
    levenshtein(longStrings.a, longStrings.b)
  })

  bench('batch: 1000 short string comparisons', () => {
    for (let i = 0; i < 1000; i++) {
      levenshtein(shortStrings.a, shortStrings.b)
    }
  })
})

describe('Jaro-Winkler Performance', () => {
  bench('short strings (5-10 chars)', () => {
    jaroWinkler(shortStrings.a, shortStrings.b)
  })

  bench('medium strings (20-50 chars)', () => {
    jaroWinkler(mediumStrings.a, mediumStrings.b)
  })

  bench('long strings (100+ chars)', () => {
    jaroWinkler(longStrings.a, longStrings.b)
  })

  bench('batch: 1000 name comparisons', () => {
    for (let i = 0; i < 1000; i++) {
      jaroWinkler(nameList[i % 8], nameList[(i + 1) % 8])
    }
  })
})

describe('Soundex Performance', () => {
  bench('encoding: short name', () => {
    soundexEncode('Robert')
  })

  bench('encoding: batch 1000 names', () => {
    for (let i = 0; i < 1000; i++) {
      soundexEncode(nameList[i % 8])
    }
  })

  bench('comparison: short names', () => {
    soundex('Robert', 'Rupert')
  })

  bench('comparison: medium strings', () => {
    soundex(mediumStrings.a, mediumStrings.b)
  })

  bench('batch: 1000 name comparisons', () => {
    for (let i = 0; i < 1000; i++) {
      soundex(nameList[i % 8], nameList[(i + 1) % 8])
    }
  })
})

describe('Metaphone Performance', () => {
  bench('encoding: short name', () => {
    metaphoneEncode('Christine')
  })

  bench('encoding: batch 1000 names', () => {
    for (let i = 0; i < 1000; i++) {
      metaphoneEncode(nameList[i % 8])
    }
  })

  bench('comparison: short names', () => {
    metaphone('Christine', 'Kristine')
  })

  bench('comparison: medium strings', () => {
    metaphone(mediumStrings.a, mediumStrings.b)
  })

  bench('batch: 1000 name comparisons', () => {
    for (let i = 0; i < 1000; i++) {
      metaphone(nameList[i % 8], nameList[(i + 1) % 8])
    }
  })
})

describe('Algorithm Comparison', () => {
  const testPairs = [
    ['John', 'Jon'],
    ['Smith', 'Smyth'],
    ['Christine', 'Christina'],
    ['Robert', 'Roberto'],
  ]

  bench('Levenshtein on multiple name pairs', () => {
    testPairs.forEach(([a, b]) => levenshtein(a, b))
  })

  bench('Jaro-Winkler on multiple name pairs', () => {
    testPairs.forEach(([a, b]) => jaroWinkler(a, b))
  })

  bench('Soundex on multiple name pairs', () => {
    testPairs.forEach(([a, b]) => soundex(a, b))
  })

  bench('Metaphone on multiple name pairs', () => {
    testPairs.forEach(([a, b]) => metaphone(a, b))
  })
})
