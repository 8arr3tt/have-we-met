# Error Handling Guide

This guide documents the error handling patterns in have-we-met and how to handle errors effectively when using the library.

## Error Classes

have-we-met provides specific error classes for different error scenarios, all extending the base `HaveWeMetError` class.

### Base Error Class

```typescript
import { HaveWeMetError } from 'have-we-met'

try {
  // Library code
} catch (error) {
  if (error instanceof HaveWeMetError) {
    console.log(error.code) // Programmatic error code
    console.log(error.context) // Additional context about the error
  }
}
```

### Configuration Errors

**InvalidParameterError**: Thrown when a parameter value is invalid

```typescript
import { InvalidParameterError } from 'have-we-met'

// Example: Invalid weight value
HaveWeMet.create()
  .schema((schema) => schema.field('name').type('string'))
  .matching(
    (match) => match.field('name').strategy('exact').weight(-5) // Throws: InvalidParameterError - weight must be positive
  )
```

**MissingParameterError**: Thrown when a required parameter is missing

```typescript
import { MissingParameterError } from 'have-we-met'

// Example: Missing required field type
HaveWeMet.create().schema((schema) =>
  schema
    .field('name')
    // Missing .type() call
    .build()
) // Throws: MissingParameterError
```

**ConfigurationError**: Thrown when configuration is invalid

```typescript
import { ConfigurationError } from 'have-we-met'

// Example: Invalid threshold configuration
HaveWeMet.create()
  .schema((schema) => schema.field('name').type('string'))
  .matching((match) => match.field('name').strategy('exact').weight(10))
  .thresholds({ noMatch: 50, definiteMatch: 40 }) // Throws: ConfigurationError
```

**NotConfiguredError**: Thrown when attempting to use a feature that hasn't been configured

```typescript
import { NotConfiguredError } from 'have-we-met'

const resolver = HaveWeMet.create()
  .schema((schema) => schema.field('name').type('string'))
  .matching((match) => match.field('name').strategy('exact').weight(10))
  .thresholds({ noMatch: 10, definiteMatch: 50 })
  .build()

// Attempting to use ML without configuring it
resolver.resolveWithML(record, existing) // Throws: NotConfiguredError
```

### Adapter Errors

**AdapterError**: Base class for all adapter-related errors

**ConnectionError**: Database connection failures

**QueryError**: Query execution failures

**TransactionError**: Transaction failures

**ValidationError**: Adapter configuration validation failures

**NotFoundError**: Record not found

```typescript
import { AdapterError, QueryError } from 'have-we-met'

try {
  await resolver.resolveWithDatabase(record)
} catch (error) {
  if (error instanceof QueryError) {
    console.log('Query failed:', error.message)
    console.log('Query context:', error.context)
  } else if (error instanceof AdapterError) {
    console.log('Adapter error:', error.code)
  }
}
```

### Queue Errors

**QueueError**: Base class for queue-related errors

**QueueItemNotFoundError**: Queue item not found

**InvalidStatusTransitionError**: Invalid status transition

**QueueOperationError**: Queue operation failure

**QueueValidationError**: Queue item validation failure

```typescript
import { QueueError, InvalidStatusTransitionError } from 'have-we-met'

try {
  await resolver.queue.confirm('item-id', { decidedBy: 'user' })
} catch (error) {
  if (error instanceof InvalidStatusTransitionError) {
    console.log('Cannot transition from', error.context?.from)
    console.log('to', error.context?.to)
  }
}
```

### Service Errors

**ServiceError**: Base class for service-related errors

**ServiceTimeoutError**: Service call timed out

**ServiceNetworkError**: Network error during service call

**ServiceInputValidationError**: Input validation failed

**ServiceNotFoundError**: Lookup service found no results

**ServiceRejectedError**: Service rejected the request

**ServiceUnavailableError**: Service unavailable (circuit breaker open)

**ServiceServerError**: Server error (5xx response)

**ServiceConfigurationError**: Service configuration invalid

**ServicePluginError**: Service plugin invalid

**ServiceNotRegisteredError**: Service not registered

**ServiceAlreadyRegisteredError**: Service already registered

```typescript
import {
  ServiceError,
  ServiceTimeoutError,
  isRetryableError,
} from 'have-we-met'

try {
  const result = await resolver.resolveWithServices(record, existing)
} catch (error) {
  if (error instanceof ServiceTimeoutError) {
    console.log('Service timed out after', error.timeoutMs, 'ms')
  } else if (error instanceof ServiceError) {
    if (isRetryableError(error)) {
      // Retry logic
    } else {
      // Permanent failure
    }
  }
}
```

### Merge Errors

**MergeError**: Base class for merge-related errors

```typescript
import { MergeError } from 'have-we-met'

try {
  await resolver.merge(sourceRecords)
} catch (error) {
  if (error instanceof MergeError) {
    console.log('Merge failed:', error.message)
  }
}
```

## Input Validation

The library validates all input parameters at the builder API level to catch errors early.

### Weight Validation

```typescript
// ✓ Valid weights
match.field('name').weight(10)
match.field('name').weight(0.5)
match.field('name').weight(100000)

// ✗ Invalid weights
match.field('name').weight(0) // Error: weight must be positive
match.field('name').weight(-5) // Error: weight must be positive
match.field('name').weight(NaN) // Error: weight must be a number
```

### Threshold Validation

```typescript
// ✓ Valid thresholds
match
  .field('name')
  .threshold(0.85) // 0-1 range for similarity strategies
  .thresholds({ noMatch: 20, definiteMatch: 80 })

// ✗ Invalid thresholds
match.field('name').threshold(1.5) // Error: must be between 0 and 1
match
  .field('name')
  .threshold(-0.5) // Error: must be between 0 and 1
  .thresholds({ noMatch: 50, definiteMatch: 40 }) // Error: noMatch must be < definiteMatch
```

### Strategy Validation

```typescript
// ✓ Valid strategies
match.field('name').strategy('exact')
match.field('name').strategy('levenshtein')
match.field('name').strategy('jaro-winkler')
match.field('name').strategy('soundex')
match.field('name').strategy('metaphone')

// ✗ Invalid strategy
match.field('name').strategy('invalid') // Error: must be one of: exact, levenshtein, jaro-winkler, soundex, metaphone, custom
```

### Field Type Validation

```typescript
// ✓ Valid types
schema.field('email').type('email')
schema.field('name').type('name')
schema.field('phone').type('phone')

// ✗ Invalid type
schema.field('email').type('invalid') // Error: must be one of: name, email, phone, date, address, string, number, boolean, custom
```

## Error Codes

All errors include a `code` property for programmatic error handling:

| Error Class                     | Code                             | Description                           |
| ------------------------------- | -------------------------------- | ------------------------------------- |
| `InvalidParameterError`         | `INVALID_PARAMETER`              | Parameter value is invalid            |
| `MissingParameterError`         | `MISSING_PARAMETER`              | Required parameter is missing         |
| `ConfigurationError`            | `CONFIGURATION_ERROR`            | Configuration is invalid              |
| `BuilderSequenceError`          | `BUILDER_SEQUENCE_ERROR`         | Builder methods called in wrong order |
| `NotConfiguredError`            | `NOT_CONFIGURED`                 | Feature not configured                |
| `ConnectionError`               | `CONNECTION_ERROR`               | Database connection failed            |
| `QueryError`                    | `QUERY_ERROR`                    | Query execution failed                |
| `TransactionError`              | `TRANSACTION_ERROR`              | Transaction failed                    |
| `ValidationError`               | `VALIDATION_ERROR`               | Validation failed                     |
| `NotFoundError`                 | `NOT_FOUND_ERROR`                | Record not found                      |
| `QueueItemNotFoundError`        | `QUEUE_ITEM_NOT_FOUND`           | Queue item not found                  |
| `InvalidStatusTransitionError`  | `INVALID_STATUS_TRANSITION`      | Invalid status transition             |
| `QueueOperationError`           | `QUEUE_OPERATION_FAILED`         | Queue operation failed                |
| `QueueValidationError`          | `QUEUE_VALIDATION_ERROR`         | Queue validation failed               |
| `ServiceTimeoutError`           | `SERVICE_TIMEOUT`                | Service timed out                     |
| `ServiceNetworkError`           | `SERVICE_NETWORK_ERROR`          | Network error                         |
| `ServiceInputValidationError`   | `SERVICE_INPUT_VALIDATION_ERROR` | Input validation failed               |
| `ServiceNotFoundError`          | `SERVICE_NOT_FOUND`              | No result found                       |
| `ServiceRejectedError`          | `SERVICE_REJECTED`               | Request rejected                      |
| `ServiceUnavailableError`       | `SERVICE_UNAVAILABLE`            | Service unavailable                   |
| `ServiceServerError`            | `SERVICE_SERVER_ERROR`           | Server error                          |
| `ServiceConfigurationError`     | `SERVICE_CONFIGURATION_ERROR`    | Configuration invalid                 |
| `ServicePluginError`            | `SERVICE_PLUGIN_ERROR`           | Plugin invalid                        |
| `ServiceNotRegisteredError`     | `SERVICE_NOT_REGISTERED`         | Service not registered                |
| `ServiceAlreadyRegisteredError` | `SERVICE_ALREADY_REGISTERED`     | Service already registered            |

## Best Practices

### 1. Use Type Guards

```typescript
import { isHaveWeMetError, isServiceError, isRetryableError } from 'have-we-met'

try {
  // Library code
} catch (error) {
  if (isHaveWeMetError(error)) {
    console.log('Library error:', error.code)
  } else if (isServiceError(error)) {
    if (isRetryableError(error)) {
      // Retry logic
    }
  } else {
    // Unknown error
  }
}
```

### 2. Check Error Codes

```typescript
try {
  // Library code
} catch (error) {
  if (error instanceof HaveWeMetError) {
    switch (error.code) {
      case 'INVALID_PARAMETER':
        // Handle invalid parameter
        break
      case 'NOT_CONFIGURED':
        // Handle missing configuration
        break
      default:
      // Handle other errors
    }
  }
}
```

### 3. Use Error Context

```typescript
try {
  // Library code
} catch (error) {
  if (error instanceof InvalidParameterError) {
    console.log('Parameter:', error.parameterName)
    console.log('Value:', error.value)
    console.log('Reason:', error.reason)
  } else if (error instanceof HaveWeMetError) {
    console.log('Context:', error.context)
  }
}
```

### 4. Validate Early

```typescript
// ✓ Good: Validation happens at builder level
const resolver = HaveWeMet.create()
  .schema((schema) => schema.field('name').type('string'))
  .matching((match) => match.field('name').strategy('exact').weight(10))
  .thresholds({ noMatch: 10, definiteMatch: 50 })
  .build() // Errors thrown here, before any matching

// ✗ Bad: Discovering errors at runtime
const results = resolver.resolve(record, existing) // Errors happen late
```

### 5. Handle Async Errors

```typescript
// ✓ Good: Proper async error handling
try {
  const result = await resolver.resolveWithDatabase(record)
} catch (error) {
  // Handle error
}

// ✗ Bad: Unhandled promise rejection
resolver.resolveWithDatabase(record) // No error handling
```

## Debugging

### Enable Detailed Error Logging

```typescript
try {
  // Library code
} catch (error) {
  if (error instanceof HaveWeMetError) {
    console.error('Error:', error.message)
    console.error('Code:', error.code)
    console.error('Context:', JSON.stringify(error.context, null, 2))
    console.error('Stack:', error.stack)
  }
}
```

### Common Issues

**Issue**: `TypeError: (result ?? builder).build is not a function`

- **Cause**: Schema builder returned without calling `.build()`
- **Fix**: Always call `.build()` on nested builders

**Issue**: `InvalidParameterError: weight must be positive`

- **Cause**: Weight set to 0 or negative value
- **Fix**: Use positive weights (> 0)

**Issue**: `ConfigurationError: noMatch must be less than definiteMatch`

- **Cause**: Threshold order is incorrect
- **Fix**: Ensure `noMatch < definiteMatch`

**Issue**: `NotConfiguredError: ML is not configured`

- **Cause**: Attempting to use ML features without configuration
- **Fix**: Call `.ml()` in builder or `configureML()` on resolver

## Testing

When testing error scenarios:

```typescript
import { InvalidParameterError } from 'have-we-met'
import { expect } from 'vitest'

it('should throw error for invalid weight', () => {
  expect(() => {
    HaveWeMet.create()
      .schema((schema) => schema.field('name').type('string'))
      .matching((match) => match.field('name').strategy('exact').weight(-5))
      .build()
  }).toThrow(InvalidParameterError)
})

it('should include error context', () => {
  try {
    // Code that throws
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidParameterError)
    expect(error.code).toBe('INVALID_PARAMETER')
    expect(error.parameterName).toBe('weight')
  }
})
```
