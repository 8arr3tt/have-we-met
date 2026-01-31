import { describe, it, expect } from 'vitest'
import {
  QueueError,
  QueueItemNotFoundError,
  InvalidStatusTransitionError,
  QueueOperationError,
  QueueValidationError,
} from '../../../src/queue/queue-error.js'

describe('QueueError', () => {
  it('creates a base queue error', () => {
    const error = new QueueError('Test error', 'TEST_ERROR')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(QueueError)
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.name).toBe('QueueError')
  })

  it('includes context when provided', () => {
    const context = { id: '123', field: 'test' }
    const error = new QueueError('Test error', 'TEST_ERROR', context)

    expect(error.context).toEqual(context)
    expect(error.context?.id).toBe('123')
    expect(error.context?.field).toBe('test')
  })

  it('captures stack trace', () => {
    const error = new QueueError('Test error', 'TEST_ERROR')

    expect(error.stack).toBeDefined()
  })
})

describe('QueueItemNotFoundError', () => {
  it('creates error with item ID', () => {
    const error = new QueueItemNotFoundError('queue-123')

    expect(error).toBeInstanceOf(QueueError)
    expect(error).toBeInstanceOf(QueueItemNotFoundError)
    expect(error.message).toBe('Queue item not found: queue-123')
    expect(error.code).toBe('QUEUE_ITEM_NOT_FOUND')
    expect(error.name).toBe('QueueItemNotFoundError')
    expect(error.context?.id).toBe('queue-123')
  })
})

describe('InvalidStatusTransitionError', () => {
  it('creates error for invalid transition', () => {
    const error = new InvalidStatusTransitionError('confirmed', 'pending')

    expect(error).toBeInstanceOf(QueueError)
    expect(error).toBeInstanceOf(InvalidStatusTransitionError)
    expect(error.message).toBe("Invalid status transition from 'confirmed' to 'pending'")
    expect(error.code).toBe('INVALID_STATUS_TRANSITION')
    expect(error.name).toBe('InvalidStatusTransitionError')
    expect(error.context?.from).toBe('confirmed')
    expect(error.context?.to).toBe('pending')
  })

  it('includes reason when provided', () => {
    const error = new InvalidStatusTransitionError(
      'confirmed',
      'pending',
      "'confirmed' is a final state",
    )

    expect(error.message).toContain("'confirmed' is a final state")
    expect(error.context?.reason).toBe("'confirmed' is a final state")
  })
})

describe('QueueOperationError', () => {
  it('creates error with operation details', () => {
    const error = new QueueOperationError('add', 'Database connection failed')

    expect(error).toBeInstanceOf(QueueError)
    expect(error).toBeInstanceOf(QueueOperationError)
    expect(error.message).toBe("Queue operation 'add' failed: Database connection failed")
    expect(error.code).toBe('QUEUE_OPERATION_FAILED')
    expect(error.name).toBe('QueueOperationError')
    expect(error.context?.operation).toBe('add')
    expect(error.context?.reason).toBe('Database connection failed')
  })

  it('includes additional context when provided', () => {
    const error = new QueueOperationError('confirm', 'Item not found', { id: 'queue-123' })

    expect(error.context?.operation).toBe('confirm')
    expect(error.context?.reason).toBe('Item not found')
    expect(error.context?.id).toBe('queue-123')
  })
})

describe('QueueValidationError', () => {
  it('creates error with field and reason', () => {
    const error = new QueueValidationError('candidateRecord', 'candidateRecord must not be empty')

    expect(error).toBeInstanceOf(QueueError)
    expect(error).toBeInstanceOf(QueueValidationError)
    expect(error.message).toBe(
      "Queue validation failed for 'candidateRecord': candidateRecord must not be empty",
    )
    expect(error.code).toBe('QUEUE_VALIDATION_ERROR')
    expect(error.name).toBe('QueueValidationError')
    expect(error.context?.field).toBe('candidateRecord')
    expect(error.context?.reason).toBe('candidateRecord must not be empty')
  })

  it('includes additional context when provided', () => {
    const error = new QueueValidationError('priority', 'priority must be a number', {
      value: 'invalid',
    })

    expect(error.context?.field).toBe('priority')
    expect(error.context?.reason).toBe('priority must be a number')
    expect(error.context?.value).toBe('invalid')
  })
})
