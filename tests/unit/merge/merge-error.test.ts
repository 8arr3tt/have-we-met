import { describe, it, expect } from 'vitest'
import {
  MergeError,
  MergeValidationError,
  MergeConflictError,
  MergeProvenanceError,
  UnmergeError,
  SourceRecordNotFoundError,
  InvalidStrategyError,
  StrategyTypeMismatchError,
  CustomStrategyMissingError,
  ProvenanceNotFoundError,
  InsufficientSourceRecordsError,
} from '../../../src/merge/merge-error.js'
import type { MergeConflict } from '../../../src/merge/types.js'

describe('MergeError', () => {
  it('creates a base merge error', () => {
    const error = new MergeError('Test error', 'TEST_ERROR')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MergeError)
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.name).toBe('MergeError')
  })

  it('includes context when provided', () => {
    const context = { id: '123', field: 'test' }
    const error = new MergeError('Test error', 'TEST_ERROR', context)

    expect(error.context).toEqual(context)
    expect(error.context?.id).toBe('123')
    expect(error.context?.field).toBe('test')
  })

  it('captures stack trace', () => {
    const error = new MergeError('Test error', 'TEST_ERROR')

    expect(error.stack).toBeDefined()
  })
})

describe('MergeValidationError', () => {
  it('creates error with field and reason', () => {
    const error = new MergeValidationError(
      'sourceRecords',
      'must have at least 2 records'
    )

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(MergeValidationError)
    expect(error.message).toBe(
      "Merge validation failed for 'sourceRecords': must have at least 2 records"
    )
    expect(error.code).toBe('MERGE_VALIDATION_ERROR')
    expect(error.name).toBe('MergeValidationError')
    expect(error.context?.field).toBe('sourceRecords')
    expect(error.context?.reason).toBe('must have at least 2 records')
  })

  it('includes additional context when provided', () => {
    const error = new MergeValidationError('strategy', 'invalid strategy', {
      strategy: 'unknown',
    })

    expect(error.context?.field).toBe('strategy')
    expect(error.context?.reason).toBe('invalid strategy')
    expect(error.context?.strategy).toBe('unknown')
  })
})

describe('MergeConflictError', () => {
  it('creates error with conflict details', () => {
    const conflict: MergeConflict = {
      field: 'status',
      values: [
        { recordId: 'rec-001', value: 'active' },
        { recordId: 'rec-002', value: 'inactive' },
      ],
      resolution: 'deferred',
    }
    const error = new MergeConflictError(conflict)

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(MergeConflictError)
    expect(error.message).toBe(
      "Unresolvable merge conflict for field 'status': 2 conflicting values"
    )
    expect(error.code).toBe('MERGE_CONFLICT_ERROR')
    expect(error.name).toBe('MergeConflictError')
    expect(error.conflict).toEqual(conflict)
  })

  it('includes conflict in context', () => {
    const conflict: MergeConflict = {
      field: 'email',
      values: [
        { recordId: 'rec-001', value: 'a@test.com' },
        { recordId: 'rec-002', value: 'b@test.com' },
      ],
      resolution: 'deferred',
    }
    const error = new MergeConflictError(conflict)

    expect(error.context?.conflict).toEqual(conflict)
  })
})

describe('MergeProvenanceError', () => {
  it('creates error with operation details', () => {
    const error = new MergeProvenanceError('save', 'database connection failed')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(MergeProvenanceError)
    expect(error.message).toBe(
      "Provenance tracking failed during 'save': database connection failed"
    )
    expect(error.code).toBe('MERGE_PROVENANCE_ERROR')
    expect(error.name).toBe('MergeProvenanceError')
    expect(error.context?.operation).toBe('save')
    expect(error.context?.reason).toBe('database connection failed')
  })

  it('includes additional context', () => {
    const error = new MergeProvenanceError('update', 'record not found', {
      recordId: 'prov-123',
    })

    expect(error.context?.operation).toBe('update')
    expect(error.context?.recordId).toBe('prov-123')
  })
})

describe('UnmergeError', () => {
  it('creates error with golden record ID and reason', () => {
    const error = new UnmergeError('golden-001', 'provenance not found')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(UnmergeError)
    expect(error.message).toBe(
      "Cannot unmerge record 'golden-001': provenance not found"
    )
    expect(error.code).toBe('UNMERGE_ERROR')
    expect(error.name).toBe('UnmergeError')
    expect(error.context?.goldenRecordId).toBe('golden-001')
    expect(error.context?.reason).toBe('provenance not found')
  })

  it('includes additional context', () => {
    const error = new UnmergeError('golden-002', 'source records deleted', {
      missingRecordIds: ['rec-001', 'rec-002'],
    })

    expect(error.context?.missingRecordIds).toEqual(['rec-001', 'rec-002'])
  })
})

describe('SourceRecordNotFoundError', () => {
  it('creates error with record ID', () => {
    const error = new SourceRecordNotFoundError('rec-123')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(SourceRecordNotFoundError)
    expect(error.message).toBe('Source record not found: rec-123')
    expect(error.code).toBe('SOURCE_RECORD_NOT_FOUND')
    expect(error.name).toBe('SourceRecordNotFoundError')
    expect(error.recordId).toBe('rec-123')
    expect(error.context?.recordId).toBe('rec-123')
  })

  it('includes additional context', () => {
    const error = new SourceRecordNotFoundError('rec-456', {
      searchedIn: 'archive',
    })

    expect(error.context?.searchedIn).toBe('archive')
  })
})

describe('InvalidStrategyError', () => {
  it('creates error with strategy name', () => {
    const error = new InvalidStrategyError('unknownStrategy')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(InvalidStrategyError)
    expect(error.message).toBe("Invalid merge strategy: 'unknownStrategy'")
    expect(error.code).toBe('INVALID_STRATEGY')
    expect(error.name).toBe('InvalidStrategyError')
    expect(error.strategy).toBe('unknownStrategy')
  })

  it('includes field context', () => {
    const error = new InvalidStrategyError('badStrategy', { field: 'email' })

    expect(error.strategy).toBe('badStrategy')
    expect(error.context?.field).toBe('email')
  })
})

describe('StrategyTypeMismatchError', () => {
  it('creates error with type details', () => {
    const error = new StrategyTypeMismatchError(
      'average',
      'firstName',
      'number',
      'string'
    )

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(StrategyTypeMismatchError)
    expect(error.message).toBe(
      "Strategy 'average' cannot be applied to field 'firstName': expected number, got string"
    )
    expect(error.code).toBe('STRATEGY_TYPE_MISMATCH')
    expect(error.name).toBe('StrategyTypeMismatchError')
    expect(error.strategy).toBe('average')
    expect(error.field).toBe('firstName')
    expect(error.expectedType).toBe('number')
    expect(error.actualType).toBe('string')
  })

  it('includes additional context', () => {
    const error = new StrategyTypeMismatchError(
      'sum',
      'tags',
      'number',
      'array',
      {
        suggestion: 'Use union strategy for arrays',
      }
    )

    expect(error.context?.suggestion).toBe('Use union strategy for arrays')
  })
})

describe('CustomStrategyMissingError', () => {
  it('creates error with field name', () => {
    const error = new CustomStrategyMissingError('specialField')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(CustomStrategyMissingError)
    expect(error.message).toBe(
      "Field 'specialField' uses 'custom' strategy but no customMerge function was provided"
    )
    expect(error.code).toBe('CUSTOM_STRATEGY_MISSING')
    expect(error.name).toBe('CustomStrategyMissingError')
    expect(error.field).toBe('specialField')
  })

  it('includes additional context', () => {
    const error = new CustomStrategyMissingError('complexField', {
      hint: 'Provide a customMerge function in the field config',
    })

    expect(error.context?.hint).toBe(
      'Provide a customMerge function in the field config'
    )
  })
})

describe('ProvenanceNotFoundError', () => {
  it('creates error with golden record ID', () => {
    const error = new ProvenanceNotFoundError('golden-789')

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(ProvenanceNotFoundError)
    expect(error.message).toBe(
      "No provenance found for golden record 'golden-789'"
    )
    expect(error.code).toBe('PROVENANCE_NOT_FOUND')
    expect(error.name).toBe('ProvenanceNotFoundError')
    expect(error.goldenRecordId).toBe('golden-789')
  })

  it('includes additional context', () => {
    const error = new ProvenanceNotFoundError('golden-999', {
      suggestion:
        'Record may have been created before provenance tracking was enabled',
    })

    expect(error.context?.suggestion).toContain('before provenance tracking')
  })
})

describe('InsufficientSourceRecordsError', () => {
  it('creates error with record count', () => {
    const error = new InsufficientSourceRecordsError(1)

    expect(error).toBeInstanceOf(MergeError)
    expect(error).toBeInstanceOf(InsufficientSourceRecordsError)
    expect(error.message).toBe(
      'Merge requires at least 2 source records, got 1'
    )
    expect(error.code).toBe('INSUFFICIENT_SOURCE_RECORDS')
    expect(error.name).toBe('InsufficientSourceRecordsError')
    expect(error.recordCount).toBe(1)
  })

  it('handles zero records', () => {
    const error = new InsufficientSourceRecordsError(0)

    expect(error.message).toBe(
      'Merge requires at least 2 source records, got 0'
    )
    expect(error.recordCount).toBe(0)
  })

  it('includes additional context', () => {
    const error = new InsufficientSourceRecordsError(1, {
      recordIds: ['rec-001'],
    })

    expect(error.context?.recordIds).toEqual(['rec-001'])
  })
})
