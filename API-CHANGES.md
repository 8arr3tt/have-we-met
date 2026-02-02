# API Changes and Refinements

This document tracks API changes, deprecations, and refinements made during Phase 12 (Polish & Release).

## API Review Summary (Phase 12.3)

**Review Date:** 2026-02-02
**Status:** API Reviewed and Finalized
**Test Status:** ✅ All 4085 tests passing

---

## Public API Surface

### Core Entry Point

```typescript
import { HaveWeMet } from 'have-we-met'

// Main builder entry point
const resolver = HaveWeMet.create<T>()
  .schema(schema => { ... })
  .matching(match => { ... })
  .build()

// Alternative schema shortcut
const resolver = HaveWeMet.schema<T>({ ... })
  .matching(match => { ... })
  .build()
```

**Status:** ✅ Consistent and well-documented

---

## Resolver Builder API

### Builder Methods

All builder methods follow consistent patterns:
- **Fluent chaining**: All methods return `this` for chaining
- **Callback pattern**: Complex configurations use callback functions
- **Type safety**: Full TypeScript support with generic constraints

```typescript
ResolverBuilder<T>
  .schema(configurator)      // Configure field definitions and normalizers
  .blocking(configurator)    // Configure blocking strategies
  .matching(configurator)    // Configure field comparisons and weights
  .thresholds(config)        // Configure match/no-match thresholds
  .adapter(adapter)          // Configure database adapter
  .merge(configurator)       // Configure merge strategies
  .services(configurator)    // Configure external services
  .ml(configurator)          // Configure ML matching
  .build()                   // Build resolver instance
```

**Getter methods** for inspection:
- `getMergeConfig()` - Get merge configuration
- `getServicesConfig()` - Get services configuration
- `getMLConfig()` - Get ML configuration

**Status:** ✅ Consistent naming, fully chainable, well-documented

---

## Resolver Core Methods

### Match Resolution

```typescript
// In-memory matching
resolve(inputRecord, candidates, options?)
deduplicateBatch(records, options?)

// Database-backed matching
resolveWithDatabase(inputRecord, options?)
deduplicateBatchFromDatabase(options?)

// Service-enhanced matching
resolveWithServices(inputRecord, candidates, options?)
resolveWithDatabaseAndServices(inputRecord, options?)

// ML-enhanced matching
resolveWithML(inputRecord, candidates, options?)
resolveWithMLBatch(records, options?)
resolveMLOnly(inputRecord, candidates, options?)
```

**Status:** ✅ Clear naming conventions, consistent patterns

### Merge Operations

```typescript
// Find and merge duplicates
findAndMergeDuplicates(options?)

// Direct merge
merge(sourceRecords, options?)

// Queue-based merge
mergeFromQueue(queueItemId, decision, options?)

// Unmerge operations
unmerge(goldenRecordId, options?)
canUnmerge(goldenRecordId)
```

**Status:** ✅ Intuitive method names, consistent options pattern

### Service Operations

```typescript
getServiceHealthStatus()
getCircuitBreakerStatus(serviceName)
disposeServices()
```

**Status:** ✅ Clear and descriptive

### ML Operations

```typescript
ensureMLReady()
```

**Status:** ✅ Descriptive name

### Queue Access

```typescript
queue  // Property accessor for ReviewQueue instance
```

**Status:** ✅ Simple property access

---

## Type Definitions

### Core Types

**Record Types:**
- `Record<T>` - Record with data, id, and metadata
- `RecordId` - String record identifier
- `RecordMetadata` - Timestamp and source metadata
- `RecordPair` - Tuple of two records for comparison

**Match Types:**
- `MatchOutcome` - `'new' | 'match' | 'review'`
- `MatchResult<T>` - Complete match result with outcome and candidates
- `MatchCandidate<T>` - Single match candidate with score and explanation
- `MatchScore` - Aggregate score with field breakdown
- `MatchExplanation` - Human-readable match explanation
- `FieldComparison` - Single field comparison details

**Configuration Types:**
- `ThresholdConfig` - Match/no-match thresholds
- `MatchingStrategy` - String literal union of comparison algorithms
- `FieldMatchConfig` - Single field matching configuration
- `MatchingConfig` - Complete matching configuration
- `BlockingConfig<T>` - Blocking strategy configuration
- `ResolverConfig<T>` - Complete resolver configuration
- `ResolverOptions` - Runtime options for resolution

**Schema Types:**
- `FieldType` - Supported field types
- `FieldDefinition` - Field metadata and normalizer configuration
- `SchemaDefinition<T>` - Complete schema configuration

**Status:** ✅ Comprehensive, well-documented, follows TypeScript best practices

---

## Exported Modules

### Comparators

```typescript
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  soundexEncode,
  metaphone,
  metaphoneEncode,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming (camelCase for functions)

### Normalizers

```typescript
import {
  // Registry
  registerNormalizer,
  getNormalizer,
  listNormalizers,
  applyNormalizer,
  composeNormalizers,

  // Basic normalizers
  trim,
  lowercase,
  uppercase,
  normalizeWhitespace,
  alphanumericOnly,
  numericOnly,

  // Domain-specific normalizers
  normalizeName,
  parseNameComponents,
  normalizeEmail,
  isValidEmail,
  normalizePhone,
  isValidPhone,
  normalizeAddress,
  parseAddressComponents,
  normalizeDate,
  parseDateComponents,
  isValidDate,

  // Utilities
  abbreviateState,
  abbreviateStreetType,
  formatUKPostcode,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming (normalize* for transformers, parse* for parsers, is* for validators)

### Blocking

```typescript
import {
  // Core
  BlockGenerator,

  // Transforms
  applyTransform,
  firstLetter,
  firstN,
  soundexTransform,
  metaphoneTransform,
  yearTransform,

  // Strategies
  StandardBlockingStrategy,
  SortedNeighbourhoodStrategy,
  CompositeBlockingStrategy,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming (*Transform for transforms, *Strategy for strategies)

### Queue

```typescript
import {
  // Error classes
  QueueError,
  QueueItemNotFoundError,
  InvalidStatusTransitionError,
  QueueOperationError,
  QueueValidationError,

  // Validation
  validateQueueItem,
  validateStatusTransition,
  validateQueueDecision,
  validateCompleteQueueItem,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming (validate* for validators, *Error for errors)

### ML Matching

```typescript
import {
  // Model interface
  BaseMLModel,

  // Built-in models
  SimpleClassifier,
  createPersonMatchingClassifier,
  createClassifierFromFields,
  createPretrainedClassifier,
  pretrainedWeights,

  // Feature extraction
  FeatureExtractor,
  FeatureExtractionConfigBuilder,
  featureConfig,
  builtInExtractors,

  // Training
  ModelTrainer,
  createTrainingExample,
  createTrainingDataset,

  // Integration
  MLMatchIntegrator,
  createMLIntegrator,
  isMLMatchResult,

  // Builder
  MLBuilder,
  FieldFeatureBuilder,
  mlBuilder,
  createModelFromConfig,
  validateMLBuilderConfig,

  // Utilities
  createPrediction,
  createFeatureVector,
  createFeatureImportance,

  // Constants
  DEFAULT_ML_MODEL_CONFIG,
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_FEATURE_EXTRACTION_CONFIG,
  DEFAULT_ML_INTEGRATION_CONFIG,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming (create* for factories, is* for type guards, DEFAULT_* for constants)

### Merge

```typescript
import {
  // Builder
  MergeBuilder,
  FieldMergeBuilder,
  MergeBuilderError,
  createMergeBuilder,
} from 'have-we-met'
```

**Status:** ✅ Consistent naming

---

## Naming Conventions Summary

The library follows consistent naming conventions across all modules:

1. **Classes**: PascalCase (e.g., `MatchingEngine`, `ScoreCalculator`)
2. **Functions**: camelCase (e.g., `exactMatch`, `registerNormalizer`)
3. **Factory functions**: `create*` prefix (e.g., `createMLIntegrator`)
4. **Validators**: `validate*` prefix or `is*` prefix for type guards
5. **Parsers**: `parse*` prefix (e.g., `parseNameComponents`)
6. **Transformers**: `normalize*` prefix or `*Transform` suffix
7. **Strategies**: `*Strategy` suffix (e.g., `StandardBlockingStrategy`)
8. **Builders**: `*Builder` suffix (e.g., `SchemaBuilder`)
9. **Error classes**: `*Error` suffix (e.g., `QueueError`)
10. **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_ML_MODEL_CONFIG`)
11. **Types/Interfaces**: PascalCase (e.g., `MatchResult`, `ResolverConfig`)

**Status:** ✅ Consistent across entire codebase

---

## TypeScript Type Safety

### Generic Constraints

All generic types properly constrained:
- `T extends Record<string, unknown>` for record types
- `T extends object` for match candidate types

### Type Exports

Both type and value exports properly distinguished:
- `export type { ... }` for types
- `export { ... }` for values

**Status:** ✅ Full TypeScript support with accurate types

---

## JSDoc Documentation

### Coverage

- ✅ All public API classes have class-level JSDoc
- ✅ All public methods have method-level JSDoc
- ✅ All JSDoc includes `@param` and `@returns` tags
- ✅ Most JSDoc includes `@example` blocks
- ✅ All types have descriptive comments

### Quality

- ✅ Examples use realistic scenarios
- ✅ Parameters clearly described
- ✅ Return values clearly described
- ✅ Error conditions documented where relevant

**Status:** ✅ Comprehensive JSDoc coverage

---

## Breaking Changes from Early Development

### None Identified

No breaking changes were made during Phase 12. The API has remained stable since Phase 11.

**Previous phase changes** were documented in their respective phase-*-plan.md files.

---

## Deprecations

### None

No deprecated APIs exist in the codebase. All features are fully supported.

---

## API Refinements Made in Phase 12.3

### 1. Validation Enhancement (Ticket 12.2)

**Added:** Central error utilities and input validation to all builder methods

**Files Modified:**
- `src/utils/errors.ts` - Created central error hierarchy
- `src/builder/*.ts` - Added input validation
- `tests/edge-cases/` - Added comprehensive edge case tests

**Impact:** More descriptive error messages, consistent error handling

### 2. Type Safety Improvements (Ticket 12.3)

**Fixed:** Removed invalid type values from builder validation arrays

**Changes:**
- Removed `'boolean'` from `FieldType` validation array in `schema-builder.ts`
- Removed `'custom'` from `MatchingStrategy` validation array in `matching-builder.ts`
- Removed unused imports from `blocking-builder.ts`

**Impact:** Full TypeScript type safety restored, build succeeds without type errors

---

## Recommendations for Future Versions

### Post-v1.0 Considerations

1. **Adapter exports**: Consider exposing adapters via named exports (e.g., `import { prismaAdapter } from 'have-we-met/adapters'`)

2. **Service plugins**: Consider plugin registry for community-contributed services

3. **ML models**: Consider model registry for community-contributed models

4. **Validation**: Consider schema validation using Zod or similar library

5. **Async iterators**: Consider streaming API for very large batch operations

**Status:** Noted for future releases, not blocking v1.0

---

## Conclusion

The public API is **production-ready** with:
- ✅ Consistent naming conventions throughout
- ✅ Full TypeScript type safety
- ✅ Comprehensive JSDoc documentation
- ✅ No deprecated or experimental APIs
- ✅ All 4085 tests passing
- ✅ Clear, intuitive method names
- ✅ Fluent, chainable builder API
- ✅ Well-organized exports

**No breaking changes required before v1.0 release.**

---

**Last Updated:** 2026-02-02
**Reviewed By:** Claude (Phase 12.3)
**Status:** ✅ Complete
