import { describe, it, expect } from 'vitest'
import {
  type QueueOptions,
  type AlertThresholds,
  DEFAULT_QUEUE_OPTIONS,
  mergeQueueOptions,
} from '../../../src/builder/queue-options'

describe('Queue Options', () => {
  describe('DEFAULT_QUEUE_OPTIONS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_QUEUE_OPTIONS.autoExpireAfter).toBe(30 * 24 * 60 * 60 * 1000) // 30 days
      expect(DEFAULT_QUEUE_OPTIONS.defaultPriority).toBe(0)
      expect(DEFAULT_QUEUE_OPTIONS.enableMetrics).toBe(true)
      expect(DEFAULT_QUEUE_OPTIONS.alertThresholds).toBeDefined()
    })

    it('has valid alert thresholds', () => {
      const { alertThresholds } = DEFAULT_QUEUE_OPTIONS
      expect(alertThresholds.maxQueueSize).toBe(1000)
      expect(alertThresholds.maxAge).toBe(7 * 24 * 60 * 60 * 1000) // 7 days
      expect(alertThresholds.minThroughput).toBe(10)
    })
  })

  describe('mergeQueueOptions', () => {
    it('returns defaults when no options provided', () => {
      const merged = mergeQueueOptions(undefined)
      expect(merged).toEqual(DEFAULT_QUEUE_OPTIONS)
    })

    it('returns defaults when empty options provided', () => {
      const merged = mergeQueueOptions({})
      expect(merged).toEqual(DEFAULT_QUEUE_OPTIONS)
    })

    it('merges partial options with defaults', () => {
      const options: QueueOptions = {
        autoExpireAfter: 7 * 24 * 60 * 60 * 1000, // 7 days
      }
      const merged = mergeQueueOptions(options)

      expect(merged.autoExpireAfter).toBe(7 * 24 * 60 * 60 * 1000)
      expect(merged.defaultPriority).toBe(DEFAULT_QUEUE_OPTIONS.defaultPriority)
      expect(merged.enableMetrics).toBe(DEFAULT_QUEUE_OPTIONS.enableMetrics)
      expect(merged.alertThresholds).toEqual(DEFAULT_QUEUE_OPTIONS.alertThresholds)
    })

    it('merges custom priority', () => {
      const options: QueueOptions = {
        defaultPriority: 5,
      }
      const merged = mergeQueueOptions(options)

      expect(merged.defaultPriority).toBe(5)
      expect(merged.autoExpireAfter).toBe(DEFAULT_QUEUE_OPTIONS.autoExpireAfter)
    })

    it('merges metrics flag', () => {
      const options: QueueOptions = {
        enableMetrics: false,
      }
      const merged = mergeQueueOptions(options)

      expect(merged.enableMetrics).toBe(false)
      expect(merged.autoExpireAfter).toBe(DEFAULT_QUEUE_OPTIONS.autoExpireAfter)
    })

    it('merges partial alert thresholds', () => {
      const options: QueueOptions = {
        alertThresholds: {
          maxQueueSize: 500,
        },
      }
      const merged = mergeQueueOptions(options)

      expect(merged.alertThresholds.maxQueueSize).toBe(500)
      expect(merged.alertThresholds.maxAge).toBe(DEFAULT_QUEUE_OPTIONS.alertThresholds.maxAge)
      expect(merged.alertThresholds.minThroughput).toBe(
        DEFAULT_QUEUE_OPTIONS.alertThresholds.minThroughput
      )
    })

    it('merges complete alert thresholds', () => {
      const customThresholds: AlertThresholds = {
        maxQueueSize: 2000,
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        minThroughput: 50,
      }
      const options: QueueOptions = {
        alertThresholds: customThresholds,
      }
      const merged = mergeQueueOptions(options)

      expect(merged.alertThresholds).toEqual(customThresholds)
    })

    it('merges all options', () => {
      const customOptions: QueueOptions = {
        autoExpireAfter: 14 * 24 * 60 * 60 * 1000, // 14 days
        defaultPriority: 10,
        enableMetrics: false,
        alertThresholds: {
          maxQueueSize: 5000,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          minThroughput: 100,
        },
      }
      const merged = mergeQueueOptions(customOptions)

      expect(merged).toEqual(customOptions)
    })

    it('handles zero values correctly', () => {
      const options: QueueOptions = {
        defaultPriority: 0,
        autoExpireAfter: 0,
      }
      const merged = mergeQueueOptions(options)

      // Zero values should not be overridden by defaults
      expect(merged.defaultPriority).toBe(0)
      expect(merged.autoExpireAfter).toBe(0)
    })

    it('does not mutate input options', () => {
      const options: QueueOptions = {
        defaultPriority: 5,
        alertThresholds: {
          maxQueueSize: 100,
        },
      }
      const originalOptions = JSON.parse(JSON.stringify(options))

      mergeQueueOptions(options)

      expect(options).toEqual(originalOptions)
    })

    it('returns a new object each time', () => {
      const options: QueueOptions = { defaultPriority: 5 }

      const merged1 = mergeQueueOptions(options)
      const merged2 = mergeQueueOptions(options)

      expect(merged1).not.toBe(merged2)
      expect(merged1).toEqual(merged2)
    })
  })

  describe('QueueOptions type', () => {
    it('allows all fields to be optional', () => {
      const options1: QueueOptions = {}
      const options2: QueueOptions = { autoExpireAfter: 1000 }
      const options3: QueueOptions = { defaultPriority: 1 }
      const options4: QueueOptions = { enableMetrics: true }
      const options5: QueueOptions = { alertThresholds: {} }

      expect(options1).toBeDefined()
      expect(options2).toBeDefined()
      expect(options3).toBeDefined()
      expect(options4).toBeDefined()
      expect(options5).toBeDefined()
    })

    it('allows all alert threshold fields to be optional', () => {
      const thresholds1: AlertThresholds = {}
      const thresholds2: AlertThresholds = { maxQueueSize: 1000 }
      const thresholds3: AlertThresholds = { maxAge: 1000 }
      const thresholds4: AlertThresholds = { minThroughput: 10 }

      expect(thresholds1).toBeDefined()
      expect(thresholds2).toBeDefined()
      expect(thresholds3).toBeDefined()
      expect(thresholds4).toBeDefined()
    })
  })
})
