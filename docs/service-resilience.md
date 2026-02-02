# Service Resilience

External services are inherently unreliable. Networks fail, services go down, and response times vary. The resilience module provides patterns to handle these challenges gracefully: timeouts, retries with exponential backoff, and circuit breakers.

## Overview

Three core resilience patterns are available:

1. **Timeout** - Bound execution time for async operations
2. **Retry** - Automatic retry with exponential backoff
3. **Circuit Breaker** - Prevent cascading failures by failing fast

These can be used individually or combined:

```typescript
import {
  withResilience,
  withTimeout,
  withRetry,
  CircuitBreaker,
} from 'have-we-met/services'

// Combined patterns (recommended)
const result = await withResilience(() => fetchExternalData(), {
  timeout: { timeoutMs: 5000 },
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
  },
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
})

// Individual patterns
const result = await withTimeout(fetchExternalData(), { timeoutMs: 5000 })
```

## Timeout

Timeouts prevent operations from hanging indefinitely.

### Basic Usage

```typescript
import { withTimeout, ServiceTimeoutError } from 'have-we-met/services'

try {
  const result = await withTimeout(fetchData(), {
    timeoutMs: 5000,
    serviceName: 'my-api',
  })
} catch (error) {
  if (error instanceof ServiceTimeoutError) {
    console.log(`${error.serviceName} timed out after ${error.timeoutMs}ms`)
  }
}
```

### Configuration Options

```typescript
interface TimeoutOptions {
  timeoutMs: number // Timeout duration in milliseconds
  serviceName?: string // Service name for error messages
  signal?: AbortSignal // External abort signal
}
```

### Function Wrapper

```typescript
import { withTimeoutFn } from 'have-we-met/services'

// Wrap a function with timeout
const timedFetch = withTimeoutFn((url: string) => fetch(url), {
  timeoutMs: 5000,
})

const response = await timedFetch('https://api.example.com')
```

### Timed Results

Get timing information along with the result:

```typescript
import { withTimeoutTimed } from 'have-we-met/services'

const { result, durationMs, timedOut } = await withTimeoutTimed(fetchData(), {
  timeoutMs: 5000,
})

console.log(`Operation took ${durationMs}ms`)
```

### Timeout Controller

For more control over timeout behavior:

```typescript
import {
  createTimeoutController,
  TimeoutController,
} from 'have-we-met/services'

const controller = createTimeoutController(5000)

// Use the signal with fetch
const response = await fetch(url, { signal: controller.signal })

// Clear timeout when done early
controller.clear()

// Check if timed out
if (controller.isTimedOut) {
  // Handle timeout
}
```

## Retry

Automatic retry handles transient failures with exponential backoff.

### Basic Usage

```typescript
import { withRetry } from 'have-we-met/services'

const result = await withRetry(() => callExternalApi(), {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  retryOn: ['timeout', 'network', 'server'],
})
```

### Configuration Options

```typescript
interface RetryConfig {
  maxAttempts: number // Maximum retry attempts (including initial)
  initialDelayMs: number // Initial delay between retries
  backoffMultiplier: number // Multiplier for exponential backoff
  maxDelayMs: number // Maximum delay between retries
  retryOn?: RetryableErrorType[] // Error types to retry
}

type RetryableErrorType = 'timeout' | 'network' | 'server' | 'all'
```

### Retry Delay Calculation

```
delay = min(initialDelayMs * (backoffMultiplier ^ (attempt - 1)), maxDelayMs)
```

With jitter (±20%) to avoid thundering herd:

```
actualDelay = delay + (delay * 0.2 * random(-1, 1))
```

**Example with defaults:**

- Attempt 1: Fail, wait ~100ms (±20%)
- Attempt 2: Fail, wait ~200ms (±20%)
- Attempt 3: Fail, wait ~400ms (±20%)
- Attempt 4: Give up

### Detailed Results

```typescript
import { withRetryDetailed } from 'have-we-met/services'

const { result, attempts, totalDurationMs, attemptDetails } =
  await withRetryDetailed(() => callExternalApi(), retryConfig)

console.log(`Succeeded on attempt ${attempts}`)
console.log(`Total time: ${totalDurationMs}ms`)

for (const attempt of attemptDetails) {
  console.log(
    `Attempt ${attempt.number}: ${attempt.success ? 'success' : attempt.error}`
  )
}
```

### Reusable Retryable Function

```typescript
import { createRetryable } from 'have-we-met/services'

const resilientApiCall = createRetryable((id: string) => fetchRecord(id), {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
})

// Each call retries automatically
const record1 = await resilientApiCall('123')
const record2 = await resilientApiCall('456')
```

### Retry Eligibility

Check if an error should be retried:

```typescript
import { shouldRetryError, isRetryableError } from 'have-we-met/services'

try {
  await callApi()
} catch (error) {
  // Check against specific config
  if (shouldRetryError(error, retryConfig)) {
    // Would be retried
  }

  // Check if retryable at all
  if (isRetryableError(error)) {
    // Error is inherently retryable
  }
}
```

### Retry Tracker

Track retry state across operations:

```typescript
import { RetryTracker } from 'have-we-met/services'

const tracker = new RetryTracker(retryConfig)

while (tracker.canRetry) {
  try {
    return await callApi()
  } catch (error) {
    tracker.recordFailure(error)
    if (tracker.canRetry) {
      await tracker.waitForNextAttempt()
    }
  }
}

throw tracker.lastError
```

## Circuit Breaker

Circuit breakers prevent cascading failures by failing fast when a service is unhealthy.

### States

The circuit breaker has three states:

```
┌──────────┐                    ┌──────────┐
│  CLOSED  │ ───(failures)───▶ │   OPEN   │
│ (normal) │                    │  (fast   │
│          │ ◀──(success)────  │   fail)  │
└──────────┘                    └──────────┘
     ▲                               │
     │                         (timeout)
     │                               │
     │                               ▼
     │                         ┌──────────┐
     └────(successes)───────── │HALF-OPEN │
                               │ (testing)│
                               └──────────┘
```

- **Closed**: Normal operation, requests pass through
- **Open**: Circuit tripped, requests fail immediately
- **Half-Open**: Testing if service recovered

### Basic Usage

```typescript
import { CircuitBreaker, withCircuitBreaker } from 'have-we-met/services'

// Create a circuit breaker
const breaker = new CircuitBreaker({
  failureThreshold: 5, // Open after 5 failures
  resetTimeoutMs: 30000, // Try to reset after 30 seconds
  successThreshold: 2, // Close after 2 successes in half-open
  failureWindowMs: 60000, // Count failures within 60 seconds
})

// Use with execute
const result = await breaker.execute(() => callExternalApi())

// Or use the wrapper
const result = await withCircuitBreaker(() => callExternalApi(), breakerConfig)
```

### Configuration Options

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number // Failures before opening (default: 5)
  resetTimeoutMs: number // Time before attempting reset (default: 30000)
  successThreshold: number // Successes to close from half-open (default: 2)
  failureWindowMs: number // Time window for failure counting (default: 60000)
}
```

### Monitoring State

```typescript
const breaker = new CircuitBreaker(config)

// Check current state
console.log(breaker.state) // 'closed' | 'open' | 'half-open'

// Get detailed status
const status = breaker.getStatus()
console.log(status)
// {
//   state: 'closed',
//   failureCount: 2,
//   successCount: 0,
//   lastStateChange: Date,
//   lastFailureTime: Date,
// }

// Listen for state changes
breaker.onStateChange((newState, oldState) => {
  console.log(`Circuit breaker: ${oldState} -> ${newState}`)
  if (newState === 'open') {
    alertOps('Circuit breaker opened for my-service')
  }
})
```

### Circuit Breaker Registry

Manage multiple circuit breakers:

```typescript
import {
  CircuitBreakerRegistry,
  createCircuitBreakerRegistry,
} from 'have-we-met/services'

const registry = createCircuitBreakerRegistry()

// Get or create circuit breaker for a service
const apiBreaker = registry.getOrCreate('external-api', {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
})

const dbBreaker = registry.getOrCreate('database', {
  failureThreshold: 3,
  resetTimeoutMs: 10000,
})

// Check all circuit breakers
const statuses = registry.getAllStatuses()
for (const [name, status] of Object.entries(statuses)) {
  if (status.state === 'open') {
    console.log(`${name} circuit is OPEN`)
  }
}

// Reset a specific circuit breaker
registry.reset('external-api')

// Reset all
registry.resetAll()
```

## Combined Resilience

Use all patterns together for comprehensive protection.

### Using withResilience

```typescript
import { withResilience, withResilienceDetailed } from 'have-we-met/services'

// Basic combined usage
const result = await withResilience(() => callExternalApi(), {
  timeout: {
    timeoutMs: 5000,
    serviceName: 'external-api',
  },
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
    retryOn: ['timeout', 'network'],
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
  },
})

// With detailed results
const {
  result,
  totalDurationMs,
  attempts,
  circuitBreakerInvolved,
  circuitState,
} = await withResilienceDetailed(() => callExternalApi(), resilienceConfig)

console.log(`Completed in ${totalDurationMs}ms after ${attempts} attempt(s)`)
if (circuitBreakerInvolved) {
  console.log(`Circuit state: ${circuitState}`)
}
```

### Creating Resilient Functions

```typescript
import { createResilient } from 'have-we-met/services'

const resilientFetch = createResilient(
  (url: string) => fetch(url).then((r) => r.json()),
  {
    timeout: { timeoutMs: 5000 },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 5000,
    },
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
  }
)

// Use normally - resilience is automatic
const data = await resilientFetch('https://api.example.com/data')

// Access the circuit breaker if needed
if (resilientFetch.breaker?.state === 'open') {
  console.log('API circuit is open')
}
```

### Execution Order

When combined, patterns are applied in this order:

1. **Circuit Breaker Check** - If open, fail immediately
2. **Retry Loop** - For each attempt:
   - **Timeout** - Wrap the operation with timeout
   - Execute the operation
   - If failed and retryable, wait and retry
3. **Circuit Breaker Record** - Record success/failure

```
Request → Circuit Breaker Check → Retry Loop [Timeout → Execute] → Circuit Breaker Record → Response
             ↓                         ↓
         (fast fail)              (retry if
          if open)                 retryable)
```

## Service Integration

Resilience patterns are automatically applied by the service executor.

### Per-Service Configuration

```typescript
const servicesConfig = createServiceBuilder<MyRecord>()
  .defaultTimeout(5000)
  .defaultRetry({
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
  })

  // This service uses defaults
  .validate('email')
  .using(emailValidator)

  // This service has custom timeout
  .lookup('address')
  .using(addressStandardization)
  .timeout(10000) // Longer timeout for external API

  // This service has custom retry
  .custom('fraudCheck')
  .using(fraudDetection)
  .retry({
    maxAttempts: 1, // No retries - fail fast
    initialDelayMs: 0,
    backoffMultiplier: 1,
    maxDelayMs: 0,
  })

  .build()
```

### Monitoring Service Health

```typescript
const executor = createServiceExecutor({ ... })

// Check health of all services
const health = await executor.getHealthStatus()
for (const [name, result] of Object.entries(health)) {
  console.log(`${name}: ${result.healthy ? 'OK' : 'UNHEALTHY'}`)
  if (result.responseTimeMs) {
    console.log(`  Response time: ${result.responseTimeMs}ms`)
  }
}

// Check circuit breaker status
const circuitStatus = executor.getCircuitStatus()
for (const [name, status] of Object.entries(circuitStatus)) {
  if (status.state !== 'closed') {
    console.log(`${name} circuit: ${status.state}`)
    console.log(`  Failures: ${status.failureCount}`)
    console.log(`  Last failure: ${status.lastFailureTime}`)
  }
}
```

## Best Practices

### Timeout Guidelines

| Service Type     | Recommended Timeout |
| ---------------- | ------------------- |
| Local validation | 100ms - 500ms       |
| Database query   | 1s - 5s             |
| External API     | 5s - 30s            |
| File upload      | 30s - 120s          |

### Retry Guidelines

| Scenario                 | Recommended Config                      |
| ------------------------ | --------------------------------------- |
| Transient network issues | 3 attempts, 100ms initial, 2x backoff   |
| Rate-limited API         | 3 attempts, 1000ms initial, 2x backoff  |
| Critical operation       | 5 attempts, 500ms initial, 1.5x backoff |
| Fire-and-forget          | 1 attempt (no retry)                    |

### Circuit Breaker Guidelines

| Scenario             | Recommended Config                 |
| -------------------- | ---------------------------------- |
| High-volume API      | 5 failures, 30s reset, 2 successes |
| Critical dependency  | 3 failures, 60s reset, 3 successes |
| Optional enhancement | 10 failures, 120s reset, 1 success |

### General Best Practices

1. **Start conservative**: Begin with shorter timeouts and fewer retries, then adjust based on observed behavior.

2. **Use circuit breakers for external services**: Any service that can fail should have a circuit breaker.

3. **Monitor and alert**: Set up alerts when circuit breakers open or retry rates spike.

4. **Configure differently per service**: Critical services may need more retries; optional services may need shorter timeouts.

5. **Test failure scenarios**: Use mock services to simulate timeouts, failures, and circuit trips.

6. **Consider user experience**: Long retries may frustrate users; fail fast with good error messages instead.

## Error Types

| Error                         | Retryable | Description                |
| ----------------------------- | --------- | -------------------------- |
| `ServiceTimeoutError`         | Yes       | Operation timed out        |
| `ServiceNetworkError`         | Yes       | Network connectivity issue |
| `ServiceServerError`          | Yes       | Server returned 5xx        |
| `ServiceUnavailableError`     | No        | Circuit breaker is open    |
| `ServiceInputValidationError` | No        | Invalid input              |
| `ServiceNotFoundError`        | No        | Resource not found         |
| `ServiceRejectedError`        | No        | Request rejected           |

## See Also

- [External Services Overview](./external-services.md) - Introduction to external services
- [Creating Service Plugins](./service-plugins.md) - Build custom plugins
- [Built-in Services](./built-in-services.md) - Reference for included services
