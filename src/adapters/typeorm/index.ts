import type { DatabaseAdapter, AdapterConfig } from '../types'
import { TypeORMAdapter } from './typeorm-adapter'

type EntityManager = {
  getRepository: <T>(target: unknown) => Repository<T>
}

type Repository<T> = {
  find: (options?: unknown) => Promise<T[]>
  findOne: (options?: unknown) => Promise<T | null>
  count: (options?: unknown) => Promise<number>
  save: (entity: unknown) => Promise<T>
  update: (criteria: unknown, partialEntity: unknown) => Promise<unknown>
  delete: (criteria: unknown) => Promise<unknown>
  insert: (entities: unknown) => Promise<unknown>
  manager: {
    connection: {
      transaction: <R>(
        callback: (manager: EntityManager) => Promise<R>
      ) => Promise<R>
    }
  }
}

export { TypeORMAdapter }
export { TypeORMQueueAdapter } from './typeorm-queue-adapter'
export {
  TypeORMMergeAdapter,
  TypeORMProvenanceAdapter,
  createTypeORMMergeAdapter,
  createTypeORMProvenanceAdapter,
} from './typeorm-merge-adapter'

export function typeormAdapter<T extends Record<string, unknown>>(
  repository: Repository<T>,
  config: AdapterConfig,
  entityTarget?: unknown
): DatabaseAdapter<T> {
  return new TypeORMAdapter<T>(repository, config, entityTarget)
}
