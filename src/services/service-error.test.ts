/**
 * Tests for service error classes
 */

import { describe, it, expect } from 'vitest'
import {
  ServiceError,
  ServiceTimeoutError,
  ServiceNetworkError,
  ServiceInputValidationError,
  ServiceNotFoundError,
  ServiceRejectedError,
  ServiceUnavailableError,
  ServiceServerError,
  ServiceConfigurationError,
  ServicePluginError,
  ServiceNotRegisteredError,
  ServiceAlreadyRegisteredError,
  isServiceError,
  isRetryableError,
  toServiceError,
} from './service-error.js'

describe('ServiceError', () => {
  it('creates base error with all properties', () => {
    const error = new ServiceError(
      'Test error message',
      'TEST_ERROR',
      'unknown',
      false,
      { extra: 'context' }
    )

    expect(error.message).toBe('Test error message')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.type).toBe('unknown')
    expect(error.retryable).toBe(false)
    expect(error.context).toEqual({ extra: 'context' })
    expect(error.name).toBe('ServiceError')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ServiceError)
  })

  it('has proper stack trace', () => {
    const error = new ServiceError('Test', 'TEST', 'unknown', false)
    expect(error.stack).toBeDefined()
  })
})

describe('ServiceTimeoutError', () => {
  it('creates timeout error with timeout info', () => {
    const error = new ServiceTimeoutError('my-service', 5000)

    expect(error.message).toBe("Service 'my-service' timed out after 5000ms")
    expect(error.code).toBe('SERVICE_TIMEOUT')
    expect(error.type).toBe('timeout')
    expect(error.retryable).toBe(true)
    expect(error.serviceName).toBe('my-service')
    expect(error.timeoutMs).toBe(5000)
    expect(error.name).toBe('ServiceTimeoutError')
  })

  it('includes additional context', () => {
    const error = new ServiceTimeoutError('my-service', 3000, {
      operation: 'lookup',
    })

    expect(error.context).toEqual({
      serviceName: 'my-service',
      timeoutMs: 3000,
      operation: 'lookup',
    })
  })
})

describe('ServiceNetworkError', () => {
  it('creates network error with details', () => {
    const cause = new Error('ECONNREFUSED')
    const error = new ServiceNetworkError(
      'api-service',
      'Connection refused',
      cause
    )

    expect(error.message).toBe(
      "Network error in service 'api-service': Connection refused"
    )
    expect(error.code).toBe('SERVICE_NETWORK_ERROR')
    expect(error.type).toBe('network')
    expect(error.retryable).toBe(true)
    expect(error.serviceName).toBe('api-service')
    expect(error.cause).toBe(cause)
    expect(error.name).toBe('ServiceNetworkError')
  })

  it('works without cause', () => {
    const error = new ServiceNetworkError('api-service', 'DNS lookup failed')

    expect(error.cause).toBeUndefined()
    expect(error.message).toContain('DNS lookup failed')
  })
})

describe('ServiceInputValidationError', () => {
  it('creates validation error with field info', () => {
    const error = new ServiceInputValidationError(
      'validator',
      'must be a valid email',
      'email'
    )

    expect(error.message).toBe(
      "Input validation failed for field 'email' in service 'validator': must be a valid email"
    )
    expect(error.code).toBe('SERVICE_INPUT_VALIDATION_ERROR')
    expect(error.type).toBe('validation')
    expect(error.retryable).toBe(false)
    expect(error.serviceName).toBe('validator')
    expect(error.field).toBe('email')
    expect(error.reason).toBe('must be a valid email')
    expect(error.name).toBe('ServiceInputValidationError')
  })

  it('works without field', () => {
    const error = new ServiceInputValidationError('validator', 'invalid input')

    expect(error.message).toBe(
      "Input validation failed in service 'validator': invalid input"
    )
    expect(error.field).toBeUndefined()
  })
})

describe('ServiceNotFoundError', () => {
  it('creates not found error with lookup details', () => {
    const lookupKey = { id: '123', type: 'user' }
    const error = new ServiceNotFoundError('user-lookup', lookupKey)

    expect(error.message).toContain('No result found for key')
    expect(error.message).toContain('user-lookup')
    expect(error.code).toBe('SERVICE_NOT_FOUND')
    expect(error.type).toBe('not_found')
    expect(error.retryable).toBe(false)
    expect(error.serviceName).toBe('user-lookup')
    expect(error.lookupKey).toEqual(lookupKey)
    expect(error.name).toBe('ServiceNotFoundError')
  })

  it('works without lookup key', () => {
    const error = new ServiceNotFoundError('user-lookup')

    expect(error.message).toBe("No result found in service 'user-lookup'")
    expect(error.lookupKey).toBeUndefined()
  })
})

describe('ServiceRejectedError', () => {
  it('creates rejected error with reason', () => {
    const error = new ServiceRejectedError(
      'fraud-check',
      'High risk score detected'
    )

    expect(error.message).toBe(
      "Request rejected by service 'fraud-check': High risk score detected"
    )
    expect(error.code).toBe('SERVICE_REJECTED')
    expect(error.type).toBe('rejected')
    expect(error.retryable).toBe(false)
    expect(error.serviceName).toBe('fraud-check')
    expect(error.reason).toBe('High risk score detected')
    expect(error.name).toBe('ServiceRejectedError')
  })
})

describe('ServiceUnavailableError', () => {
  it('creates unavailable error with circuit state', () => {
    const resetAt = new Date('2025-01-01T12:00:00Z')
    const error = new ServiceUnavailableError('api-service', 'open', resetAt)

    expect(error.message).toContain(
      "Service 'api-service' is unavailable (circuit open)"
    )
    expect(error.message).toContain('May reset at')
    expect(error.code).toBe('SERVICE_UNAVAILABLE')
    expect(error.type).toBe('unavailable')
    expect(error.retryable).toBe(false)
    expect(error.serviceName).toBe('api-service')
    expect(error.circuitState).toBe('open')
    expect(error.resetAt).toBe(resetAt)
    expect(error.name).toBe('ServiceUnavailableError')
  })

  it('works without reset time', () => {
    const error = new ServiceUnavailableError('api-service', 'half-open')

    expect(error.message).toBe(
      "Service 'api-service' is unavailable (circuit half-open)"
    )
    expect(error.resetAt).toBeUndefined()
  })
})

describe('ServiceServerError', () => {
  it('creates server error with status code', () => {
    const error = new ServiceServerError('api', 'Internal Server Error', 500)

    expect(error.message).toBe(
      "Server error in service 'api' (HTTP 500): Internal Server Error"
    )
    expect(error.code).toBe('SERVICE_SERVER_ERROR')
    expect(error.type).toBe('unknown')
    expect(error.retryable).toBe(true)
    expect(error.serviceName).toBe('api')
    expect(error.statusCode).toBe(500)
    expect(error.name).toBe('ServiceServerError')
  })

  it('works without status code', () => {
    const error = new ServiceServerError('api', 'Unknown server error')

    expect(error.message).toBe(
      "Server error in service 'api': Unknown server error"
    )
    expect(error.statusCode).toBeUndefined()
  })
})

describe('ServiceConfigurationError', () => {
  it('creates configuration error', () => {
    const error = new ServiceConfigurationError(
      'retry.maxAttempts',
      'must be a positive integer'
    )

    expect(error.message).toBe(
      "Invalid service configuration for 'retry.maxAttempts': must be a positive integer"
    )
    expect(error.code).toBe('SERVICE_CONFIGURATION_ERROR')
    expect(error.type).toBe('validation')
    expect(error.retryable).toBe(false)
    expect(error.field).toBe('retry.maxAttempts')
    expect(error.reason).toBe('must be a positive integer')
    expect(error.name).toBe('ServiceConfigurationError')
  })
})

describe('ServicePluginError', () => {
  it('creates plugin error with name', () => {
    const error = new ServicePluginError(
      'execute function is required',
      'my-plugin'
    )

    expect(error.message).toBe(
      "Invalid service plugin 'my-plugin': execute function is required"
    )
    expect(error.code).toBe('SERVICE_PLUGIN_ERROR')
    expect(error.type).toBe('validation')
    expect(error.retryable).toBe(false)
    expect(error.pluginName).toBe('my-plugin')
    expect(error.reason).toBe('execute function is required')
    expect(error.name).toBe('ServicePluginError')
  })

  it('works without plugin name', () => {
    const error = new ServicePluginError('plugin is null')

    expect(error.message).toBe('Invalid service plugin: plugin is null')
    expect(error.pluginName).toBeUndefined()
  })
})

describe('ServiceNotRegisteredError', () => {
  it('creates not registered error', () => {
    const error = new ServiceNotRegisteredError('unknown-service', [
      'service-a',
      'service-b',
    ])

    expect(error.message).toBe(
      "Service 'unknown-service' is not registered. Available services: service-a, service-b"
    )
    expect(error.code).toBe('SERVICE_NOT_REGISTERED')
    expect(error.serviceName).toBe('unknown-service')
    expect(error.availableServices).toEqual(['service-a', 'service-b'])
    expect(error.name).toBe('ServiceNotRegisteredError')
  })

  it('handles empty available services', () => {
    const error = new ServiceNotRegisteredError('unknown-service', [])

    expect(error.message).toBe(
      "Service 'unknown-service' is not registered. Available services: none"
    )
  })
})

describe('ServiceAlreadyRegisteredError', () => {
  it('creates already registered error', () => {
    const error = new ServiceAlreadyRegisteredError('duplicate-service')

    expect(error.message).toBe(
      "Service 'duplicate-service' is already registered"
    )
    expect(error.code).toBe('SERVICE_ALREADY_REGISTERED')
    expect(error.serviceName).toBe('duplicate-service')
    expect(error.name).toBe('ServiceAlreadyRegisteredError')
  })
})

describe('isServiceError', () => {
  it('returns true for ServiceError instances', () => {
    expect(
      isServiceError(new ServiceError('test', 'TEST', 'unknown', false))
    ).toBe(true)
    expect(isServiceError(new ServiceTimeoutError('svc', 1000))).toBe(true)
    expect(isServiceError(new ServiceNetworkError('svc', 'err'))).toBe(true)
    expect(
      isServiceError(new ServiceConfigurationError('field', 'reason'))
    ).toBe(true)
  })

  it('returns false for non-ServiceError values', () => {
    expect(isServiceError(new Error('test'))).toBe(false)
    expect(isServiceError('string error')).toBe(false)
    expect(isServiceError(null)).toBe(false)
    expect(isServiceError(undefined)).toBe(false)
    expect(isServiceError({ message: 'fake error' })).toBe(false)
  })
})

describe('isRetryableError', () => {
  it('returns true for retryable ServiceError instances', () => {
    expect(isRetryableError(new ServiceTimeoutError('svc', 1000))).toBe(true)
    expect(isRetryableError(new ServiceNetworkError('svc', 'err'))).toBe(true)
    expect(isRetryableError(new ServiceServerError('svc', 'err', 500))).toBe(
      true
    )
  })

  it('returns false for non-retryable ServiceError instances', () => {
    expect(
      isRetryableError(new ServiceInputValidationError('svc', 'reason'))
    ).toBe(false)
    expect(isRetryableError(new ServiceNotFoundError('svc'))).toBe(false)
    expect(isRetryableError(new ServiceRejectedError('svc', 'reason'))).toBe(
      false
    )
    expect(isRetryableError(new ServiceUnavailableError('svc', 'open'))).toBe(
      false
    )
    expect(
      isRetryableError(new ServiceConfigurationError('field', 'reason'))
    ).toBe(false)
  })

  it('returns false for non-ServiceError values', () => {
    expect(isRetryableError(new Error('test'))).toBe(false)
    expect(isRetryableError('string error')).toBe(false)
    expect(isRetryableError(null)).toBe(false)
  })
})

describe('toServiceError', () => {
  it('returns ServiceError unchanged', () => {
    const original = new ServiceTimeoutError('svc', 1000)
    const result = toServiceError(original, 'svc')

    expect(result).toBe(original)
  })

  it('converts timeout-like Error to ServiceTimeoutError', () => {
    const original = new Error('Request timed out after 5000ms')
    const result = toServiceError(original, 'my-service')

    expect(result).toBeInstanceOf(ServiceTimeoutError)
    expect((result as ServiceTimeoutError).serviceName).toBe('my-service')
  })

  it('converts network-like Error to ServiceNetworkError', () => {
    const testCases = [
      new Error('ECONNREFUSED'),
      new Error('Network error'),
      new Error('ECONNRESET'),
      new Error('ENOTFOUND'),
    ]

    for (const original of testCases) {
      const result = toServiceError(original, 'my-service')
      expect(result).toBeInstanceOf(ServiceNetworkError)
      expect((result as ServiceNetworkError).serviceName).toBe('my-service')
    }
  })

  it('converts unknown Error to ServiceError', () => {
    const original = new Error('Something went wrong')
    const result = toServiceError(original, 'my-service')

    expect(result).toBeInstanceOf(ServiceError)
    expect(result.message).toContain('Something went wrong')
    expect(result.context?.serviceName).toBe('my-service')
  })

  it('converts non-Error to ServiceError', () => {
    const result = toServiceError('string error', 'my-service')

    expect(result).toBeInstanceOf(ServiceError)
    expect(result.message).toContain('string error')
  })

  it('uses provided default type', () => {
    const original = new Error('Unknown error')
    const result = toServiceError(original, 'my-service', 'timeout')

    expect(result.type).toBe('timeout')
    expect(result.retryable).toBe(true)
  })
})

describe('Error inheritance', () => {
  it('all errors extend ServiceError', () => {
    const errors = [
      new ServiceTimeoutError('svc', 1000),
      new ServiceNetworkError('svc', 'err'),
      new ServiceInputValidationError('svc', 'reason'),
      new ServiceNotFoundError('svc'),
      new ServiceRejectedError('svc', 'reason'),
      new ServiceUnavailableError('svc', 'open'),
      new ServiceServerError('svc', 'err'),
      new ServiceConfigurationError('field', 'reason'),
      new ServicePluginError('reason'),
      new ServiceNotRegisteredError('svc', []),
      new ServiceAlreadyRegisteredError('svc'),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(ServiceError)
      expect(error).toBeInstanceOf(Error)
    }
  })
})
