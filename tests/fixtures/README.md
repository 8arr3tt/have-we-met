# Test Fixtures

This directory contains reusable test data and helper functions for creating test records.

## Purpose

Test fixtures provide:

- Consistent test data across unit and integration tests
- Helper functions to reduce boilerplate in tests
- Type-safe record creation with sensible defaults

## Available Fixtures

### Person

Represents a typical person/customer entity with fields:

- `firstName`, `lastName`, `email` (required)
- `phone`, `dateOfBirth` (optional)

### Customer

Represents a business customer entity with fields:

- `companyName`, `contactName`, `email` (required)
- `phone`, `taxId`, `website` (optional)

## Usage

```typescript
import { createPersonRecord, createCustomerRecord } from '../fixtures'

// Create a person with defaults
const person = createPersonRecord({
  firstName: 'Jane',
  email: 'jane@example.com',
})

// Create multiple records
const people = createPersonRecords([
  { firstName: 'Alice', email: 'alice@example.com' },
  { firstName: 'Bob', email: 'bob@example.com' },
])
```

## Guidelines

- Keep fixtures generic and reusable
- Provide sensible defaults for all required fields
- Use consistent ID patterns (sequential numbers or UUIDs)
- Document any field-specific behavior
