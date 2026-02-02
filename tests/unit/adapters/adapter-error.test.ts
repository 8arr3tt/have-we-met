import { describe, it, expect } from 'vitest'
import {
  AdapterError,
  ConnectionError,
  QueryError,
  TransactionError,
  ValidationError,
  NotFoundError,
} from '../../../src/adapters/adapter-error'

describe('AdapterError', () => {
  describe('base AdapterError', () => {
    it('creates error with message and code', () => {
      const error = new AdapterError('Test error', 'TEST_ERROR')
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.name).toBe('AdapterError')
      expect(error.context).toBeUndefined()
    })

    it('creates error with context', () => {
      const context = { table: 'users', operation: 'select' }
      const error = new AdapterError('Test error', 'TEST_ERROR', context)
      expect(error.context).toEqual(context)
    })

    it('has correct prototype chain', () => {
      const error = new AdapterError('Test error', 'TEST_ERROR')
      expect(error instanceof AdapterError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('ConnectionError', () => {
    it('creates ConnectionError with correct properties', () => {
      const error = new ConnectionError('Failed to connect to database')
      expect(error).toBeInstanceOf(ConnectionError)
      expect(error).toBeInstanceOf(AdapterError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Failed to connect to database')
      expect(error.code).toBe('CONNECTION_ERROR')
      expect(error.name).toBe('ConnectionError')
    })

    it('creates ConnectionError with context', () => {
      const context = { host: 'localhost', port: 5432, timeout: 5000 }
      const error = new ConnectionError('Connection timeout', context)
      expect(error.context).toEqual(context)
    })
  })

  describe('QueryError', () => {
    it('creates QueryError with correct properties', () => {
      const error = new QueryError('Invalid query syntax')
      expect(error).toBeInstanceOf(QueryError)
      expect(error).toBeInstanceOf(AdapterError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Invalid query syntax')
      expect(error.code).toBe('QUERY_ERROR')
      expect(error.name).toBe('QueryError')
    })

    it('creates QueryError with query details', () => {
      const context = {
        query: 'SELECT * FORM users',
        table: 'users',
        error: 'syntax error',
      }
      const error = new QueryError('Query execution failed', context)
      expect(error.context).toEqual(context)
    })
  })

  describe('TransactionError', () => {
    it('creates TransactionError with correct properties', () => {
      const error = new TransactionError('Transaction rolled back')
      expect(error).toBeInstanceOf(TransactionError)
      expect(error).toBeInstanceOf(AdapterError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Transaction rolled back')
      expect(error.code).toBe('TRANSACTION_ERROR')
      expect(error.name).toBe('TransactionError')
    })

    it('creates TransactionError with rollback info', () => {
      const context = {
        operation: 'insert',
        table: 'users',
        rollback: true,
        reason: 'constraint violation',
      }
      const error = new TransactionError(
        'Transaction rolled back due to constraint violation',
        context
      )
      expect(error.context).toEqual(context)
    })
  })

  describe('ValidationError', () => {
    it('creates ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid configuration')
      expect(error).toBeInstanceOf(ValidationError)
      expect(error).toBeInstanceOf(AdapterError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Invalid configuration')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.name).toBe('ValidationError')
    })

    it('creates ValidationError with config details', () => {
      const context = {
        config: { primaryKey: 'id' },
        missing: ['tableName'],
      }
      const error = new ValidationError(
        'Missing required field: tableName',
        context
      )
      expect(error.context).toEqual(context)
    })
  })

  describe('NotFoundError', () => {
    it('creates NotFoundError with correct properties', () => {
      const error = new NotFoundError('Record not found')
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error).toBeInstanceOf(AdapterError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Record not found')
      expect(error.code).toBe('NOT_FOUND_ERROR')
      expect(error.name).toBe('NotFoundError')
    })

    it('creates NotFoundError with record details', () => {
      const context = { id: 'user123', table: 'users' }
      const error = new NotFoundError('Record not found', context)
      expect(error.context).toEqual(context)
    })
  })

  describe('error instanceof checks', () => {
    it('distinguishes between different error types', () => {
      const connectionError = new ConnectionError('Connection failed')
      const queryError = new QueryError('Query failed')
      const transactionError = new TransactionError('Transaction failed')
      const validationError = new ValidationError('Validation failed')
      const notFoundError = new NotFoundError('Not found')

      expect(connectionError instanceof ConnectionError).toBe(true)
      expect(connectionError instanceof QueryError).toBe(false)
      expect(queryError instanceof QueryError).toBe(true)
      expect(queryError instanceof ConnectionError).toBe(false)
      expect(transactionError instanceof TransactionError).toBe(true)
      expect(validationError instanceof ValidationError).toBe(true)
      expect(notFoundError instanceof NotFoundError).toBe(true)

      expect(connectionError instanceof AdapterError).toBe(true)
      expect(queryError instanceof AdapterError).toBe(true)
      expect(transactionError instanceof AdapterError).toBe(true)
      expect(validationError instanceof AdapterError).toBe(true)
      expect(notFoundError instanceof AdapterError).toBe(true)
    })
  })
})
