# Examples

This document provides complete, real-world examples of probabilistic matching configurations for common use cases.

## Table of Contents

- [Customer Deduplication](#customer-deduplication)
- [Patient Record Matching](#patient-record-matching)
- [Contact List Merging](#contact-list-merging)
- [Employee Record Matching](#employee-record-matching)
- [Lead Deduplication](#lead-deduplication)
- [Account Consolidation](#account-consolidation)

## Customer Deduplication

**Use Case:** E-commerce platform needs to identify and merge duplicate customer accounts.

**Characteristics:**
- Email is the primary identifier
- Names may have typos or variations
- Phone numbers and addresses change frequently
- Need high precision to avoid merging different customers

### Schema Definition

```typescript
import { HaveWeMet } from 'have-we-met'

interface Customer {
  email: string
  phone?: string
  firstName: string
  lastName: string
  billingAddress?: string
  billingCity?: string
  billingZip?: string
  accountCreated: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(schema => {
    schema
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('billingAddress', { type: 'address' })
      .field('billingCity', { type: 'string' })
      .field('billingZip', { type: 'string' })
      .field('accountCreated', { type: 'date' })
  })
  .blocking(block => block
    .onField('email', { transform: 'domain' })  // Block by email domain
  )
  .matching(match => {
    match
      .field('email')
        .strategy('exact')
        .weight(25)
      .field('phone')
        .strategy('exact')
        .weight(10)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(8)
        .threshold(0.90)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(8)
        .threshold(0.90)
      .field('billingZip')
        .strategy('exact')
        .weight(7)
      .field('billingCity')
        .strategy('jaro-winkler')
        .weight(4)
        .threshold(0.85)
      .thresholds({ noMatch: 20, definiteMatch: 50 })
  })
  .build()
```

### Rationale

- **Email (weight 25):** Most reliable identifier. Exact matches strongly indicate same customer.
- **Phone (weight 10):** Helpful but changes more often than email. Lower weight reflects this.
- **Names (weight 8 each, threshold 0.90):** High threshold because typos are common but we want high confidence. Jaro-Winkler handles minor variations.
- **ZIP code (weight 7):** More stable than full address. Helps confirm same geographic area.
- **City (weight 4):** Weak signal but helps when combined with other fields.
- **Thresholds (20/50):** Conservative definiteMatch threshold (50/62 = 81%) ensures high precision for auto-merges.

### Example Results

```typescript
// Definite Match (Score: 57/62)
const customer1 = {
  email: 'john.smith@example.com',
  phone: '+1-555-0100',
  firstName: 'John',
  lastName: 'Smith',
  billingZip: '10001'
}

const customer2 = {
  email: 'john.smith@example.com',
  phone: '+1-555-0100',
  firstName: 'John',
  lastName: 'Smith',
  billingZip: '10001'
}
// → Email + Phone + Names + ZIP all match → Auto-merge

// Potential Match (Score: 38/62)
const customer3 = {
  email: 'john.smith@example.com',
  phone: '+1-555-0100',
  firstName: 'John',
  lastName: 'Smith',
  billingZip: '10001'
}

const customer4 = {
  email: 'john.smith@example.com',
  phone: '+1-555-0200',  // Different phone
  firstName: 'Jon',       // Slight name variation
  lastName: 'Smyth',      // Slight name variation
  billingZip: '10002'     // Different ZIP
}
// → Email matches but other signals mixed → Manual review
```

## Patient Record Matching

**Use Case:** Healthcare system needs to match patient records across facilities with high accuracy.

**Characteristics:**
- HIPAA compliance requires high precision
- Multiple strong identifiers (MRN, SSN)
- Names and dates of birth are critical
- False positives can violate privacy

### Schema Definition

```typescript
interface Patient {
  mrn?: string           // Medical Record Number
  ssn?: string           // Social Security Number
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: 'M' | 'F' | 'O'
  motherMaidenName?: string
  address?: string
  phone?: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Patient>()
  .schema(schema => {
    schema
      .field('mrn', { type: 'string' })
      .field('ssn', { type: 'string' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('gender', { type: 'string' })
      .field('motherMaidenName', { type: 'name', component: 'last' })
      .field('address', { type: 'address' })
      .field('phone', { type: 'phone' })
  })
  .blocking(block => block
    .onFields(['lastName', 'dateOfBirth'], { strategy: 'composite' })
  )
  .matching(match => {
    match
      .field('mrn')
        .strategy('exact')
        .weight(30)
      .field('ssn')
        .strategy('exact')
        .weight(30)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(12)
        .threshold(0.92)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(12)
        .threshold(0.92)
      .field('dateOfBirth')
        .strategy('exact')
        .weight(15)
      .field('gender')
        .strategy('exact')
        .weight(5)
      .field('motherMaidenName')
        .strategy('jaro-winkler')
        .weight(8)
        .threshold(0.90)
      .field('phone')
        .strategy('exact')
        .weight(6)
      .thresholds({ noMatch: 30, definiteMatch: 70 })
  })
  .build()
```

### Rationale

- **MRN & SSN (weight 30 each):** Strongest identifiers. Either one matching is strong evidence.
- **Names (weight 12 each, threshold 0.92):** Very high threshold for patient safety. Must be highly similar.
- **Date of Birth (weight 15):** Critical for patient identification. Exact match only.
- **Gender (weight 5):** Helps rule out false positives.
- **Mother's Maiden Name (weight 8):** Additional verification when available.
- **Thresholds (30/70):** Very conservative. 70/118 = 59% required for definite match ensures strong evidence.

### Example Results

```typescript
// Definite Match (Score: 74/118)
const patient1 = {
  ssn: '123-45-6789',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  gender: 'F'
}

const patient2 = {
  ssn: '123-45-6789',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  gender: 'F'
}
// → SSN + Name + DOB + Gender all match → High confidence match

// Potential Match (Score: 44/118)
const patient3 = {
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  gender: 'F',
  phone: '+1-555-0100'
}

const patient4 = {
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-05-15',
  gender: 'F',
  phone: '+1-555-0200'  // Different phone
}
// → Name + DOB + Gender match, but no SSN/MRN → Manual verification needed
```

## Contact List Merging

**Use Case:** Merging contact lists from multiple sources (CRM, email, social media).

**Characteristics:**
- No single reliable identifier
- Data quality varies by source
- Names may use nicknames or different formats
- Need balanced precision and recall

### Schema Definition

```typescript
interface Contact {
  email?: string
  phone?: string
  firstName: string
  lastName: string
  company?: string
  jobTitle?: string
  city?: string
  country?: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Contact>()
  .schema(schema => {
    schema
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('company', { type: 'string' })
      .field('jobTitle', { type: 'string' })
      .field('city', { type: 'string' })
      .field('country', { type: 'string' })
  })
  .blocking(block => block
    .onField('company', { transform: 'lowercase' })
  )
  .matching(match => {
    match
      .field('email')
        .strategy('exact')
        .weight(18)
      .field('phone')
        .strategy('exact')
        .weight(15)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(12)
        .threshold(0.85)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(12)
        .threshold(0.85)
      .field('company')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.80)
      .field('city')
        .strategy('jaro-winkler')
        .weight(5)
      .field('country')
        .strategy('exact')
        .weight(3)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .build()
```

### Rationale

- **Email (weight 18):** Primary identifier but not always present.
- **Phone (weight 15):** Good identifier when available.
- **Names (weight 12 each, threshold 0.85):** Important but allow for variations (nicknames).
- **Company (weight 10, threshold 0.80):** Helpful context. Same person likely at same company.
- **Location (weights 5, 3):** Weak signals for supporting evidence.
- **Thresholds (20/45):** Balanced approach. 45/75 = 60% for definite match.

### Example Results

```typescript
// Definite Match (Score: 57/75)
const contact1 = {
  email: 'jsmith@acme.com',
  phone: '+1-555-0100',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp',
  city: 'New York'
}

const contact2 = {
  email: 'jsmith@acme.com',
  phone: '+1-555-0100',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corporation',  // Slight variation
  city: 'NYC'
}
// → Email + Phone + Name + Company (fuzzy) → Strong match

// Potential Match (Score: 34/75)
const contact3 = {
  email: 'jsmith@acme.com',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp'
}

const contact4 = {
  email: 'john.smith@acme.com',  // Different email
  firstName: 'Johnny',            // Nickname
  lastName: 'Smith',
  company: 'Acme Corp'
}
// → Names + Company match but different emails → Review needed
```

## Employee Record Matching

**Use Case:** HR system needs to match employee records across acquisitions and system migrations.

**Characteristics:**
- Employee ID is reliable when present
- Email changes with company transitions
- SSN is reliable but privacy-sensitive
- Need to handle name changes (marriage, etc.)

### Schema Definition

```typescript
interface Employee {
  employeeId?: string
  ssn?: string
  email?: string
  firstName: string
  lastName: string
  dateOfBirth: string
  hireDate: string
  department?: string
  previousLastName?: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Employee>()
  .schema(schema => {
    schema
      .field('employeeId', { type: 'string' })
      .field('ssn', { type: 'string' })
      .field('email', { type: 'email' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('hireDate', { type: 'date' })
      .field('department', { type: 'string' })
      .field('previousLastName', { type: 'name', component: 'last' })
  })
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
  )
  .matching(match => {
    match
      .field('employeeId')
        .strategy('exact')
        .weight(30)
      .field('ssn')
        .strategy('exact')
        .weight(28)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.88)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.88)
      .field('previousLastName')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.88)
      .field('dateOfBirth')
        .strategy('exact')
        .weight(15)
      .field('email')
        .strategy('exact')
        .weight(8)
      .field('hireDate')
        .strategy('exact')
        .weight(6)
      .thresholds({ noMatch: 25, definiteMatch: 60 })
  })
  .build()
```

### Rationale

- **Employee ID (weight 30):** Strongest identifier within a single company.
- **SSN (weight 28):** Very strong, but may not always be available.
- **Names (weight 10 each):** Include previousLastName to handle name changes.
- **Date of Birth (weight 15):** Stable and discriminating.
- **Email (weight 8):** Lower because it changes with company transitions.
- **Hire Date (weight 6):** Helps distinguish employees with same name.
- **Thresholds (25/60):** Moderately conservative. 60/117 = 51% for definite match.

### Example Results

```typescript
// Definite Match (Score: 63/117)
const employee1 = {
  employeeId: 'EMP001',
  firstName: 'Jane',
  lastName: 'Smith',
  dateOfBirth: '1985-03-15',
  hireDate: '2015-06-01'
}

const employee2 = {
  employeeId: 'EMP001',
  firstName: 'Jane',
  lastName: 'Smith',
  dateOfBirth: '1985-03-15',
  hireDate: '2015-06-01'
}
// → ID + Name + DOB + Hire Date match → Same employee

// Potential Match (Score: 45/117) - Name Change Scenario
const employee3 = {
  firstName: 'Jane',
  lastName: 'Smith',
  previousLastName: 'Johnson',
  dateOfBirth: '1985-03-15',
  hireDate: '2015-06-01'
}

const employee4 = {
  firstName: 'Jane',
  lastName: 'Johnson',
  dateOfBirth: '1985-03-15',
  hireDate: '2015-06-01'
}
// → Name matches previousLastName + DOB + Hire Date → Likely name change
```

## Lead Deduplication

**Use Case:** Marketing automation platform needs to deduplicate leads to avoid contacting the same person multiple times.

**Characteristics:**
- Email is primary identifier
- Names often incomplete or informal
- Want high recall (prefer false positives over duplicate contacts)
- Company context is important

### Schema Definition

```typescript
interface Lead {
  email: string
  phone?: string
  firstName: string
  lastName: string
  company: string
  jobTitle?: string
  website?: string
  source: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Lead>()
  .schema(schema => {
    schema
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('company', { type: 'string' })
      .field('jobTitle', { type: 'string' })
      .field('website', { type: 'string' })
  })
  .blocking(block => block
    .onField('email', { transform: 'domain' })
  )
  .matching(match => {
    match
      .field('email')
        .strategy('exact')
        .weight(25)
      .field('phone')
        .strategy('exact')
        .weight(12)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(8)
        .threshold(0.80)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(8)
        .threshold(0.80)
      .field('company')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.85)
      .field('website')
        .strategy('exact')
        .weight(7)
      .thresholds({ noMatch: 15, definiteMatch: 40 })
  })
  .build()
```

### Rationale

- **Email (weight 25):** Primary deduplication key.
- **Phone (weight 12):** Good supporting evidence.
- **Names (weight 8 each, threshold 0.80):** Lower threshold allows for nicknames ("Bob" vs "Robert").
- **Company (weight 10, threshold 0.85):** Important context. Same person likely at same company.
- **Website (weight 7):** Company website helps confirm organization.
- **Thresholds (15/40):** Aggressive for high recall. 40/70 = 57% for definite match. Better to merge potential duplicates than to spam same person.

### Example Results

```typescript
// Definite Match (Score: 51/70)
const lead1 = {
  email: 'john@acme.com',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp',
  jobTitle: 'CTO'
}

const lead2 = {
  email: 'john@acme.com',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corporation',
  jobTitle: 'Chief Technology Officer'
}
// → Email + Name + Company (fuzzy) → Same lead

// Potential Match (Score: 28/70)
const lead3 = {
  email: 'john@acme.com',
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp'
}

const lead4 = {
  email: 'jsmith@acme.com',  // Different email
  firstName: 'John',
  lastName: 'Smith',
  company: 'Acme Corp'
}
// → Same person, different email format? → Review
```

## Account Consolidation

**Use Case:** Financial institution needs to consolidate accounts after a merger.

**Characteristics:**
- Account numbers are unique but may not overlap
- SSN is highly reliable
- Names and addresses must match closely
- Need very high precision (financial impact)

### Schema Definition

```typescript
interface Account {
  accountNumber: string
  ssn: string
  firstName: string
  lastName: string
  dateOfBirth: string
  address: string
  city: string
  state: string
  zipCode: string
  phone?: string
}
```

### Configuration

```typescript
const resolver = HaveWeMet.create<Account>()
  .schema(schema => {
    schema
      .field('accountNumber', { type: 'string' })
      .field('ssn', { type: 'string' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('address', { type: 'address' })
      .field('city', { type: 'string' })
      .field('state', { type: 'string' })
      .field('zipCode', { type: 'string' })
      .field('phone', { type: 'phone' })
  })
  .blocking(block => block
    .onField('ssn')
  )
  .matching(match => {
    match
      .field('ssn')
        .strategy('exact')
        .weight(35)
      .field('firstName')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.95)
      .field('lastName')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.95)
      .field('dateOfBirth')
        .strategy('exact')
        .weight(15)
      .field('address')
        .strategy('jaro-winkler')
        .weight(10)
        .threshold(0.90)
      .field('zipCode')
        .strategy('exact')
        .weight(8)
      .field('phone')
        .strategy('exact')
        .weight(7)
      .thresholds({ noMatch: 30, definiteMatch: 70 })
  })
  .build()
```

### Rationale

- **SSN (weight 35):** Most reliable identifier for financial accounts.
- **Names (weight 10 each, threshold 0.95):** Very high threshold for financial accuracy.
- **Date of Birth (weight 15):** Critical verification field.
- **Address (weight 10, threshold 0.90):** Must be very similar to contribute.
- **ZIP Code (weight 8):** Stable geographic indicator.
- **Phone (weight 7):** Supporting evidence.
- **Thresholds (30/70):** Very conservative. 70/95 = 74% required for auto-consolidation.

### Example Results

```typescript
// Definite Match (Score: 87/95)
const account1 = {
  accountNumber: 'ACC-12345',
  ssn: '123-45-6789',
  firstName: 'Robert',
  lastName: 'Johnson',
  dateOfBirth: '1975-08-22',
  address: '123 Main Street',
  zipCode: '10001',
  phone: '+1-555-0100'
}

const account2 = {
  accountNumber: 'ACC-67890',  // Different account number
  ssn: '123-45-6789',
  firstName: 'Robert',
  lastName: 'Johnson',
  dateOfBirth: '1975-08-22',
  address: '123 Main St',      // Slight variation
  zipCode: '10001',
  phone: '+1-555-0100'
}
// → SSN + Name + DOB + Location + Phone → Same person, consolidate accounts
```

## Summary

Each example demonstrates:
1. **Domain-specific weight assignment** based on field reliability and uniqueness
2. **Appropriate threshold selection** based on precision/recall requirements
3. **Field threshold usage** to filter low-quality contributions
4. **Blocking strategies** to improve performance
5. **Normalizers** to improve data quality

Adapt these patterns to your specific use case by:
- Analyzing your data characteristics
- Adjusting weights based on field importance in your domain
- Tuning thresholds based on your tolerance for false positives vs false negatives
- Using match explanations to iterate and improve

For detailed tuning guidance, see [Tuning Guide](tuning-guide.md).
