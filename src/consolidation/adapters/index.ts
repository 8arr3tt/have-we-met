/**
 * Multi-table database adapters for consolidation workflows
 *
 * @module consolidation/adapters
 */

export {
  MultiTableAdapter,
  createMultiTableAdapter,
  type SourceTableConfig,
  type SourceMappingConfig,
  type SourceMappingRecord,
  type LoadOptions,
  type WriteGoldenRecordsOptions,
  type WriteGoldenRecordsResult,
} from './multi-table-adapter.js'

export {
  PrismaMultiTableAdapter,
  createPrismaMultiTableAdapter,
  prismaMultiTableAdapterFromSources,
  type PrismaClient,
  type PrismaMultiTableAdapterConfig,
  type MatchGroup,
} from './prisma-multi-table-adapter.js'
