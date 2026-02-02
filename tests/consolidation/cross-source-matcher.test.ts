import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CrossSourceMatcher,
  createCrossSourceMatcher,
  type CrossSourceMatcherConfig,
} from '../../src/consolidation/cross-source-matcher'
import type {
  ConsolidationSource,
  MatchingScope,
} from '../../src/consolidation/types'
import { MatchingScope as MatchingScopeEnum } from '../../src/consolidation/types'
import type { DatabaseAdapter } from '../../src/adapters/types'
import type { Resolver } from '../../src/core/resolver'
import type { MatchResult } from '../../src/core/scoring/types'

// Test data types
interface CRMCustomer {
  id: number
  customer_name: string
  email_address: string
  phone_number: string
}

interface BillingAccount {
  account_id: number
  full_name: string
  email: string
  mobile: string
}

interface UnifiedCustomer {
  name: string
  email: string
  phone: string
}

describe('CrossSourceMatcher', () => {
  let mockCRMAdapter: DatabaseAdapter<CRMCustomer>
  let mockBillingAdapter: DatabaseAdapter<BillingAccount>
  let mockResolver: Resolver<UnifiedCustomer>

  let crmSource: ConsolidationSource<CRMCustomer, UnifiedCustomer>
  let billingSource: ConsolidationSource<BillingAccount, UnifiedCustomer>

  beforeEach(() => {
    // Mock CRM adapter
    mockCRMAdapter = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: 1,
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        {
          id: 2,
          customer_name: 'Jane Doe',
          email_address: 'jane@example.com',
          phone_number: '555-0002',
        },
      ]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any

    // Mock billing adapter
    mockBillingAdapter = {
      findAll: vi.fn().mockResolvedValue([
        {
          account_id: 101,
          full_name: 'John Smith',
          email: 'john@example.com',
          mobile: '555-0001',
        },
        {
          account_id: 102,
          full_name: 'Bob Johnson',
          email: 'bob@example.com',
          mobile: '555-0003',
        },
      ]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any

    // Mock resolver
    mockResolver = {
      resolve: vi.fn().mockReturnValue([]),
    } as any

    // Source configurations
    crmSource = {
      sourceId: 'crm_db',
      name: 'CRM Database',
      adapter: mockCRMAdapter,
      mapping: {
        name: { sourceField: 'customer_name' },
        email: { sourceField: 'email_address' },
        phone: { sourceField: 'phone_number' },
      },
      priority: 1,
    }

    billingSource = {
      sourceId: 'billing_db',
      name: 'Billing Database',
      adapter: mockBillingAdapter,
      mapping: {
        name: { sourceField: 'full_name' },
        email: { sourceField: 'email' },
        phone: { sourceField: 'mobile' },
      },
      priority: 2,
    }
  })

  describe('constructor', () => {
    it('should create matcher with valid configuration', () => {
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [crmSource, billingSource],
        resolver: mockResolver,
        matchingScope: MatchingScopeEnum.WithinSourceFirst,
      }

      const matcher = new CrossSourceMatcher(config)

      expect(matcher).toBeInstanceOf(CrossSourceMatcher)
      expect(matcher.getMatchingScope()).toBe(
        MatchingScopeEnum.WithinSourceFirst
      )
      expect(matcher.getSources()).toHaveLength(2)
    })

    it('should default to within-source-first matching scope', () => {
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [crmSource],
        resolver: mockResolver,
      }

      const matcher = new CrossSourceMatcher(config)

      expect(matcher.getMatchingScope()).toBe(
        MatchingScopeEnum.WithinSourceFirst
      )
    })

    it('should throw error if no sources provided', () => {
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [],
        resolver: mockResolver,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'At least one source is required'
      )
    })

    it('should throw error if resolver not provided', () => {
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [crmSource],
        resolver: undefined as any,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'Resolver is required'
      )
    })

    it('should throw error if source IDs are not unique', () => {
      const duplicateSource = { ...billingSource, sourceId: 'crm_db' }
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [crmSource, duplicateSource],
        resolver: mockResolver,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'Duplicate source ID: crm_db'
      )
    })

    it('should throw error if source missing sourceId', () => {
      const invalidSource = { ...crmSource, sourceId: '' }
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [invalidSource],
        resolver: mockResolver,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'Source must have a sourceId'
      )
    })

    it('should throw error if source missing adapter', () => {
      const invalidSource = { ...crmSource, adapter: undefined as any }
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [invalidSource],
        resolver: mockResolver,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'must have an adapter'
      )
    })

    it('should throw error if source missing mappings', () => {
      const invalidSource = { ...crmSource, mapping: {} as any }
      const config: CrossSourceMatcherConfig<UnifiedCustomer> = {
        sources: [invalidSource],
        resolver: mockResolver,
      }

      expect(() => new CrossSourceMatcher(config)).toThrow(
        'must have field mappings'
      )
    })
  })

  describe('matchRecord', () => {
    it('should match record across all sources', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Strong match',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const candidateRecord = {
        customer_name: 'John Smith',
        email_address: 'john@example.com',
        phone_number: '555-0001',
      }

      const results = await matcher.matchRecord(candidateRecord, 'crm_db')

      expect(results).toHaveLength(1)
      expect(results[0].score).toBe(50)
      expect(results[0].matches).toHaveLength(1)
      expect(results[0].matches[0].sourceId).toBeDefined()
    })

    it('should exclude candidate record from matching pool', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const candidateRecord = {
        id: 1,
        customer_name: 'John Smith',
        email_address: 'john@example.com',
        phone_number: '555-0001',
      }

      await matcher.matchRecord(candidateRecord, 'crm_db')

      // Verify resolver was called with records excluding the candidate
      expect(mockResolver.resolve).toHaveBeenCalled()
      const callArgs = (mockResolver.resolve as any).mock.calls[0]
      const existingRecords = callArgs[1]

      // Should only have 1 record (Jane Doe), not 2
      expect(existingRecords).toHaveLength(1)
    })

    it('should return empty array if no matches found', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'Unknown Person',
          email_address: 'unknown@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(results).toHaveLength(0)
    })

    it('should respect maxResults option', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Match 1',
        },
        {
          outcome: 'potential-match',
          candidateRecord: {
            name: 'Jane Doe',
            email: 'jane@example.com',
            phone: '555-0002',
          },
          score: {
            totalScore: 35,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.58,
          },
          explanation: 'Match 2',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db',
        { maxResults: 1 }
      )

      // maxResults is passed to resolver, so we expect it to be called with that option
      expect(mockResolver.resolve).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Array),
        expect.objectContaining({ maxResults: 1 })
      )
    })

    it('should filter by minimum score', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'High score',
        },
        {
          outcome: 'potential-match',
          candidateRecord: {
            name: 'Jane Doe',
            email: 'jane@example.com',
            phone: '555-0002',
          },
          score: {
            totalScore: 15,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.25,
          },
          explanation: 'Low score',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db',
        { minScore: 20 }
      )

      expect(results).toHaveLength(1)
      expect(results[0].score).toBe(50)
    })
  })

  describe('matchWithinSource', () => {
    it('should match only within the same source', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      await matcher.matchWithinSource(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(mockCRMAdapter.findAll).toHaveBeenCalled()
      expect(mockBillingAdapter.findAll).not.toHaveBeenCalled()
    })

    it('should throw error if source not found', async () => {
      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      await expect(
        matcher.matchWithinSource(
          { full_name: 'Test', email: 'test@example.com', mobile: '' },
          'nonexistent_db'
        )
      ).rejects.toThrow('Source not found: nonexistent_db')
    })

    it('should exclude candidate from results', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const candidateRecord = {
        id: 1,
        customer_name: 'John Smith',
        email_address: 'john@example.com',
        phone_number: '555-0001',
      }

      await matcher.matchWithinSource(candidateRecord, 'crm_db')

      const callArgs = (mockResolver.resolve as any).mock.calls[0]
      const existingRecords = callArgs[1]

      // Should only have Jane Doe (id: 2)
      expect(existingRecords).toHaveLength(1)
    })
  })

  describe('matchCrossSources', () => {
    it('should match only across different sources', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      await matcher.matchCrossSources(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      // Should load from billing but not CRM
      expect(mockBillingAdapter.findAll).toHaveBeenCalled()
      expect(mockCRMAdapter.findAll).not.toHaveBeenCalled()
    })

    it('should return matches from other sources only', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Cross-source match',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchCrossSources(
        {
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        'crm_db'
      )

      expect(results).toHaveLength(1)
      expect(results[0].matches[0].sourceId).toBe('billing_db')
    })

    it('should return empty array if no cross-source matches', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchCrossSources(
        {
          customer_name: 'Unique Person',
          email_address: 'unique@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(results).toHaveLength(0)
    })
  })

  describe('matchUnifiedPool', () => {
    it('should be equivalent to matchRecord', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const record = {
        customer_name: 'Test',
        email_address: 'test@example.com',
        phone_number: '',
      }

      const results1 = await matcher.matchRecord(record, 'crm_db')
      const results2 = await matcher.matchUnifiedPool(record, 'crm_db')

      expect(results1).toEqual(results2)
    })
  })

  describe('matchBatch', () => {
    it('should match multiple records efficiently', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const records = [
        {
          customer_name: 'Record 1',
          email_address: 'r1@example.com',
          phone_number: '',
        },
        {
          customer_name: 'Record 2',
          email_address: 'r2@example.com',
          phone_number: '',
        },
        {
          customer_name: 'Record 3',
          email_address: 'r3@example.com',
          phone_number: '',
        },
      ]

      const results = await matcher.matchBatch(records, 'crm_db')

      expect(results).toHaveLength(3)
      expect(mockCRMAdapter.findAll).toHaveBeenCalledTimes(1) // Only load once
      expect(mockResolver.resolve).toHaveBeenCalledTimes(3) // Match 3 times
    })

    it('should exclude each candidate from its own matching pool', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const records = [
        {
          id: 1,
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        {
          id: 2,
          customer_name: 'Jane Doe',
          email_address: 'jane@example.com',
          phone_number: '555-0002',
        },
      ]

      await matcher.matchBatch(records, 'crm_db')

      // Each call should exclude the specific candidate
      const calls = (mockResolver.resolve as any).mock.calls

      // First call should exclude John Smith
      expect(calls[0][1]).toHaveLength(1)

      // Second call should exclude Jane Doe
      expect(calls[1][1]).toHaveLength(1)
    })

    it('should handle empty batch', async () => {
      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchBatch([], 'crm_db')

      expect(results).toHaveLength(0)
      expect(mockCRMAdapter.findAll).toHaveBeenCalledTimes(1) // Still loads records
    })
  })

  describe('getSources and getSource', () => {
    it('should return all sources', () => {
      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const sources = matcher.getSources()

      expect(sources).toHaveLength(2)
      expect(sources[0].sourceId).toBe('crm_db')
      expect(sources[1].sourceId).toBe('billing_db')
    })

    it('should get source by ID', () => {
      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const source = matcher.getSource('billing_db')

      expect(source).toBeDefined()
      expect(source?.sourceId).toBe('billing_db')
      expect(source?.name).toBe('Billing Database')
    })

    it('should return undefined for non-existent source', () => {
      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const source = matcher.getSource('nonexistent')

      expect(source).toBeUndefined()
    })
  })

  describe('schema mapping', () => {
    it('should map records to unified schema', async () => {
      mockResolver.resolve = vi.fn((candidate, existing) => {
        // Verify candidate was mapped correctly
        expect(candidate.name).toBe('John Smith')
        expect(candidate.email).toBe('john@example.com')
        expect(candidate.phone).toBe('555-0001')
        return []
      })

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      await matcher.matchRecord(
        {
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        'crm_db'
      )

      expect(mockResolver.resolve).toHaveBeenCalled()
    })

    it('should handle mapping errors gracefully', async () => {
      // Create source with transform that throws error
      const problematicSource: ConsolidationSource<
        CRMCustomer,
        UnifiedCustomer
      > = {
        ...crmSource,
        mapping: {
          name: {
            transform: () => {
              throw new Error('Transform error')
            },
          },
          email: { sourceField: 'email_address' },
          phone: { sourceField: 'phone_number' },
        },
      }

      const matcher = new CrossSourceMatcher({
        sources: [problematicSource],
        resolver: mockResolver,
      })

      await expect(
        matcher.matchRecord(
          {
            customer_name: 'Test',
            email_address: 'test@example.com',
            phone_number: '',
          },
          'crm_db'
        )
      ).rejects.toThrow('Failed to map record')
    })

    it('should preserve original record in mapped result', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const originalRecord = {
        id: 1,
        customer_name: 'John Smith',
        email_address: 'john@example.com',
        phone_number: '555-0001',
      }

      await matcher.matchRecord(originalRecord, 'crm_db')

      // Verify internal mapping preserves original
      // This is validated through the fact that we can exclude by ID
      expect(mockResolver.resolve).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should throw error if adapter fails to load records', async () => {
      mockCRMAdapter.findAll = vi
        .fn()
        .mockRejectedValue(new Error('Database error'))

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      await expect(
        matcher.matchRecord(
          {
            customer_name: 'Test',
            email_address: 'test@example.com',
            phone_number: '',
          },
          'crm_db'
        )
      ).rejects.toThrow('Failed to load records from source crm_db')
    })

    it('should skip records with mapping errors during load', async () => {
      // Mock console.warn to suppress output
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Add a source with a transform that throws for certain records
      const problematicSource: ConsolidationSource<
        CRMCustomer,
        UnifiedCustomer
      > = {
        ...crmSource,
        mapping: {
          name: {
            transform: (input) => {
              if (!input.customer_name) {
                throw new Error('customer_name is required')
              }
              return input.customer_name
            },
          },
          email: { sourceField: 'email_address' },
          phone: { sourceField: 'phone_number' },
        },
      }

      // Mock adapter to return a record that will fail the transform
      const problematicAdapter = {
        ...mockCRMAdapter,
        findAll: vi.fn().mockResolvedValue([
          {
            id: 1,
            customer_name: 'Valid Record',
            email_address: 'valid@example.com',
            phone_number: '555-0001',
          },
          {
            id: 2,
            customer_name: undefined, // Will fail transform
            email_address: 'invalid@example.com',
            phone_number: '555-0002',
          },
        ]),
      }

      problematicSource.adapter = problematicAdapter as any

      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [problematicSource],
        resolver: mockResolver,
      })

      // Should not throw, but warn about the failed record
      await matcher.matchRecord(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(warnSpy).toHaveBeenCalled()
      expect(mockResolver.resolve).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('should throw error if mapper not found for source', async () => {
      mockResolver.resolve = vi.fn().mockReturnValue([])

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      // Try to match from a source that wasn't configured
      await expect(
        matcher.matchRecord(
          { full_name: 'Test', email: 'test@example.com', mobile: '' },
          'unknown_source'
        )
      ).rejects.toThrow('No mapper found for source: unknown_source')
    })
  })

  describe('createCrossSourceMatcher factory', () => {
    it('should create matcher using factory function', () => {
      const matcher = createCrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      expect(matcher).toBeInstanceOf(CrossSourceMatcher)
    })

    it('should pass configuration correctly', () => {
      const matcher = createCrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
        matchingScope: MatchingScopeEnum.UnifiedPool,
      })

      expect(matcher.getMatchingScope()).toBe(MatchingScopeEnum.UnifiedPool)
      expect(matcher.getSources()).toHaveLength(2)
    })
  })

  describe('source provenance tracking', () => {
    it('should track source ID in match results', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Match',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource, billingSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        'crm_db'
      )

      expect(results[0].matches[0].sourceId).toBeDefined()
      expect(['crm_db', 'billing_db']).toContain(results[0].matches[0].sourceId)
    })

    it('should track source record ID', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Match',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(results[0].matches[0].sourceRecordId).toBeDefined()
    })

    it('should preserve original record for debugging', async () => {
      const mockMatches: MatchResult<UnifiedCustomer>[] = [
        {
          outcome: 'definite-match',
          candidateRecord: {
            name: 'John Smith',
            email: 'john@example.com',
            phone: '555-0001',
          },
          score: {
            totalScore: 50,
            fieldScores: [],
            maxPossibleScore: 60,
            normalizedScore: 0.83,
          },
          explanation: 'Match',
        },
      ]

      mockResolver.resolve = vi.fn().mockReturnValue(mockMatches)

      const matcher = new CrossSourceMatcher({
        sources: [crmSource],
        resolver: mockResolver,
      })

      const results = await matcher.matchRecord(
        {
          customer_name: 'Test',
          email_address: 'test@example.com',
          phone_number: '',
        },
        'crm_db'
      )

      expect(results[0].matches[0].originalRecord).toBeDefined()
      expect(results[0].matches[0].record).toBeDefined()
      expect(results[0].matches[0].record).not.toBe(
        results[0].matches[0].originalRecord
      )
    })
  })
})
