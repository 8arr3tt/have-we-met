import type { DatabaseAdapter, AdapterConfig } from '../types'
import { DrizzleAdapter } from './drizzle-adapter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDatabase = any
type DrizzleTable = Record<string, { name: string }>
type DrizzleOperators = {
  eq: (column: unknown, value: unknown) => unknown
  ne: (column: unknown, value: unknown) => unknown
  gt: (column: unknown, value: unknown) => unknown
  gte: (column: unknown, value: unknown) => unknown
  lt: (column: unknown, value: unknown) => unknown
  lte: (column: unknown, value: unknown) => unknown
  inArray: (column: unknown, values: unknown[]) => unknown
  arrayContains: (column: unknown, values: unknown[]) => unknown
  like: (column: unknown, pattern: unknown) => unknown
  and: (...conditions: unknown[]) => unknown
  asc: (column: unknown) => unknown
  desc: (column: unknown) => unknown
  count: () => unknown
}

/**
 * Creates a Drizzle database adapter.
 *
 * @param db - Drizzle database instance
 * @param table - Drizzle table schema
 * @param config - Adapter configuration
 * @param operators - Drizzle operators (eq, ne, gt, gte, lt, lte, inArray, like, and, asc, desc, count)
 * @returns Configured Drizzle adapter
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/postgres-js'
 * import { eq, ne, gt, gte, lt, lte, inArray, like, and, asc, desc, count } from 'drizzle-orm'
 * import postgres from 'postgres'
 * import { customersTable } from './schema'
 *
 * const client = postgres(connectionString)
 * const db = drizzle(client)
 *
 * const adapter = drizzleAdapter(
 *   db,
 *   customersTable,
 *   { tableName: 'customers' },
 *   { eq, ne, gt, gte, lt, lte, inArray, like, and, asc, desc, count }
 * )
 *
 * const records = await adapter.findByBlockingKeys(
 *   new Map([['lastName', 'Smith']])
 * )
 * ```
 */
export function drizzleAdapter<T extends Record<string, unknown>>(
  db: DrizzleDatabase,
  table: DrizzleTable,
  config: AdapterConfig,
  operators: DrizzleOperators
): DatabaseAdapter<T> {
  return new DrizzleAdapter<T>(db, table, config, operators)
}

export { DrizzleAdapter }
export { DrizzleQueueAdapter } from './drizzle-queue-adapter'
export {
  DrizzleMergeAdapter,
  DrizzleProvenanceAdapter,
  createDrizzleMergeAdapter,
  createDrizzleProvenanceAdapter,
} from './drizzle-merge-adapter'
