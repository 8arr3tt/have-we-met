# Healthcare Patient Matching Guide

This guide demonstrates how to use have-we-met for patient identity matching in healthcare environments. Patient matching is critical for patient safety, care coordination, and regulatory compliance.

## Overview

### The Challenge

Healthcare organizations face unique identity matching challenges:

- **Multiple facilities**: Patients visit different hospitals, clinics, and specialists
- **Name variations**: Married names, nicknames, transliteration differences
- **Data entry errors**: Typos in demographics during rushed registration
- **Missing identifiers**: Not all patients have SSN or consistent MRN
- **Life changes**: Addresses and phones change over time

Incorrect matching has serious consequences:

- **False positives**: Mixing patient records can lead to wrong treatments
- **False negatives**: Fragmented records miss critical history (allergies, medications)

### Goals

- **Maximum precision**: False positives can harm patients
- **High recall**: Missing matches fragments care
- **Comprehensive review**: Borderline cases require clinical review
- **Full audit trail**: HIPAA compliance requires tracking all access

## HIPAA and Compliance Considerations

Before implementing patient matching, address these compliance requirements:

### Minimum Necessary Standard

Only use fields necessary for matching:

```typescript
// Include: Demographics needed for matching
.field('lastName').type('name')
.field('firstName').type('name')
.field('dateOfBirth').type('date')
.field('gender').type('string')

// Exclude: Clinical data not needed for matching
// - Diagnoses, procedures, medications
// - Lab results, imaging reports
// - Provider notes
```

### Audit Logging

Log all matching activities:

```typescript
async function matchWithAudit(record: Patient, userId: string) {
  const startTime = Date.now()

  const result = await resolver.resolve(record)

  // Log the matching event
  await auditLog.write({
    event: 'patient_match_query',
    userId,
    patientIdentifier: hashIdentifier(record.mrn || record.ssn),
    matchesFound: result.matches.length,
    outcome: result.outcome,
    duration: Date.now() - startTime,
    timestamp: new Date(),
  })

  return result
}
```

### Access Controls

Integrate with your identity management:

```typescript
async function authorizedMatch(record: Patient, req: Request) {
  // Verify user has matching permissions
  const user = await validateSession(req)
  if (!user.permissions.includes('patient:match')) {
    throw new ForbiddenError('Patient matching not authorized')
  }

  // Verify user has access to the patient's facility
  if (record.facilityId && !user.facilities.includes(record.facilityId)) {
    throw new ForbiddenError('Facility access not authorized')
  }

  return matchWithAudit(record, user.id)
}
```

### Data Retention

Configure appropriate retention for matching data:

```typescript
// Clean up old queue items per retention policy
async function enforceRetention() {
  const retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000 // 7 years

  await resolver.queue.cleanup({
    olderThan: new Date(Date.now() - retentionPeriod),
    status: ['confirmed', 'rejected', 'expired'],
  })
}
```

## Complete Implementation

### Step 1: Define the Patient Schema

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { nhsNumberValidator, ssnValidator } from 'have-we-met/services'

interface Patient {
  id?: string
  mrn?: string // Medical Record Number (facility-specific)
  ssn?: string // Social Security Number (when available)
  nhsNumber?: string // UK NHS Number (when applicable)
  firstName: string
  middleName?: string
  lastName: string
  previousLastName?: string // Maiden name
  dateOfBirth: string // ISO date format
  gender: 'M' | 'F' | 'O' | 'U'
  motherMaidenName?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  phone?: string
  email?: string
  facilityId: string
  createdAt: Date
  updatedAt: Date
}
```

### Step 2: Configure High-Precision Matching

```typescript
const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Patient>()
  .schema((schema) =>
    schema
      .field('mrn')
      .type('string')
      .field('ssn')
      .type('string')
      .field('nhsNumber')
      .type('string')
      .field('firstName')
      .type('name')
      .component('first')
      .field('middleName')
      .type('name')
      .component('middle')
      .field('lastName')
      .type('name')
      .component('last')
      .field('previousLastName')
      .type('name')
      .component('last')
      .field('dateOfBirth')
      .type('date')
      .field('gender')
      .type('string')
      .field('motherMaidenName')
      .type('name')
      .component('last')
      .field('addressLine1')
      .type('address')
      .field('city')
      .type('string')
      .field('state')
      .type('string')
      .field('postalCode')
      .type('string')
      .field('phone')
      .type('phone')
      .field('email')
      .type('email')
      .field('createdAt')
      .type('date')
      .field('updatedAt')
      .type('date')
  )
  .blocking((block) =>
    block
      // Composite blocking for maximum recall with safety
      .composite('union', (comp) =>
        comp
          // Block by last name + birth year (most common)
          .onFields(['lastName', 'dateOfBirth'], {
            transforms: {
              lastName: 'soundex',
              dateOfBirth: 'year',
            },
          })
          // Also block by SSN when available
          .onField('ssn')
          // Block by NHS number when available
          .onField('nhsNumber')
      )
  )
  .matching((match) =>
    match
      // Unique identifiers - very high weight
      .field('mrn')
      .strategy('exact')
      .weight(35)
      .field('ssn')
      .strategy('exact')
      .weight(35)
      .field('nhsNumber')
      .strategy('exact')
      .weight(35)

      // Names - high weight with strict thresholds
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.92)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.9)
      .field('middleName')
      .strategy('jaro-winkler')
      .weight(6)
      .threshold(0.88)

      // Handle name changes (maiden name matching)
      .field('previousLastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.92)

      // Date of birth - critical identifier
      .field('dateOfBirth')
      .strategy('exact')
      .weight(20)

      // Gender - must match exactly
      .field('gender')
      .strategy('exact')
      .weight(8)

      // Mother's maiden name - strong verification
      .field('motherMaidenName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.9)

      // Address - supporting evidence
      .field('postalCode')
      .strategy('exact')
      .weight(6)
      .field('city')
      .strategy('jaro-winkler')
      .weight(4)
      .threshold(0.85)

      // Contact info - weak signals (change frequently)
      .field('phone')
      .strategy('exact')
      .weight(5)
      .field('email')
      .strategy('exact')
      .weight(5)

      // Very conservative thresholds for patient safety
      // Max possible: ~188 (if all fields present and match)
      // noMatch: 35 (~19%) - clear non-matches
      // definiteMatch: 95 (~51%) - requires strong identifier + demographics
      .thresholds({ noMatch: 35, definiteMatch: 95 })
  )
  .services((services) =>
    services
      .defaultTimeout(5000)
      .defaultRetry({ maxAttempts: 2, initialDelayMs: 100 })

      // Validate SSN format and checksum (US)
      .validate('ssn')
      .using(ssnValidator)
      .onInvalid('flag') // Don't reject - data may be legacy

      // Validate NHS number (UK)
      .validate('nhsNumber')
      .using(nhsNumberValidator)
      .onInvalid('flag')
      .required(false)
  )
  .merge((merge) =>
    merge
      .timestampField('updatedAt')
      .defaultStrategy('preferNonNull')

      // Names: prefer longer/more complete
      .field('firstName')
      .strategy('preferLonger')
      .field('middleName')
      .strategy('preferLonger')
      .field('lastName')
      .strategy('preferLonger')
      .field('previousLastName')
      .strategy('preferNonNull')

      // Identifiers: prefer non-null (keep any ID we have)
      .field('mrn')
      .strategy('preferNonNull')
      .field('ssn')
      .strategy('preferNonNull')
      .field('nhsNumber')
      .strategy('preferNonNull')

      // Demographics: prefer newer (more current)
      .field('addressLine1')
      .strategy('preferNewer')
      .field('city')
      .strategy('preferNewer')
      .field('state')
      .strategy('preferNewer')
      .field('postalCode')
      .strategy('preferNewer')
      .field('phone')
      .strategy('preferNewer')
      .field('email')
      .strategy('preferNewer')

      // Always track provenance for audit
      .trackProvenance(true)
  )
  .adapter(
    prismaAdapter(prisma, {
      tableName: 'patients',
      queue: {
        defaultPriority: 5, // Medium priority
        enableMetrics: true,
      },
    })
  )
  .build()
```

### Step 3: Match at Point of Care

```typescript
async function matchPatientAtRegistration(
  incomingPatient: Partial<Patient>,
  userId: string,
  facilityId: string
): Promise<MatchResult> {
  // Validate required fields
  if (
    !incomingPatient.lastName ||
    !incomingPatient.firstName ||
    !incomingPatient.dateOfBirth
  ) {
    throw new ValidationError(
      'lastName, firstName, and dateOfBirth are required'
    )
  }

  // Enrich with facility context
  const patient: Patient = {
    ...incomingPatient,
    facilityId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Patient

  // Run matching
  const result = await resolver.resolve(patient, {
    autoQueue: true,
    queueContext: {
      source: 'registration',
      userId,
      facilityId,
      metadata: {
        registrationTime: new Date().toISOString(),
        workstation: 'ADMIT-01',
      },
    },
    queuePriority: 8, // Higher priority for active registrations
  })

  // Log the match attempt
  await auditLog.write({
    event: 'patient_match_registration',
    userId,
    facilityId,
    outcome: result.outcome,
    matchCount: result.matches?.length || 0,
    timestamp: new Date(),
  })

  return result
}
```

### Step 4: Handle Match Outcomes

```typescript
async function handleMatchResult(
  result: MatchResult,
  incomingPatient: Patient,
  userId: string
) {
  switch (result.outcome) {
    case 'no-match':
      // Create new patient record
      const newPatient = await prisma.patient.create({
        data: {
          ...incomingPatient,
          id: generatePatientId(),
        },
      })
      return {
        action: 'created',
        patientId: newPatient.id,
      }

    case 'definite-match':
      // Link to existing patient
      const match = result.matches[0]

      // Even for definite matches, log for review
      await auditLog.write({
        event: 'patient_linked_auto',
        userId,
        incomingPatient: hashIdentifier(incomingPatient.mrn),
        linkedTo: match.record.id,
        score: match.score,
        maxScore: match.maxScore,
      })

      return {
        action: 'linked',
        patientId: match.record.id,
        confidence: match.score / match.maxScore,
      }

    case 'potential-match':
      // Queued for clinical review
      return {
        action: 'queued',
        queueItemId: result.queueItemId,
        potentialMatches: result.matches.length,
        message: 'Patient queued for identity verification',
      }

    case 'rejected':
      // Validation failed (e.g., invalid SSN format)
      return {
        action: 'validation_failed',
        errors: result.serviceResults?.validationErrors,
      }
  }
}
```

### Step 5: Clinical Review Workflow

```typescript
interface ReviewContext {
  userId: string
  role: 'registrar' | 'nurse' | 'him_specialist'
  facilityId: string
}

async function getReviewQueue(ctx: ReviewContext) {
  // HIM specialists see all; others see their facility
  const filter =
    ctx.role === 'him_specialist'
      ? {}
      : { 'context.facilityId': ctx.facilityId }

  return resolver.queue.list({
    status: 'pending',
    orderBy: 'priority',
    orderDirection: 'desc',
    limit: 20,
    ...filter,
  })
}

async function reviewPatientMatch(
  itemId: string,
  ctx: ReviewContext
): Promise<ReviewDetails> {
  const item = await resolver.queue.get(itemId)

  if (!item) {
    throw new NotFoundError('Queue item not found')
  }

  // Mark as being reviewed
  await resolver.queue.updateStatus(itemId, 'reviewing')

  // Format for clinical display
  return {
    itemId: item.id,
    incomingPatient: formatPatientForDisplay(item.candidateRecord),
    potentialMatches: item.potentialMatches.map((match) => ({
      patient: formatPatientForDisplay(match.record),
      score: match.score,
      maxScore: match.explanation.maxScore,
      confidence:
        ((match.score / match.explanation.maxScore) * 100).toFixed(1) + '%',
      fieldComparisons: match.explanation.fieldComparisons.map((fc) => ({
        field: fc.field,
        incoming: fc.valueA,
        existing: fc.valueB,
        similarity: (fc.similarity * 100).toFixed(0) + '%',
        contributed: fc.contributed,
        points: fc.contribution.toFixed(1),
      })),
    })),
    createdAt: item.createdAt,
    context: item.context,
  }
}

async function confirmPatientMatch(
  itemId: string,
  matchId: string,
  ctx: ReviewContext,
  notes: string
) {
  // Verify permissions for merge
  if (ctx.role === 'registrar') {
    throw new ForbiddenError(
      'Registrars cannot confirm matches. Escalate to HIM.'
    )
  }

  const result = await resolver.queue.merge(itemId, {
    selectedMatchId: matchId,
    notes,
    confidence: 0.95,
    decidedBy: ctx.userId,
  })

  await auditLog.write({
    event: 'patient_match_confirmed',
    userId: ctx.userId,
    itemId,
    matchId,
    goldenRecordId: result.decision?.mergeResult?.goldenRecordId,
    notes,
    timestamp: new Date(),
  })

  return result
}

async function rejectPatientMatch(
  itemId: string,
  ctx: ReviewContext,
  notes: string,
  reason: 'different_patient' | 'insufficient_data' | 'data_quality'
) {
  const result = await resolver.queue.reject(itemId, {
    notes,
    confidence: 0.9,
    decidedBy: ctx.userId,
  })

  await auditLog.write({
    event: 'patient_match_rejected',
    userId: ctx.userId,
    itemId,
    reason,
    notes,
    timestamp: new Date(),
  })

  return result
}
```

## Configuration Rationale

### Weight Selection

| Field             | Weight | Rationale                                |
| ----------------- | ------ | ---------------------------------------- |
| mrn/ssn/nhsNumber | 35     | Definitive identifiers when valid        |
| dateOfBirth       | 20     | Critical discriminator, rarely wrong     |
| lastName          | 15     | Primary name component                   |
| firstName         | 12     | Common but important                     |
| previousLastName  | 12     | Handles name changes                     |
| motherMaidenName  | 10     | Strong verification when available       |
| gender            | 8      | Must match, rules out half of population |
| middleName        | 6      | Helpful but often missing                |
| postalCode        | 6      | Geographic confirmation                  |
| phone/email       | 5      | Change frequently, weak signal           |

### Threshold Selection

The conservative thresholds reflect healthcare's zero-tolerance for false positives:

- **noMatch: 35**: Requires at least weak demographic match to be considered
- **definiteMatch: 95**: Requires unique identifier OR strong demographic consensus

Example score scenarios:

| Scenario                                        | Score            | Outcome   |
| ----------------------------------------------- | ---------------- | --------- |
| SSN + lastName + firstName + DOB match          | 35+15+12+20 = 82 | Potential |
| SSN + lastName + firstName + DOB + gender match | 82+8 = 90        | Potential |
| SSN + full demographics match                   | ~105             | Definite  |
| Only names match (no DOB, no ID)                | ~27              | No match  |

### Why Near-Total Precision

In healthcare, false positives have severe consequences:

- Wrong medication administered based on merged allergy list
- Incorrect diagnosis applied from wrong patient history
- Privacy violation by exposing one patient's data to another
- Legal liability for medical errors

The conservative thresholds ensure virtually all automatic matches are correct, with borderline cases escalated for clinical review.

## Performance Considerations

### Blocking for Healthcare Scale

Hospital systems may have millions of patient records. The composite blocking strategy handles this:

```typescript
.composite('union', comp => comp
  // Primary: Last name soundex + birth year
  .onFields(['lastName', 'dateOfBirth'], {
    transforms: { lastName: 'soundex', dateOfBirth: 'year' }
  })
  // Secondary: SSN (when available)
  .onField('ssn')
  // Tertiary: NHS number (UK)
  .onField('nhsNumber')
)
```

For 1 million patients:

- Without blocking: 500 billion comparisons
- With this strategy: ~5-10 million comparisons (99%+ reduction)

### Real-Time Matching

For point-of-care registration, response time matters:

```typescript
const result = await resolver.resolve(patient, {
  timeout: 3000, // 3 second max
  maxCandidates: 100, // Limit blocking results
})
```

### Cross-Facility Matching

For HIE (Health Information Exchange) scenarios:

```typescript
async function crossFacilityMatch(patient: Patient, facilityIds: string[]) {
  // Match against multiple facility databases
  const results = await Promise.all(
    facilityIds.map((facilityId) =>
      resolver.resolve(patient, {
        filter: { facilityId },
      })
    )
  )

  // Aggregate and deduplicate results
  return aggregateMatchResults(results)
}
```

## Industry-Specific Patterns

### Newborn Matching

Newborns lack history, so rely on birth records:

```typescript
function matchNewborn(newborn: Patient, mother: Patient) {
  // Match using mother's demographics + birth date
  return resolver.resolve({
    ...newborn,
    motherMaidenName: mother.lastName,
    // Use composite key for blocking
    birthFacility: mother.facilityId,
    birthDate: newborn.dateOfBirth,
  })
}
```

### Emergency Department

When patient is unresponsive or cannot provide information:

```typescript
async function emergencyMatch(partialInfo: Partial<Patient>) {
  // Lower thresholds for emergency scenarios
  // but flag all matches for review
  const result = await resolver.resolve(partialInfo as Patient, {
    autoQueue: true,
    queuePriority: 10, // Highest priority
    queueContext: {
      source: 'emergency',
      flags: ['requires_verification'],
    },
  })

  // All matches go to review in emergency
  if (result.outcome === 'definite-match') {
    await resolver.queue.add({
      candidateRecord: partialInfo as Patient,
      potentialMatches: result.matches,
      priority: 10,
      tags: ['emergency', 'verification-required'],
    })
  }

  return result
}
```

### Deceased Patient Handling

```typescript
async function handleDeceasedMatch(match: MatchResult) {
  const existingPatient = match.matches[0]?.record

  if (existingPatient?.deceasedDate) {
    // Flag for review - possible identity theft or data entry error
    await resolver.queue.add({
      candidateRecord: match.inputRecord,
      potentialMatches: match.matches,
      priority: 10,
      tags: ['deceased-flag', 'identity-verification'],
    })

    return {
      action: 'flagged',
      reason: 'Matched to deceased patient record',
    }
  }
}
```

## Quality Monitoring

Track matching effectiveness:

```typescript
async function getMatchingMetrics(dateRange: { start: Date; end: Date }) {
  const queueStats = await resolver.queue.stats()

  // Calculate review outcomes
  const confirmed = queueStats.byStatus.confirmed
  const rejected = queueStats.byStatus.rejected
  const total = confirmed + rejected

  return {
    // Volume metrics
    totalMatches: queueStats.total,
    pendingReview: queueStats.byStatus.pending,
    avgWaitTime: queueStats.avgWaitTime,

    // Quality metrics
    confirmRate:
      total > 0 ? ((confirmed / total) * 100).toFixed(1) + '%' : 'N/A',
    rejectRate: total > 0 ? ((rejected / total) * 100).toFixed(1) + '%' : 'N/A',

    // Throughput
    reviewsPerDay: queueStats.throughput?.last24h || 0,

    // Alerts
    alerts: [
      queueStats.byStatus.pending > 500 ? 'High queue backlog' : null,
      queueStats.avgWaitTime > 24 * 60 * 60 * 1000 ? 'Long wait times' : null,
    ].filter(Boolean),
  }
}
```

## Next Steps

- [External Services](../external-services.md): NHS/SSN validation integration
- [Review Queue](../review-queue.md): Building clinical review interfaces
- [Provenance](../provenance.md): Audit trail for compliance
- [Golden Record](../golden-record.md): Patient record merging strategies
