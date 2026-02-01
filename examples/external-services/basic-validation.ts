/**
 * Basic Validation Example
 *
 * This example demonstrates how to configure and use validation services
 * to verify identifiers before matching records. Validation services help
 * ensure data quality by checking format, checksums, and other validity rules.
 *
 * Topics covered:
 * 1. Setting up the NHS number validator
 * 2. Configuring validation behavior (reject vs flag)
 * 3. Interpreting validation results
 * 4. Using the service builder API
 */

import {
  createServiceBuilder,
  createServiceExecutor,
  nhsNumberValidator,
  emailValidator,
  createNHSNumberValidator,
  createEmailValidator,
  buildServiceContext,
} from '../../src/services'
import type { ResolverConfig } from '../../src/types/config'

interface PatientRecord {
  patientId?: string
  firstName: string
  lastName: string
  nhsNumber: string
  email?: string
  dateOfBirth: string
}

async function basicValidationExample() {
  console.log('=== Basic Validation Example ===\n')

  // Minimal resolver config for the example
  const resolverConfig: ResolverConfig = {
    schema: {
      patientId: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      nhsNumber: { type: 'string' },
      email: { type: 'string' },
      dateOfBirth: { type: 'string' },
    },
    matchingRules: [],
    thresholds: { noMatch: 0.3, definiteMatch: 0.9 },
  }

  // Step 1: Create service configuration using the builder
  console.log('Step 1: Configuring validation services...')
  const servicesConfig = createServiceBuilder<PatientRecord>()
    .defaultTimeout(5000)
    .caching(true)
    .validate('nhsNumber')
      .using(nhsNumberValidator)
      .onInvalid('reject')
      .required(true)
    .validate('email')
      .using(emailValidator)
      .onInvalid('flag')
      .required(false)
    .build()

  console.log('Service configuration:')
  console.log(`  Caching enabled: ${servicesConfig.cachingEnabled}`)
  console.log(`  Services configured: ${servicesConfig.services.length}`)
  for (const svc of servicesConfig.services) {
    console.log(`    - ${svc.plugin.name} (${svc.plugin.type})`)
  }
  console.log()

  // Step 2: Create the service executor
  console.log('Step 2: Creating service executor...')
  const executor = createServiceExecutor({
    resolverConfig,
    defaults: servicesConfig.defaults,
    cachingEnabled: servicesConfig.cachingEnabled,
  })

  // Register the services
  for (const serviceConfig of servicesConfig.services) {
    executor.register(serviceConfig)
  }
  console.log(`Registered ${executor.getServiceNames().length} services\n`)

  // Step 3: Validate a record with valid NHS number
  console.log('Step 3: Validating record with VALID NHS number...')
  const validRecord: PatientRecord = {
    firstName: 'John',
    lastName: 'Smith',
    nhsNumber: '943 476 5919', // Valid NHS number with correct checksum
    email: 'john.smith@example.com',
    dateOfBirth: '1985-03-15',
  }

  console.log('Input record:')
  console.log(JSON.stringify(validRecord, null, 2))
  console.log()

  const validResult = await executor.executePreMatch(validRecord)
  console.log('Validation result:')
  console.log(`  Proceed: ${validResult.proceed}`)
  console.log(`  Total duration: ${validResult.totalDurationMs}ms`)
  console.log()

  // Examine individual service results
  for (const [serviceName, result] of Object.entries(validResult.results)) {
    console.log(`  ${serviceName}:`)
    console.log(`    Success: ${result.success}`)
    console.log(`    Duration: ${result.timing.durationMs}ms`)
    if (result.data) {
      const data = result.data as { valid?: boolean; details?: { normalizedValue?: string } }
      console.log(`    Valid: ${data.valid}`)
      if (data.details?.normalizedValue) {
        console.log(`    Normalized value: ${data.details.normalizedValue}`)
      }
    }
  }
  console.log()

  // Step 4: Validate a record with INVALID NHS number
  console.log('Step 4: Validating record with INVALID NHS number...')
  const invalidRecord: PatientRecord = {
    firstName: 'Jane',
    lastName: 'Doe',
    nhsNumber: '1234567890', // Invalid - wrong checksum
    email: 'jane.doe@example.com',
    dateOfBirth: '1990-07-22',
  }

  console.log('Input record:')
  console.log(JSON.stringify(invalidRecord, null, 2))
  console.log()

  const invalidResult = await executor.executePreMatch(invalidRecord)
  console.log('Validation result:')
  console.log(`  Proceed: ${invalidResult.proceed}`)
  console.log(`  Rejection reason: ${invalidResult.rejectionReason ?? 'N/A'}`)
  console.log(`  Rejected by: ${invalidResult.rejectedBy ?? 'N/A'}`)
  console.log()

  // Examine the NHS number validation result
  const nhsResult = invalidResult.results['nhs-number-validator']
  if (nhsResult && nhsResult.data) {
    const data = nhsResult.data as {
      valid?: boolean
      invalidReason?: string
      suggestions?: string[]
      details?: { checks?: Array<{ name: string; passed: boolean; message?: string }> }
    }
    console.log('  NHS Number validation details:')
    console.log(`    Valid: ${data.valid}`)
    console.log(`    Reason: ${data.invalidReason}`)
    if (data.suggestions) {
      console.log(`    Suggestions: ${data.suggestions.join(', ')}`)
    }
    if (data.details?.checks) {
      console.log('    Checks:')
      for (const check of data.details.checks) {
        console.log(`      - ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'} (${check.message})`)
      }
    }
  }
  console.log()

  // Step 5: Validate with invalid email (flagged, not rejected)
  console.log('Step 5: Validating record with invalid email (flagged)...')
  const invalidEmailRecord: PatientRecord = {
    firstName: 'Bob',
    lastName: 'Wilson',
    nhsNumber: '943 476 5919', // Valid NHS number
    email: 'not-an-email', // Invalid email
    dateOfBirth: '1978-11-30',
  }

  console.log('Input record:')
  console.log(JSON.stringify(invalidEmailRecord, null, 2))
  console.log()

  const flaggedResult = await executor.executePreMatch(invalidEmailRecord)
  console.log('Validation result:')
  console.log(`  Proceed: ${flaggedResult.proceed}`) // Should still proceed
  console.log(`  Flags: ${flaggedResult.flags?.join(', ') ?? 'none'}`)
  console.log()

  // Step 6: Demonstrate custom validator configuration
  console.log('Step 6: Creating custom-configured validators...')
  const customNhsValidator = createNHSNumberValidator({
    name: 'custom-nhs-validator',
    description: 'Custom NHS validator for patient records',
  })

  const strictEmailValidator = createEmailValidator({
    name: 'strict-email-validator',
    checkDisposable: true,
    requireTld: true,
  })

  console.log(`  Custom NHS validator: ${customNhsValidator.name}`)
  console.log(`  Strict email validator: ${strictEmailValidator.name}`)
  console.log()

  // Step 7: Direct validation without executor
  console.log('Step 7: Direct validation without executor...')
  const context = buildServiceContext({
    record: { nhsNumber: '943 476 5919' },
    config: resolverConfig,
  })

  const directResult = await nhsNumberValidator.execute(
    { field: 'nhsNumber', value: '943 476 5919' },
    context,
  )

  console.log('Direct validation result:')
  console.log(`  Success: ${directResult.success}`)
  if (directResult.data) {
    const data = directResult.data as { valid?: boolean; details?: { normalizedValue?: string; confidence?: number } }
    console.log(`  Valid: ${data.valid}`)
    console.log(`  Normalized: ${data.details?.normalizedValue}`)
    console.log(`  Confidence: ${data.details?.confidence}`)
  }
  console.log()

  // Cleanup
  await executor.dispose()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- NHS number validation checks both format (10 digits) and checksum (modulus 11)')
  console.log('- onInvalid="reject" stops processing when validation fails')
  console.log('- onInvalid="flag" allows processing but marks the record')
  console.log('- Normalized values remove spaces and formatting')
  console.log('- Validation services can be used directly or through the executor')
}

// Run the example
basicValidationExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
