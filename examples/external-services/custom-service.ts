/**
 * Custom Service Example
 *
 * This example demonstrates how to implement and use custom services
 * for specialized processing like fraud detection, scoring, or other
 * business-specific logic that runs as part of the resolution workflow.
 *
 * Topics covered:
 * 1. Implementing a custom fraud detection service
 * 2. Score adjustment based on service results
 * 3. Using result predicates for conditional processing
 * 4. Post-match services that can modify outcomes
 * 5. Custom parameters and flags
 */

import {
  createServiceBuilder,
  createServiceExecutor,
  buildServiceContext,
} from '../../src/services'
import type {
  CustomService,
  CustomInput,
  CustomOutput,
  ServiceResult,
  ServiceContext,
  HealthCheckResult,
} from '../../src/services'
import type { ResolverConfig } from '../../src/types/config'

interface PersonRecord {
  personId?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  ipAddress?: string
  deviceId?: string
  transactionAmount?: number
}

/**
 * Fraud Detection Service
 *
 * A custom service that analyzes records for potential fraud indicators.
 * Returns a risk score and flags suspicious patterns.
 */
function createFraudDetectionService(): CustomService {
  const suspiciousDomains = ['tempmail.com', 'fakeemail.net', 'throwaway.org']
  const suspiciousIpRanges = ['192.0.2.', '198.51.100.', '203.0.113.'] // TEST-NET ranges for demo

  function calculateRiskScore(record: Record<string, unknown>): {
    score: number
    factors: string[]
  } {
    let score = 0
    const factors: string[] = []

    // Check email domain
    const email = String(record.email ?? '')
    const domain = email.split('@')[1]?.toLowerCase()
    if (domain && suspiciousDomains.includes(domain)) {
      score += 0.3
      factors.push('suspicious_email_domain')
    }

    // Check for disposable email patterns
    if (email.includes('+') || /\d{4,}/.test(email)) {
      score += 0.1
      factors.push('disposable_email_pattern')
    }

    // Check IP address
    const ipAddress = String(record.ipAddress ?? '')
    if (suspiciousIpRanges.some((range) => ipAddress.startsWith(range))) {
      score += 0.2
      factors.push('suspicious_ip_range')
    }

    // Check for high transaction amount
    const amount = Number(record.transactionAmount ?? 0)
    if (amount > 10000) {
      score += 0.15
      factors.push('high_transaction_amount')
    }

    // Check for missing phone number (slight risk indicator)
    if (!record.phone) {
      score += 0.05
      factors.push('missing_phone')
    }

    // Check for velocity (simulated - in real scenarios, would check database)
    const hasDeviceId = Boolean(record.deviceId)
    if (!hasDeviceId) {
      score += 0.1
      factors.push('no_device_fingerprint')
    }

    return { score: Math.min(score, 1), factors }
  }

  return {
    name: 'fraud-detection',
    type: 'custom',
    description: 'Analyzes records for potential fraud indicators',

    async execute(
      input: CustomInput,
      _context: ServiceContext
    ): Promise<ServiceResult<CustomOutput>> {
      const startedAt = new Date()
      const { record, params } = input

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 10))

      const threshold = (params?.riskThreshold as number) ?? 0.7
      const { score, factors } = calculateRiskScore(record)

      const proceed = score < threshold
      const flags = factors.length > 0 ? factors : undefined

      // Calculate score adjustment based on risk
      // Low risk slightly boosts confidence, high risk penalizes
      let scoreAdjustment = 0
      if (score < 0.2) {
        scoreAdjustment = 0.05 // Boost for low-risk
      } else if (score > 0.5) {
        scoreAdjustment = -0.1 // Penalty for high-risk
      }

      const completedAt = new Date()
      return {
        success: true,
        data: {
          result: {
            riskScore: score,
            riskLevel: score < 0.3 ? 'low' : score < 0.6 ? 'medium' : 'high',
            factors,
            threshold,
          },
          proceed,
          scoreAdjustment,
          flags,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cached: false,
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      return {
        healthy: true,
        checkedAt: new Date(),
        details: {
          suspiciousDomainCount: suspiciousDomains.length,
          suspiciousIpRangeCount: suspiciousIpRanges.length,
        },
      }
    },
  }
}

/**
 * Duplicate Detector Service
 *
 * A custom post-match service that checks for potential duplicates
 * based on additional criteria not captured in standard matching.
 */
function createDuplicateDetectorService(): CustomService {
  // Simulated known duplicates database
  const knownDuplicates = new Map<string, string[]>([
    ['john.smith@example.com', ['john.s@example.com', 'j.smith@example.com']],
    ['jane.doe@company.com', ['jdoe@company.com']],
  ])

  return {
    name: 'duplicate-detector',
    type: 'custom',
    description: 'Detects potential duplicates based on email aliases',

    async execute(
      input: CustomInput,
      _context: ServiceContext
    ): Promise<ServiceResult<CustomOutput>> {
      const startedAt = new Date()
      const { record } = input

      await new Promise((resolve) => setTimeout(resolve, 5))

      const email = String(record.email ?? '').toLowerCase()
      const potentialDuplicates: string[] = []

      // Check if this email is a known alias
      for (const [primary, aliases] of knownDuplicates) {
        if (email === primary || aliases.includes(email)) {
          potentialDuplicates.push(primary)
          potentialDuplicates.push(...aliases.filter((a) => a !== email))
        }
      }

      const flags =
        potentialDuplicates.length > 0 ? ['potential_duplicate'] : undefined

      const completedAt = new Date()
      return {
        success: true,
        data: {
          result: {
            hasPotentialDuplicates: potentialDuplicates.length > 0,
            potentialDuplicateEmails: potentialDuplicates,
            confidence: potentialDuplicates.length > 0 ? 0.9 : 0,
          },
          proceed: true, // Always proceed, just flag for review
          flags,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cached: false,
      }
    },
  }
}

async function customServiceExample() {
  console.log('=== Custom Service Example ===\n')

  // Minimal resolver config for the example
  const resolverConfig: ResolverConfig = {
    schema: {
      personId: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      ipAddress: { type: 'string' },
      deviceId: { type: 'string' },
      transactionAmount: { type: 'number' },
    },
    matchingRules: [],
    thresholds: { noMatch: 0.3, definiteMatch: 0.9 },
  }

  // Step 1: Create custom services
  console.log('Step 1: Creating custom services...')
  const fraudService = createFraudDetectionService()
  const duplicateService = createDuplicateDetectorService()

  console.log(`  ${fraudService.name}: ${fraudService.description}`)
  console.log(`  ${duplicateService.name}: ${duplicateService.description}`)
  console.log()

  // Step 2: Configure services using the builder
  console.log('Step 2: Configuring custom services...')
  const servicesConfig = createServiceBuilder<PersonRecord>()
    .defaultTimeout(5000)
    .custom('fraudCheck')
    .using(fraudService)
    .params({ riskThreshold: 0.7 })
    .executeAt('pre-match')
    .onResult((result: CustomOutput) => {
      const riskScore = (result.result as { riskScore: number }).riskScore
      return riskScore < 0.7 // Only proceed if risk score is below threshold
    })
    .required(true)
    .custom('duplicateCheck')
    .using(duplicateService)
    .executeAt('post-match')
    .onFailure('continue')
    .build()

  console.log('Service configuration:')
  console.log(`  Services configured: ${servicesConfig.services.length}`)
  for (const svc of servicesConfig.services) {
    console.log(`    - ${svc.plugin.name} (execution: ${svc.executionPoint})`)
  }
  console.log()

  // Step 3: Create the service executor
  console.log('Step 3: Creating service executor...')
  const executor = createServiceExecutor({
    resolverConfig,
    defaults: servicesConfig.defaults,
    cachingEnabled: servicesConfig.cachingEnabled,
  })

  for (const serviceConfig of servicesConfig.services) {
    executor.register(serviceConfig)
  }
  console.log(`Registered ${executor.getServiceNames().length} services\n`)

  // Step 4: Test with low-risk record
  console.log('Step 4: Processing low-risk record...')
  const lowRiskRecord: PersonRecord = {
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice.johnson@company.com',
    phone: '+1-555-0123',
    ipAddress: '10.0.0.1',
    deviceId: 'device-abc-123',
    transactionAmount: 500,
  }

  console.log('Input record:')
  console.log(JSON.stringify(lowRiskRecord, null, 2))
  console.log()

  const lowRiskResult = await executor.executePreMatch(lowRiskRecord)
  console.log('Pre-match result:')
  console.log(`  Proceed: ${lowRiskResult.proceed}`)
  console.log(`  Flags: ${lowRiskResult.flags?.join(', ') ?? 'none'}`)
  console.log(
    `  Score adjustments: ${lowRiskResult.scoreAdjustments?.join(', ') ?? 'none'}`
  )

  const fraudResult = lowRiskResult.results['fraud-detection']
  if (fraudResult?.data) {
    const data = fraudResult.data as CustomOutput
    const result = data.result as {
      riskScore: number
      riskLevel: string
      factors: string[]
    }
    console.log(`  Fraud risk score: ${result.riskScore}`)
    console.log(`  Risk level: ${result.riskLevel}`)
    console.log(
      `  Risk factors: ${result.factors.length > 0 ? result.factors.join(', ') : 'none'}`
    )
  }
  console.log()

  // Step 5: Test with high-risk record
  console.log('Step 5: Processing high-risk record...')
  const highRiskRecord: PersonRecord = {
    firstName: 'Suspicious',
    lastName: 'User',
    email: 'user12345+spam@tempmail.com',
    phone: undefined, // Missing phone
    ipAddress: '192.0.2.100', // Suspicious IP range
    deviceId: undefined, // No device fingerprint
    transactionAmount: 15000, // High amount
  }

  console.log('Input record:')
  console.log(JSON.stringify(highRiskRecord, null, 2))
  console.log()

  const highRiskResult = await executor.executePreMatch(highRiskRecord)
  console.log('Pre-match result:')
  console.log(`  Proceed: ${highRiskResult.proceed}`)
  console.log(`  Rejection reason: ${highRiskResult.rejectionReason ?? 'N/A'}`)
  console.log(`  Flags: ${highRiskResult.flags?.join(', ') ?? 'none'}`)

  const highFraudResult = highRiskResult.results['fraud-detection']
  if (highFraudResult?.data) {
    const data = highFraudResult.data as CustomOutput
    const result = data.result as {
      riskScore: number
      riskLevel: string
      factors: string[]
    }
    console.log(`  Fraud risk score: ${result.riskScore}`)
    console.log(`  Risk level: ${result.riskLevel}`)
    console.log(`  Risk factors: ${result.factors.join(', ')}`)
  }
  console.log()

  // Step 6: Test post-match duplicate detection
  console.log('Step 6: Testing post-match duplicate detection...')
  const potentialDuplicateRecord: PersonRecord = {
    firstName: 'John',
    lastName: 'Smith',
    email: 'j.smith@example.com', // Known alias of john.smith@example.com
    phone: '+1-555-0199',
  }

  console.log('Input record:')
  console.log(JSON.stringify(potentialDuplicateRecord, null, 2))
  console.log()

  // For post-match, we'd typically have match results, but for demo we use a mock
  const mockMatchResult = {
    matchId: 'match-001',
    candidateId: 'candidate-001',
    score: 0.85,
    outcome: 'potential_match' as const,
    fieldScores: {},
    explanation: {
      summary: 'High confidence match based on name and email',
      fieldContributions: [],
    },
    processingTimeMs: 50,
    calculatedAt: new Date(),
    debug: {},
  }

  const postMatchResult = await executor.executePostMatch(
    potentialDuplicateRecord,
    mockMatchResult
  )

  console.log('Post-match result:')
  console.log(`  Proceed: ${postMatchResult.proceed}`)
  console.log(`  Flags: ${postMatchResult.flags?.join(', ') ?? 'none'}`)

  const dupResult = postMatchResult.results['duplicate-detector']
  if (dupResult?.data) {
    const data = dupResult.data as CustomOutput
    const result = data.result as {
      hasPotentialDuplicates: boolean
      potentialDuplicateEmails: string[]
    }
    console.log(`  Has potential duplicates: ${result.hasPotentialDuplicates}`)
    if (result.potentialDuplicateEmails.length > 0) {
      console.log(
        `  Potential duplicate emails: ${result.potentialDuplicateEmails.join(', ')}`
      )
    }
  }
  console.log()

  // Step 7: Direct service execution
  console.log('Step 7: Direct service execution...')
  const context = buildServiceContext({
    record: { email: 'test@example.com', transactionAmount: 5000 },
    config: resolverConfig,
  })

  const directResult = await fraudService.execute(
    { record: { email: 'test@example.com', transactionAmount: 5000 } },
    context
  )

  console.log('Direct fraud check result:')
  if (directResult.data) {
    const result = directResult.data.result as {
      riskScore: number
      riskLevel: string
    }
    console.log(`  Risk score: ${result.riskScore}`)
    console.log(`  Risk level: ${result.riskLevel}`)
    console.log(`  Proceed: ${directResult.data.proceed}`)
    console.log(`  Score adjustment: ${directResult.data.scoreAdjustment}`)
  }
  console.log()

  // Step 8: Health check
  console.log('Step 8: Service health check...')
  const healthStatus = await executor.getHealthStatus()
  for (const [serviceName, status] of Object.entries(healthStatus)) {
    console.log(`  ${serviceName}: ${status.healthy ? 'HEALTHY' : 'UNHEALTHY'}`)
    if (status.details) {
      console.log(`    Details: ${JSON.stringify(status.details)}`)
    }
  }
  console.log()

  // Cleanup
  await executor.dispose()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- Custom services implement the CustomService interface')
  console.log(
    '- executeAt controls when the service runs (pre-match or post-match)'
  )
  console.log(
    '- onResult predicates can prevent processing based on service output'
  )
  console.log(
    '- Score adjustments from custom services can boost or penalize match scores'
  )
  console.log('- Flags help identify records needing special attention')
  console.log(
    '- Custom parameters allow runtime configuration of service behavior'
  )
}

// Run the example
customServiceExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
