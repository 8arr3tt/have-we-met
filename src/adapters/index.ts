export type {
  DatabaseAdapter,
  QueryOptions,
  FilterCriteria,
  AdapterConfig,
  AdapterFactory,
  DatabaseResolveOptions,
  DatabaseDeduplicationOptions,
  DeduplicationBatchResult,
  MergeOptions,
  MergeResult,
} from './types'

export {
  AdapterError,
  ConnectionError,
  QueryError,
  TransactionError,
  ValidationError,
  NotFoundError,
} from './adapter-error'

export { BaseAdapter } from './base-adapter'

export { PrismaAdapter, prismaAdapter } from './prisma'

export { DrizzleAdapter, drizzleAdapter } from './drizzle'

export { TypeORMAdapter, typeormAdapter } from './typeorm'

export { IndexAnalyzer, QueryProfiler } from './performance'
export type {
  DatabaseDialect,
  SchemaField,
  QueryPattern,
  IndexSuggestion,
  QueryStats,
  QueryPlan,
  ProfileResult,
} from './performance'
