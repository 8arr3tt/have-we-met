# Security Considerations

## Overview

**have-we-met** is designed with security in mind, but identity resolution involves handling sensitive personal data. This guide covers security considerations when using the library.

## Input Validation

### User-Provided Data

All data passed to the library should be validated and sanitized by your application before processing:

```typescript
// ❌ DON'T: Pass unvalidated user input directly
const result = await resolver.resolve(req.body)

// ✅ DO: Validate and sanitize input first
const validated = validatePersonSchema(req.body)
const result = await resolver.resolve(validated)
```

### Field Values

The library handles null/undefined values gracefully and does not execute user-provided code. However:

- **String fields**: The library does not sanitize strings for XSS. If you display match results in a web UI, apply appropriate escaping.
- **Numeric fields**: Extreme values are handled safely but may affect performance.
- **Date fields**: Invalid dates are handled gracefully by normalizers.

## SQL Injection Prevention

### Database Adapters

All database adapters use parameterized queries and ORM-provided escaping:

- **Prisma**: Uses parameterized queries by default
- **Drizzle**: Uses prepared statements
- **TypeORM**: Uses query builders with parameter binding

**Never construct raw SQL** with user-provided field values:

```typescript
// ❌ DON'T: Construct raw queries with user input
adapter.findAll(`SELECT * FROM users WHERE email = '${userEmail}'`)

// ✅ DO: Use adapter methods with parameterized queries
adapter.findAll({ where: { email: userEmail } })
```

### Blocking Strategies

Blocking strategies generate WHERE clauses. The library ensures these are parameterized:

```typescript
// Safe: Generated queries use parameters
const blocks = await generator.generateBlocks(records)
// Produces: WHERE block_key = ? (parameterized)
```

## External Service Integration

### Service Timeouts

Always configure timeouts for external services to prevent hanging operations:

```typescript
const resolver = HaveWeMet.schema(schema)
  .services((s) =>
    s.validation('nhs', {
      timeout: 5000, // 5 second timeout
      retryAttempts: 2,
    })
  )
  .build()
```

### Circuit Breaker

Use circuit breakers to prevent cascading failures:

```typescript
const resolver = HaveWeMet.schema(schema)
  .services((s) =>
    s.validation('email', {
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000, // 60 seconds
      },
    })
  )
  .build()
```

### API Keys and Secrets

**Never hardcode API keys** in your configuration:

```typescript
// ❌ DON'T: Hardcode secrets
const service = customValidation('ssn', {
  apiKey: 'sk_live_abc123...', // NEVER DO THIS
})

// ✅ DO: Use environment variables
const service = customValidation('ssn', {
  apiKey: process.env.SSN_VALIDATION_API_KEY,
})
```

Store secrets in:

- Environment variables
- Secret management systems (AWS Secrets Manager, HashiCorp Vault)
- Encrypted configuration files

### Service Response Validation

Validate responses from external services:

```typescript
const myService = {
  async validate(value: string) {
    const response = await fetch(apiUrl)
    const data = await response.json()

    // Validate response structure
    if (typeof data.valid !== 'boolean') {
      throw new Error('Invalid response from service')
    }

    return { valid: data.valid }
  },
}
```

## Data Privacy

### Sensitive Data

Identity resolution processes sensitive personal data (PII):

- **Names**, **dates of birth**, **email addresses**, **phone numbers**
- **Government identifiers** (SSN, NHS number, NINO)
- **Addresses**, **medical record numbers**

**Recommendations:**

1. **Encryption at Rest**: Encrypt sensitive fields in your database
2. **Encryption in Transit**: Use TLS/SSL for all network communication
3. **Access Control**: Restrict who can run matching operations
4. **Audit Logging**: Log all matching operations for compliance
5. **Data Retention**: Delete match results after they're no longer needed

### GDPR Compliance

If processing EU citizen data:

- **Legal Basis**: Ensure you have a legal basis for processing (consent, legitimate interest, etc.)
- **Data Minimization**: Only match on fields necessary for identification
- **Right to Erasure**: Implement deletion of matched records when requested
- **Data Processing Agreements**: If using external services, ensure DPAs are in place

### HIPAA Compliance

If processing US healthcare data:

- **Business Associate Agreement**: Required for covered entities
- **Minimum Necessary**: Only use PHI fields required for matching
- **Audit Trails**: Log all record access and matching operations
- **Encryption**: Encrypt PHI at rest and in transit

## Machine Learning Security

### Training Data

When training ML models with feedback:

```typescript
const collector = new FeedbackCollector()
await collector.addDecision(queueItem, 'confirmed')
```

**Be aware:**

- Training data may contain biases that affect matching
- Malicious users could poison training data with incorrect decisions
- Consider validating feedback before using for training

**Recommendations:**

1. **Review Decisions**: Have multiple reviewers confirm decisions
2. **Outlier Detection**: Flag unusual decisions for review
3. **Model Validation**: Regularly test model accuracy on held-out data
4. **Rollback Capability**: Keep previous model versions to rollback if needed

### Model Files

Pre-trained model weights are included in the library. If loading external models:

```typescript
// ⚠️ CAUTION: Only load models from trusted sources
const model = SimpleClassifier.fromJSON(modelData)
```

**Never load models from:**

- Untrusted third parties
- User uploads without validation
- Public URLs without verification

## Denial of Service (DoS)

### Rate Limiting

Implement rate limiting for matching operations:

```typescript
// Example using express-rate-limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})

app.post('/api/match', limiter, async (req, res) => {
  const result = await resolver.resolve(req.body)
  res.json(result)
})
```

### Resource Limits

Batch operations on large datasets can consume significant memory:

```typescript
// Process in batches to limit memory usage
async function deduplicateLarge(records: any[]) {
  const batchSize = 10000
  const results = []

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const batchResults = await resolver.deduplicateBatch(batch)
    results.push(...batchResults)
  }

  return results
}
```

### Blocking Strategy Performance

Poor blocking configuration can cause performance issues:

```typescript
// ❌ BAD: No blocking = O(n²) comparisons
const resolver = HaveWeMet.schema(schema).build()

// ✅ GOOD: Blocking reduces comparison space
const resolver = HaveWeMet.schema(schema)
  .blocking((b) => b.onField('lastName', { transform: 'soundex' }))
  .build()
```

See [Performance Optimization Guide](./tuning/performance-optimization.md) for tuning recommendations.

## Code Injection

### Custom Functions

The library allows custom comparison and transformation functions:

```typescript
// Custom comparator
.field('customField').comparator((a, b) => {
  // Your comparison logic
  return similarity
})
```

**Be careful:**

- Do not execute user-provided code in custom functions
- Do not use `eval()` or `Function()` constructor with user input
- Validate all inputs to custom functions

```typescript
// ❌ DON'T: Execute user code
const userComparator = new Function('a', 'b', userProvidedCode)

// ✅ DO: Use predefined, safe functions
const allowedComparators = {
  exact: exactComparator,
  levenshtein: levenshteinComparator,
}
const comparator = allowedComparators[userSelection]
```

## Dependency Security

### Runtime Dependencies

The library has minimal runtime dependencies:

- **libphonenumber-js**: Phone number parsing (well-maintained, widely used)

### Development Dependencies

Development dependencies (testing, building) are not included in the published package. However, if you're contributing to the library:

- Run `npm audit` regularly to check for vulnerabilities
- Keep dependencies updated
- Review dependency changes in pull requests

### Supply Chain Security

To verify package integrity:

```bash
# Verify package signature
npm install have-we-met --verify-signatures

# Check for known vulnerabilities
npm audit

# Use lockfile for reproducible installs
npm ci
```

## Reporting Vulnerabilities

If you discover a security vulnerability in **have-we-met**, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers directly (see [SECURITY.md](../SECURITY.md))
3. Include a description, impact assessment, and reproduction steps
4. Allow time for a fix before public disclosure

See [SECURITY.md](../SECURITY.md) for our security policy and response timeline.

## Security Checklist

Before deploying have-we-met in production:

- [ ] Input validation implemented for all user data
- [ ] SQL injection prevention verified (use ORM methods, not raw SQL)
- [ ] External service timeouts and circuit breakers configured
- [ ] API keys and secrets stored securely (environment variables, secret manager)
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Access control implemented for matching operations
- [ ] Audit logging enabled for compliance
- [ ] Rate limiting applied to public-facing match endpoints
- [ ] Batch operation memory limits tested
- [ ] Blocking strategies configured to prevent DoS
- [ ] Custom functions reviewed for code injection risks
- [ ] Dependencies audited with `npm audit`
- [ ] GDPR/HIPAA compliance reviewed (if applicable)

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GDPR Requirements](https://gdpr-info.eu/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
