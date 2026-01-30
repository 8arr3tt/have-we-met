import type {
  SchemaDefinition,
  MatchingConfig,
  ThresholdConfig,
} from '../types'
import { Resolver } from '../core/resolver'
import { SchemaBuilder } from './schema-builder'
import { MatchingBuilder } from './matching-builder'

export class ResolverBuilder<T extends object = object> {
  private schemaDefinition?: SchemaDefinition<T>
  private matchingConfig?: MatchingConfig

  schema(
    configurator: (builder: SchemaBuilder<T>) => SchemaBuilder<T> | void
  ): this {
    const builder = new SchemaBuilder<T>()
    const result = configurator(builder)
    this.schemaDefinition = (result ?? builder).build()
    return this
  }

  matching(
    configurator: (builder: MatchingBuilder) => MatchingBuilder | void
  ): this {
    const builder = new MatchingBuilder()
    const result = configurator(builder)
    this.matchingConfig = (result ?? builder).build()
    return this
  }

  thresholds(config: ThresholdConfig): this {
    if (!this.matchingConfig) {
      this.matchingConfig = {
        fields: new Map(),
        thresholds: config,
      }
    } else {
      this.matchingConfig.thresholds = config
    }
    return this
  }

  build(): Resolver<T> {
    if (!this.schemaDefinition) {
      throw new Error('Schema must be configured before building')
    }
    if (!this.matchingConfig) {
      throw new Error('Matching must be configured before building')
    }

    return new Resolver<T>({
      schema: this.schemaDefinition,
      matching: this.matchingConfig,
    })
  }
}

export const HaveWeMet = {
  create<T extends object = object>(): ResolverBuilder<T> {
    return new ResolverBuilder<T>()
  },
}
