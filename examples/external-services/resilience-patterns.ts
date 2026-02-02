/**
 * Resilience Patterns Example
 *
 * This example demonstrates how to use resilience patterns (timeout, retry,
 * circuit breaker) to handle unreliable external services gracefully.
 *
 * Topics covered:
 * 1. Timeout configuration to bound execution time
 * 2. Retry with exponential backoff for transient failures
 * 3. Circuit breaker to prevent cascading failures
 * 4. Stale-on-error caching for degraded operation
 * 5. Combined resilience patterns
 */

import {
  createServiceBuilder,
  createServiceExecutor,
  createMockLookup,
  createFlakyMock,
  createSlowMock,
  createFailureMock,
  withTimeout,
  withRetry,
  withResilience,
  CircuitBreaker,
  createCircuitBreaker,
  createResilient,
  buildServiceContext,
} from '../../src/services'
import type { ResolverConfig } from '../../src/types/config'

interface CustomerRecord {
  customerId?: string
  firstName: string
  lastName: string
  email: string
}

async function resiliencePatternsExample() {
  console.log('=== Resilience Patterns Example ===\n')

  const resolverConfig: ResolverConfig = {
    schema: {
      customerId: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string' },
    },
    matchingRules: [],
    thresholds: { noMatch: 0.3, definiteMatch: 0.9 },
  }

  // ============================================
  // PART 1: Timeout Patterns
  // ============================================
  console.log('=== PART 1: Timeout Patterns ===\n')

  // Create a slow mock service
  const slowService = createSlowMock(500, {
    found: true,
    data: { enriched: true },
  })

  console.log('Step 1.1: Testing timeout with slow service...')
  const context = buildServiceContext({
    record: { email: 'test@example.com' },
    config: resolverConfig,
  })

  // Fast operation - should complete
  console.log('  Testing with 1000ms timeout (service takes 500ms)...')
  try {
    const fastResult = await withTimeout(
      slowService.execute(
        { keyFields: { email: 'test@example.com' } },
        context
      ),
      { timeoutMs: 1000, serviceName: 'slow-service' }
    )
    console.log(`    Success: ${fastResult.success}`)
    console.log(`    Duration: ~${fastResult.timing.durationMs}ms`)
  } catch (error) {
    console.log(`    Error: ${error}`)
  }

  // Timeout - should fail
  console.log('  Testing with 100ms timeout (service takes 500ms)...')
  try {
    await withTimeout(
      slowService.execute(
        { keyFields: { email: 'test@example.com' } },
        context
      ),
      { timeoutMs: 100, serviceName: 'slow-service' }
    )
    console.log('    Unexpected success!')
  } catch (error: unknown) {
    const err = error as Error
    console.log(`    Timeout error: ${err.message}`)
  }
  console.log()

  // ============================================
  // PART 2: Retry Patterns
  // ============================================
  console.log('=== PART 2: Retry Patterns ===\n')

  // Create a flaky service (50% failure rate)
  const flakyService = createFlakyMock(0.5, {
    found: true,
    data: { source: 'flaky' },
  })

  console.log('Step 2.1: Testing retry with flaky service...')
  console.log('  Service has 50% failure rate')
  console.log('  Using 3 retry attempts with exponential backoff')

  let successCount = 0
  let failureCount = 0

  for (let i = 0; i < 10; i++) {
    flakyService.reset()
    try {
      const result = await withRetry(
        () => flakyService.execute({ keyFields: { test: i } }, context),
        {
          maxAttempts: 3,
          initialDelayMs: 10,
          backoffMultiplier: 2,
          maxDelayMs: 100,
          retryOn: ['all'],
        }
      )
      if (result.success) {
        successCount++
      } else {
        failureCount++
      }
    } catch {
      failureCount++
    }
  }

  console.log(`  Results after 10 test runs:`)
  console.log(`    Successes: ${successCount}`)
  console.log(`    Failures: ${failureCount}`)
  console.log(`  Note: With retry, success rate should be much higher than 50%`)
  console.log()

  // ============================================
  // PART 3: Circuit Breaker Patterns
  // ============================================
  console.log('=== PART 3: Circuit Breaker Patterns ===\n')

  // Create a service that always fails
  const failingService = createFailureMock('network')

  console.log('Step 3.1: Testing circuit breaker...')
  const circuitBreaker = createCircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    successThreshold: 2,
    failureWindowMs: 5000,
  })

  console.log(`  Initial state: ${circuitBreaker.state}`)

  // Trigger failures to open the circuit
  for (let i = 0; i < 5; i++) {
    try {
      await circuitBreaker.execute(() =>
        failingService.execute({ keyFields: { test: i } }, context)
      )
    } catch {
      console.log(
        `  Attempt ${i + 1}: failed, circuit state: ${circuitBreaker.state}`
      )
    }
  }

  console.log(`  After failures: ${circuitBreaker.state}`)

  // Try while circuit is open - should fail fast
  console.log('\n  Trying while circuit is open...')
  const openStartTime = Date.now()
  try {
    await circuitBreaker.execute(() =>
      failingService.execute({ keyFields: { test: 'open' } }, context)
    )
  } catch (error: unknown) {
    const err = error as Error
    const duration = Date.now() - openStartTime
    console.log(`  Failed fast in ${duration}ms: ${err.message}`)
  }

  // Wait for reset timeout and test half-open state
  console.log('\n  Waiting for circuit reset timeout (1s)...')
  await new Promise((resolve) => setTimeout(resolve, 1100))

  console.log(`  State after reset timeout: ${circuitBreaker.state}`)

  // Create a working service for recovery
  const workingService = createMockLookup({
    defaultResponse: { found: true, data: { recovered: true } },
  })

  // Test recovery in half-open state
  console.log('  Testing recovery with working service...')
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(() =>
        workingService.execute({ keyFields: { test: i } }, context)
      )
      console.log(`  Success ${i + 1}, state: ${circuitBreaker.state}`)
    } catch {
      console.log(`  Failure ${i + 1}, state: ${circuitBreaker.state}`)
    }
  }
  console.log()

  // ============================================
  // PART 4: Combined Resilience
  // ============================================
  console.log('=== PART 4: Combined Resilience ===\n')

  console.log('Step 4.1: Using withResilience for combined patterns...')

  // Create a new circuit breaker for this test
  const combinedBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 5000,
    successThreshold: 2,
    failureWindowMs: 10000,
  })

  // Test with unreliable service
  const unreliableService = createFlakyMock(0.3, {
    found: true,
    data: { source: 'unreliable' },
  })

  let combinedSuccesses = 0
  let combinedFailures = 0

  for (let i = 0; i < 10; i++) {
    try {
      const result = await withResilience(
        () => unreliableService.execute({ keyFields: { test: i } }, context),
        {
          timeout: { timeoutMs: 1000 },
          retry: {
            maxAttempts: 2,
            initialDelayMs: 10,
            backoffMultiplier: 2,
            maxDelayMs: 100,
          },
          circuitBreaker: combinedBreaker,
        }
      )
      if (result.success) {
        combinedSuccesses++
      } else {
        combinedFailures++
      }
    } catch {
      combinedFailures++
    }
  }

  console.log(`  Results with combined resilience:`)
  console.log(`    Successes: ${combinedSuccesses}`)
  console.log(`    Failures: ${combinedFailures}`)
  console.log(`    Circuit state: ${combinedBreaker.state}`)
  console.log()

  // ============================================
  // PART 5: Service Executor Integration
  // ============================================
  console.log('=== PART 5: Service Executor Integration ===\n')

  console.log('Step 5.1: Configuring services with resilience...')

  // Create a mock service that we can configure
  const configurableService = createMockLookup({
    name: 'enrichment-service',
    description: 'Enrichment service with configurable behavior',
    defaultResponse: { found: true, data: { name: 'Test User' } },
    latencyMs: 50,
  })

  const servicesConfig = createServiceBuilder<CustomerRecord>()
    .defaultTimeout(500)
    .defaultRetry({
      maxAttempts: 3,
      initialDelayMs: 50,
      backoffMultiplier: 2,
      maxDelayMs: 500,
    })
    .caching(true)
    .lookup('email')
    .using(configurableService)
    .timeout(200)
    .retry({
      maxAttempts: 2,
      initialDelayMs: 20,
      backoffMultiplier: 2,
      maxDelayMs: 100,
    })
    .cache({ enabled: true, ttlSeconds: 60, staleOnError: true })
    .onNotFound('flag')
    .onFailure('continue')
    .build()

  const executor = createServiceExecutor({
    resolverConfig,
    defaults: servicesConfig.defaults,
    cachingEnabled: servicesConfig.cachingEnabled,
  })

  for (const serviceConfig of servicesConfig.services) {
    executor.register(serviceConfig)
  }

  console.log('Service configuration:')
  for (const svc of servicesConfig.services) {
    console.log(`  ${svc.plugin.name}:`)
    console.log(`    Timeout: ${svc.timeout}ms`)
    console.log(`    Retry attempts: ${svc.retry?.maxAttempts}`)
    console.log(`    Cache enabled: ${svc.cache?.enabled}`)
    console.log(`    Stale on error: ${svc.cache?.staleOnError}`)
  }
  console.log()

  // Execute with the configured service
  console.log('Step 5.2: Executing with configured resilience...')
  const record: CustomerRecord = {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
  }

  const result = await executor.executePreMatch(record)
  console.log(`  Proceed: ${result.proceed}`)
  console.log(`  Duration: ${result.totalDurationMs}ms`)
  console.log()

  // Check circuit status
  console.log('Step 5.3: Checking circuit breaker status...')
  const circuitStatus = executor.getCircuitStatus()
  for (const [serviceName, status] of Object.entries(circuitStatus)) {
    console.log(`  ${serviceName}:`)
    console.log(`    State: ${status.state}`)
    console.log(`    Failure count: ${status.failureCount}`)
    console.log(
      `    Last state change: ${status.lastStateChange.toISOString()}`
    )
  }
  console.log()

  // ============================================
  // PART 6: Resilient Function Wrapper
  // ============================================
  console.log('=== PART 6: Resilient Function Wrapper ===\n')

  console.log('Step 6.1: Creating a resilient function wrapper...')

  // Example: wrapping an external API call
  async function fetchUserData(
    email: string
  ): Promise<{ name: string; active: boolean }> {
    // Simulate 20% failure rate
    if (Math.random() < 0.2) {
      throw new Error('API temporarily unavailable')
    }
    // Simulate some latency
    await new Promise((resolve) =>
      setTimeout(resolve, 50 + Math.random() * 100)
    )
    return { name: email.split('@')[0], active: true }
  }

  const resilientFetchUser = createResilient(fetchUserData, {
    timeout: { timeoutMs: 500 },
    retry: {
      maxAttempts: 3,
      initialDelayMs: 20,
      backoffMultiplier: 2,
      maxDelayMs: 200,
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 5000,
      successThreshold: 2,
      failureWindowMs: 10000,
    },
  })

  console.log('  Testing resilient function wrapper...')
  let wrapperSuccesses = 0
  let wrapperFailures = 0

  for (let i = 0; i < 10; i++) {
    try {
      const user = await resilientFetchUser(`user${i}@example.com`)
      console.log(`    User ${i}: ${user.name} (active: ${user.active})`)
      wrapperSuccesses++
    } catch (error: unknown) {
      const err = error as Error
      console.log(`    User ${i}: Failed - ${err.message}`)
      wrapperFailures++
    }
  }

  console.log(`\n  Wrapper results:`)
  console.log(`    Successes: ${wrapperSuccesses}`)
  console.log(`    Failures: ${wrapperFailures}`)
  console.log(`    Circuit state: ${resilientFetchUser.breaker?.state}`)
  console.log()

  // Cleanup
  await executor.dispose()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log(
    '- Timeout bounds execution time to prevent slow services from blocking'
  )
  console.log('- Retry with backoff handles transient failures automatically')
  console.log(
    '- Circuit breaker prevents cascading failures and allows recovery'
  )
  console.log('- Combined patterns provide comprehensive resilience')
  console.log('- Service executor integrates resilience patterns automatically')
  console.log(
    '- createResilient() wraps any async function with resilience patterns'
  )
}

// Run the example
resiliencePatternsExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
