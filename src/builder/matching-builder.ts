import type {
  FieldMatchConfig,
  MatchingConfig,
  MatchingStrategy,
  ThresholdConfig,
} from '../types'
import type {
  LevenshteinOptions,
  JaroWinklerOptions,
  SoundexOptions,
  MetaphoneOptions,
} from '../core/comparators'

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

  /**
   * Sets options for the Levenshtein distance strategy.
   *
   * @param options - Levenshtein-specific options
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .field('address')
   *   .strategy('levenshtein')
   *   .levenshteinOptions({ caseSensitive: false, normalizeWhitespace: true })
   *   .weight(10)
   * ```
   */
  levenshteinOptions(options: LevenshteinOptions): this {
    this.config.levenshteinOptions = options
    return this
  }

  /**
   * Sets options for the Jaro-Winkler similarity strategy.
   *
   * @param options - Jaro-Winkler-specific options
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .field('firstName')
   *   .strategy('jaro-winkler')
   *   .jaroWinklerOptions({ prefixScale: 0.1, maxPrefixLength: 4 })
   *   .weight(15)
   *   .threshold(0.85)
   * ```
   */
  jaroWinklerOptions(options: JaroWinklerOptions): this {
    this.config.jaroWinklerOptions = options
    return this
  }

  /**
   * Sets options for the Soundex phonetic encoding strategy.
   *
   * @param options - Soundex-specific options
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .field('lastName')
   *   .strategy('soundex')
   *   .soundexOptions({ nullMatchesNull: true })
   *   .weight(8)
   * ```
   */
  soundexOptions(options: SoundexOptions): this {
    this.config.soundexOptions = options
    return this
  }

  /**
   * Sets options for the Metaphone phonetic encoding strategy.
   *
   * @param options - Metaphone-specific options
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .field('lastName')
   *   .strategy('metaphone')
   *   .metaphoneOptions({ maxLength: 6 })
   *   .weight(8)
   * ```
   */
  metaphoneOptions(options: MetaphoneOptions): this {
    this.config.metaphoneOptions = options
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
