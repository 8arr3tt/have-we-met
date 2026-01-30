import type { Record } from '../../src'

/**
 * Person record type for testing.
 * Represents a typical person/customer entity.
 */
export interface Person {
  firstName: string
  lastName: string
  email: string
  phone?: string
  dateOfBirth?: Date
}

/**
 * Customer record type for testing.
 * Represents a business customer entity.
 */
export interface Customer {
  companyName: string
  contactName: string
  email: string
  phone?: string
  taxId?: string
  website?: string
}

/**
 * Creates a Person record with default values for testing.
 *
 * @param data - Partial person data (missing fields get defaults)
 * @param id - Record ID (defaults to random UUID)
 * @returns A complete Record<Person> with metadata
 *
 * @example
 * ```typescript
 * const person = createPersonRecord({
 *   firstName: 'Jane',
 *   email: 'jane@example.com'
 * })
 * ```
 */
export function createPersonRecord(
  data: Partial<Person>,
  id: string | number = crypto.randomUUID()
): Record<Person> {
  return {
    data: {
      firstName: data.firstName ?? 'John',
      lastName: data.lastName ?? 'Doe',
      email: data.email ?? 'john.doe@example.com',
      phone: data.phone,
      dateOfBirth: data.dateOfBirth,
    },
    metadata: {
      id,
      createdAt: new Date(),
    },
  }
}

/**
 * Creates a Customer record with default values for testing.
 *
 * @param data - Partial customer data (missing fields get defaults)
 * @param id - Record ID (defaults to random UUID)
 * @returns A complete Record<Customer> with metadata
 *
 * @example
 * ```typescript
 * const customer = createCustomerRecord({
 *   companyName: 'Acme Corp',
 *   email: 'contact@acme.com'
 * })
 * ```
 */
export function createCustomerRecord(
  data: Partial<Customer>,
  id: string | number = crypto.randomUUID()
): Record<Customer> {
  return {
    data: {
      companyName: data.companyName ?? 'Acme Corporation',
      contactName: data.contactName ?? 'John Smith',
      email: data.email ?? 'contact@acme.com',
      phone: data.phone,
      taxId: data.taxId,
      website: data.website,
    },
    metadata: {
      id,
      createdAt: new Date(),
    },
  }
}

/**
 * Creates multiple Person records at once for testing scenarios with multiple candidates.
 *
 * @param records - Array of partial person data
 * @returns Array of complete Record<Person> with sequential IDs
 *
 * @example
 * ```typescript
 * const people = createPersonRecords([
 *   { firstName: 'Jane', email: 'jane@example.com' },
 *   { firstName: 'John', email: 'john@example.com' }
 * ])
 * ```
 */
export function createPersonRecords(
  records: Partial<Person>[]
): Record<Person>[] {
  return records.map((data, index) => createPersonRecord(data, index + 1))
}

/**
 * Creates multiple Customer records at once for testing scenarios with multiple candidates.
 *
 * @param records - Array of partial customer data
 * @returns Array of complete Record<Customer> with sequential IDs
 *
 * @example
 * ```typescript
 * const customers = createCustomerRecords([
 *   { companyName: 'Acme Corp', email: 'contact@acme.com' },
 *   { companyName: 'Tech Inc', email: 'info@tech.com' }
 * ])
 * ```
 */
export function createCustomerRecords(
  records: Partial<Customer>[]
): Record<Customer>[] {
  return records.map((data, index) => createCustomerRecord(data, index + 1))
}
