import type { DatabaseAdapter, AdapterConfig } from '../types'
import { PrismaAdapter } from './prisma-adapter'

type PrismaClient = {
  $transaction: <R>(callback: (tx: PrismaClient) => Promise<R>) => Promise<R>
} & Record<string, Record<string, CallableFunction>>

/**
 * Creates a Prisma database adapter.
 * This factory function provides a convenient way to create a configured Prisma adapter.
 *
 * @typeParam T - The record type being stored and queried
 * @param prismaClient - Prisma client instance
 * @param config - Adapter configuration
 * @returns Configured Prisma adapter
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client'
 * import { prismaAdapter } from 'have-we-met/adapters/prisma'
 *
 * const prisma = new PrismaClient()
 * const adapter = prismaAdapter(prisma, {
 *   tableName: 'customers',
 *   primaryKey: 'id',
 *   fieldMapping: {
 *     firstName: 'first_name',
 *     lastName: 'last_name'
 *   }
 * })
 *
 * const records = await adapter.findByBlockingKeys(
 *   new Map([['lastName', 'Smith']])
 * )
 * ```
 */
export function prismaAdapter<T extends Record<string, unknown>>(
  prismaClient: PrismaClient,
  config: AdapterConfig
): DatabaseAdapter<T> {
  return new PrismaAdapter<T>(prismaClient, config)
}

export { PrismaAdapter }
