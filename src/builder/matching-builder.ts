import type {
  FieldMatchConfig,
  MatchingConfig,
  MatchingStrategy,
  ThresholdConfig,
} from '../types'

export class FieldMatchBuilder {
  private config: FieldMatchConfig = {
    strategy: 'exact',
    weight: 1,
  }

  constructor(
    private parent: MatchingBuilder,
    private fieldName: string
  ) {}

  strategy(strategy: MatchingStrategy): this {
    this.config.strategy = strategy
    return this
  }

  weight(weight: number): this {
    this.config.weight = weight
    return this
  }

  threshold(threshold: number): this {
    this.config.threshold = threshold
    return this
  }

  caseSensitive(caseSensitive: boolean): this {
    this.config.caseSensitive = caseSensitive
    return this
  }

  field(name: string): FieldMatchBuilder {
    this.parent.setFieldConfig(this.fieldName, this.config)
    return this.parent.field(name)
  }

  thresholds(config: ThresholdConfig): MatchingBuilder {
    this.parent.setFieldConfig(this.fieldName, this.config)
    return this.parent.thresholds(config)
  }

  build(): MatchingConfig {
    this.parent.setFieldConfig(this.fieldName, this.config)
    return this.parent.build()
  }

  getConfig(): FieldMatchConfig {
    return this.config
  }
}

export class MatchingBuilder {
  private fields = new Map<string, FieldMatchConfig>()
  private thresholdConfig: ThresholdConfig = {
    noMatch: 20,
    definiteMatch: 80,
  }

  field(name: string): FieldMatchBuilder {
    return new FieldMatchBuilder(this, name)
  }

  setFieldConfig(name: string, config: FieldMatchConfig): void {
    this.fields.set(name, config)
  }

  thresholds(config: ThresholdConfig): this {
    this.thresholdConfig = config
    return this
  }

  build(): MatchingConfig {
    return {
      fields: new Map(this.fields),
      thresholds: { ...this.thresholdConfig },
    }
  }
}
