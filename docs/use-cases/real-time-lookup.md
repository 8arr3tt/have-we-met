# Real-Time Matching Guide

This guide demonstrates how to use have-we-met for real-time identity matching at point of entry. Real-time matching prevents duplicates before they're created by checking incoming records against existing data instantly.

## Overview

### The Challenge

Point-of-entry systems need instant identity resolution:

- **E-commerce checkout**: Is this customer already registered?
- **Call center**: Which customer is calling?
- **Event registration**: Has this person already signed up?
- **Lead capture**: Is this a new lead or existing contact?

Real-time matching requires:

- **Low latency**: Sub-second response times
- **High availability**: Cannot block critical user flows
- **Graceful degradation**: Handle failures without breaking checkout/registration

### Goals

- **Fast response**: < 200ms for typical lookups
- **Minimal false positives**: Don't frustrate users with wrong matches
- **Actionable results**: Clear yes/no/maybe for the calling system
- **Resilience**: Continue operating when external services are slow

## Complete Implementation

### Step 1: Configure for Speed

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { emailValidator, phoneValidator } from 'have-we-met/services'

interface Contact {
  id?: string
  email: string
  phone?: string
  firstName: string
  lastName: string
  company?: string
  createdAt: Date
  updatedAt: Date
}

const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Contact>()
  .schema((schema) =>
    schema
      .field('email')
      .type('email')
      .field('phone')
      .type('phone')
      .field('firstName')
      .type('name')
      .component('first')
      .field('lastName')
      .type('name')
      .component('last')
      .field('company')
      .type('string')
      .field('createdAt')
      .type('date')
      .field('updatedAt')
      .type('date')
  )
  .blocking((block) =>
    block
      // Single-field blocking for speed
      // Email domain provides good grouping without excessive comparisons
      .onField('email', { transform: 'domain' })
  )
  .matching((match) =>
    match
      // Email is primary - if it matches, likely same person
      .field('email')
      .strategy('exact')
      .weight(30)

      // Phone is strong secondary identifier
      .field('phone')
      .strategy('exact')
      .weight(20)

      // Names for verification
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.88)

      // Company helps in B2B contexts
      .field('company')
      .strategy('jaro-winkler')
      .weight(8)
      .threshold(0.8)

      // Balanced thresholds for real-time use
      // Max: 80, noMatch: 15 (19%), definiteMatch: 45 (56%)
      .thresholds({ noMatch: 15, definiteMatch: 45 })
  )
  .services((services) =>
    services
      // Aggressive timeouts for real-time
      .defaultTimeout(500) // 500ms max for any service
      .defaultRetry({ maxAttempts: 1 }) // Single attempt only

      // Enable caching to speed up repeated lookups
      .caching(true)

      // Validate email format (fast, local)
      .validate('email')
      .using(emailValidator)
      .onInvalid('flag')
      .timeout(50) // Very fast

      // Validate phone format (fast, local)
      .validate('phone')
      .using(phoneValidator)
      .onInvalid('flag')
      .timeout(50)
  )
  .adapter(
    prismaAdapter(prisma, {
      tableName: 'contacts',
    })
  )
  .build()
```

### Step 2: Create the Lookup Service

```typescript
interface LookupResult {
  status: 'found' | 'not_found' | 'review' | 'error'
  contact?: Contact
  confidence?: number
  suggestions?: Contact[]
  message?: string
  duration: number
}

async function lookupContact(input: Partial<Contact>): Promise<LookupResult> {
  const startTime = Date.now()

  try {
    // Validate minimum required fields
    if (!input.email && !input.phone) {
      return {
        status: 'error',
        message: 'Email or phone required for lookup',
        duration: Date.now() - startTime,
      }
    }

    // Run matching with timeout
    const result = await Promise.race([
      resolver.resolve(input as Contact),
      timeoutPromise(2000), // Hard 2 second timeout
    ])

    if (result === 'timeout') {
      // Graceful degradation - treat as not found
      console.warn('Lookup timed out, allowing new record')
      return {
        status: 'not_found',
        message: 'Lookup timed out',
        duration: Date.now() - startTime,
      }
    }

    switch (result.outcome) {
      case 'definite-match':
        return {
          status: 'found',
          contact: result.matches[0].record,
          confidence: result.matches[0].score / result.matches[0].maxScore,
          duration: Date.now() - startTime,
        }

      case 'potential-match':
        return {
          status: 'review',
          suggestions: result.matches.map((m) => m.record),
          confidence: result.matches[0].score / result.matches[0].maxScore,
          duration: Date.now() - startTime,
        }

      case 'no-match':
        return {
          status: 'not_found',
          duration: Date.now() - startTime,
        }

      default:
        return {
          status: 'not_found',
          duration: Date.now() - startTime,
        }
    }
  } catch (error) {
    console.error('Lookup error:', error)
    // Graceful degradation - allow the transaction to proceed
    return {
      status: 'error',
      message: 'Lookup service unavailable',
      duration: Date.now() - startTime,
    }
  }
}

function timeoutPromise(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))
}
```

### Step 3: Integrate with Your Application

#### Express.js API Example

```typescript
import express from 'express'

const app = express()
app.use(express.json())

// Lookup endpoint
app.post('/api/contacts/lookup', async (req, res) => {
  const { email, phone, firstName, lastName, company } = req.body

  const result = await lookupContact({
    email,
    phone,
    firstName,
    lastName,
    company,
  })

  // Add timing header for monitoring
  res.set('X-Lookup-Duration', result.duration.toString())

  switch (result.status) {
    case 'found':
      res.json({
        exists: true,
        contact: sanitizeContact(result.contact),
        confidence: result.confidence,
      })
      break

    case 'review':
      res.json({
        exists: 'maybe',
        suggestions: result.suggestions.map(sanitizeContact),
        confidence: result.confidence,
      })
      break

    case 'not_found':
      res.json({
        exists: false,
      })
      break

    case 'error':
      // Return 200 with error flag - don't block the user
      res.json({
        exists: false,
        warning: result.message,
      })
      break
  }
})

// Create with dedup
app.post('/api/contacts', async (req, res) => {
  const contactData = req.body

  // Lookup first
  const lookup = await lookupContact(contactData)

  if (lookup.status === 'found') {
    // Return existing contact
    res.status(200).json({
      created: false,
      contact: sanitizeContact(lookup.contact),
      message: 'Existing contact found',
    })
    return
  }

  if (lookup.status === 'review') {
    // Could auto-merge or return suggestions
    // For this example, we return suggestions
    res.status(200).json({
      created: false,
      requiresReview: true,
      suggestions: lookup.suggestions.map(sanitizeContact),
      message: 'Potential duplicates found',
    })
    return
  }

  // Create new contact
  const newContact = await prisma.contact.create({
    data: {
      ...contactData,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })

  res.status(201).json({
    created: true,
    contact: sanitizeContact(newContact),
  })
})

function sanitizeContact(contact: Contact) {
  // Remove internal fields before returning to client
  const { id, ...rest } = contact
  return { id, ...rest }
}
```

#### React Hook Example

```typescript
import { useState, useCallback } from 'react'

interface UseLookupResult {
  lookup: (data: Partial<Contact>) => Promise<LookupResult>
  isLoading: boolean
  result: LookupResult | null
  clear: () => void
}

function useContactLookup(): UseLookupResult {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)

  const lookup = useCallback(async (data: Partial<Contact>) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/contacts/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const lookupResult = await response.json()
      setResult(lookupResult)
      return lookupResult
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clear = useCallback(() => setResult(null), [])

  return { lookup, isLoading, result, clear }
}

// Usage in a registration form
function RegistrationForm() {
  const { lookup, isLoading, result } = useContactLookup()
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: ''
  })

  // Debounced lookup on email blur
  const handleEmailBlur = async () => {
    if (formData.email) {
      await lookup({ email: formData.email })
    }
  }

  return (
    <form>
      <input
        type="email"
        value={formData.email}
        onChange={e => setFormData({ ...formData, email: e.target.value })}
        onBlur={handleEmailBlur}
        placeholder="Email"
      />

      {isLoading && <span>Checking...</span>}

      {result?.exists === true && (
        <div className="notice">
          Welcome back! We found your account.
          <button type="button" onClick={() => signIn(result.contact)}>
            Sign in instead
          </button>
        </div>
      )}

      {result?.exists === 'maybe' && (
        <div className="notice">
          Is this you?
          {result.suggestions.map(contact => (
            <button
              key={contact.id}
              type="button"
              onClick={() => signIn(contact)}
            >
              {contact.firstName} {contact.lastName} ({contact.email})
            </button>
          ))}
        </div>
      )}

      {/* Rest of form... */}
    </form>
  )
}
```

## Performance Optimization

### Caching Strategies

#### In-Memory Cache for Hot Paths

```typescript
import NodeCache from 'node-cache'

const lookupCache = new NodeCache({
  stdTTL: 300, // 5 minute default TTL
  checkperiod: 60, // Check for expired keys every 60s
  maxKeys: 10000, // Limit memory usage
})

async function cachedLookup(input: Partial<Contact>): Promise<LookupResult> {
  // Create cache key from input
  const cacheKey = createCacheKey(input)

  // Check cache first
  const cached = lookupCache.get<LookupResult>(cacheKey)
  if (cached) {
    return { ...cached, duration: 0 } // Instant response
  }

  // Perform lookup
  const result = await lookupContact(input)

  // Cache successful lookups
  if (result.status !== 'error') {
    lookupCache.set(cacheKey, result)
  }

  return result
}

function createCacheKey(input: Partial<Contact>): string {
  // Normalize and hash input for consistent keys
  const normalized = {
    email: input.email?.toLowerCase().trim(),
    phone: normalizePhone(input.phone),
    firstName: input.firstName?.toLowerCase().trim(),
    lastName: input.lastName?.toLowerCase().trim(),
  }
  return JSON.stringify(normalized)
}
```

#### Redis Cache for Distributed Systems

```typescript
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

async function distributedLookup(
  input: Partial<Contact>
): Promise<LookupResult> {
  const cacheKey = `contact:lookup:${createCacheKey(input)}`

  // Check Redis first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return { ...JSON.parse(cached), duration: 0 }
  }

  // Perform lookup
  const result = await lookupContact(input)

  // Cache with TTL
  if (result.status !== 'error') {
    await redis.setex(cacheKey, 300, JSON.stringify(result))
  }

  return result
}
```

### Database Optimization

#### Index Strategy

Ensure your database has appropriate indexes:

```sql
-- Primary lookup index (email)
CREATE INDEX idx_contacts_email ON contacts(email);

-- Secondary lookup index (phone)
CREATE INDEX idx_contacts_phone ON contacts(phone) WHERE phone IS NOT NULL;

-- Blocking support (email domain extraction)
CREATE INDEX idx_contacts_email_domain ON contacts(
  (split_part(email, '@', 2))
);

-- Name search (for fuzzy matching)
CREATE INDEX idx_contacts_lastname_soundex ON contacts(
  soundex(last_name)
);
```

#### Connection Pooling

```typescript
import { PrismaClient } from '@prisma/client'

// Configure connection pool for high throughput
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Log slow queries
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
})

// Monitor slow queries
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    // Log queries > 100ms
    console.warn(`Slow query (${e.duration}ms): ${e.query}`)
  }
})
```

### Blocking Optimization for Real-Time

For real-time scenarios, simpler blocking is faster:

```typescript
// Fast: Single field blocking
.blocking(block => block
  .onField('email', { transform: 'domain' })
)

// Slower: Composite blocking (more recall, less speed)
.blocking(block => block
  .composite('union', comp => comp
    .onField('email', { transform: 'domain' })
    .onField('lastName', { transform: 'soundex' })
  )
)
```

Choose based on your requirements:

| Priority | Strategy                         | Typical Latency |
| -------- | -------------------------------- | --------------- |
| Speed    | Single field (email domain)      | 20-50ms         |
| Balance  | Single field (last name soundex) | 30-80ms         |
| Recall   | Composite blocking               | 80-200ms        |

## Graceful Degradation

### Circuit Breaker Pattern

```typescript
import CircuitBreaker from 'opossum'

const breakerOptions = {
  timeout: 2000, // 2 second timeout
  errorThresholdPercentage: 50, // Open after 50% failures
  resetTimeout: 30000, // Try again after 30 seconds
}

const lookupBreaker = new CircuitBreaker(lookupContact, breakerOptions)

// Fallback when circuit is open
lookupBreaker.fallback(() => ({
  status: 'not_found' as const,
  message: 'Lookup service temporarily unavailable',
  duration: 0,
}))

// Use the breaker-protected lookup
async function resilientLookup(input: Partial<Contact>): Promise<LookupResult> {
  return lookupBreaker.fire(input)
}

// Monitor circuit state
lookupBreaker.on('open', () => {
  console.warn('Lookup circuit breaker opened')
  alertOps('Lookup service degraded')
})

lookupBreaker.on('halfOpen', () => {
  console.info('Lookup circuit breaker testing')
})

lookupBreaker.on('close', () => {
  console.info('Lookup circuit breaker closed')
})
```

### Timeout Handling

```typescript
async function lookupWithTimeout(
  input: Partial<Contact>,
  timeoutMs: number = 1000
): Promise<LookupResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const result = await lookupContact(input)
    clearTimeout(timeoutId)
    return result
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      return {
        status: 'not_found',
        message: 'Lookup timed out',
        duration: timeoutMs,
      }
    }
    throw error
  }
}
```

## Monitoring and Alerting

### Metrics Collection

```typescript
import { Counter, Histogram } from 'prom-client'

const lookupDuration = new Histogram({
  name: 'contact_lookup_duration_ms',
  help: 'Contact lookup duration in milliseconds',
  buckets: [10, 25, 50, 100, 200, 500, 1000, 2000],
})

const lookupOutcome = new Counter({
  name: 'contact_lookup_outcome_total',
  help: 'Contact lookup outcomes',
  labelNames: ['status'],
})

async function instrumentedLookup(
  input: Partial<Contact>
): Promise<LookupResult> {
  const end = lookupDuration.startTimer()

  const result = await lookupContact(input)

  end()
  lookupOutcome.inc({ status: result.status })

  return result
}
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: contact_lookup
    rules:
      - alert: LookupLatencyHigh
        expr: histogram_quantile(0.95, contact_lookup_duration_ms_bucket) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Contact lookup p95 latency above 500ms

      - alert: LookupErrorRate
        expr: rate(contact_lookup_outcome_total{status="error"}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Contact lookup error rate above 5%
```

## Testing

### Load Testing

```typescript
import autocannon from 'autocannon'

async function loadTest() {
  const result = await autocannon({
    url: 'http://localhost:3000/api/contacts/lookup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    }),
    connections: 100,
    duration: 30,
  })

  console.log('Requests/sec:', result.requests.average)
  console.log('Latency p50:', result.latency.p50)
  console.log('Latency p99:', result.latency.p99)
  console.log('Errors:', result.errors)
}
```

### Integration Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('Real-time lookup', () => {
  beforeAll(async () => {
    // Seed test data
    await prisma.contact.createMany({
      data: [
        {
          id: '1',
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Smith',
        },
        {
          id: '2',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
        },
      ],
    })
  })

  afterAll(async () => {
    await prisma.contact.deleteMany()
  })

  it('finds exact email match', async () => {
    const result = await lookupContact({ email: 'john@example.com' })

    expect(result.status).toBe('found')
    expect(result.contact?.firstName).toBe('John')
    expect(result.duration).toBeLessThan(200)
  })

  it('returns not_found for new email', async () => {
    const result = await lookupContact({ email: 'new@example.com' })

    expect(result.status).toBe('not_found')
    expect(result.duration).toBeLessThan(200)
  })

  it('handles timeout gracefully', async () => {
    // Simulate slow lookup
    const result = await lookupWithTimeout(
      { email: 'test@example.com' },
      1 // 1ms timeout - will definitely timeout
    )

    expect(result.status).toBe('not_found')
    expect(result.message).toContain('timeout')
  })
})
```

## Next Steps

- [Blocking Strategies](../blocking/overview.md): Optimize blocking for your scale
- [External Services](../external-services.md): Add validation services
- [Database Adapters](../database-adapters.md): Configure your database
- [Tuning Guide](../tuning-guide.md): Fine-tune weights and thresholds
