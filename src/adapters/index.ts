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

export type {
  MergeAdapter,
  ProvenanceAdapter,
  ArchivedRecord,
  UnmergeInfo,
  MergeAdapterConfig,
  DatabaseAdapterWithMerge,
} from './merge-adapter'

export {
  DEFAULT_MERGE_ADAPTER_CONFIG,
  toArchivedRecords,
  toSourceRecords,
} from './merge-adapter'

export {
  AdapterError,
  ConnectionError,
  QueryError,
  TransactionError,
  ValidationError,
  NotFoundError,
} from './adapter-error'

export { BaseAdapter } from './base-adapter'

export {
  PrismaAdapter,
  prismaAdapter,
  PrismaMergeAdapter,
  PrismaProvenanceAdapter,
  createPrismaMergeAdapter,
  createPrismaProvenanceAdapter,
} from './prisma'

export {
  DrizzleAdapter,
  drizzleAdapter,
  DrizzleMergeAdapter,
  DrizzleProvenanceAdapter,
  createDrizzleMergeAdapter,
  createDrizzleProvenanceAdapter,
} from './drizzle'

export {
  TypeORMAdapter,
  typeormAdapter,
  TypeORMMergeAdapter,
  TypeORMProvenanceAdapter,
  createTypeORMMergeAdapter,
  createTypeORMProvenanceAdapter,
} from './typeorm'

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
