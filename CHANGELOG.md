# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-02

### Added

#### Core Functionality
- **Fluent Builder API**: Declarative configuration with full type inference
- **Three Matching Paradigms**:
  - Deterministic matching (exact field combinations)
  - Probabilistic matching (Fellegi-Sunter weighted scoring)
  - ML-based matching (pre-trained models + custom model support)
- **String Similarity Algorithms**: Levenshtein, Jaro-Winkler, Soundex, Metaphone
- **Blocking Strategies**: Standard blocking, sorted neighbourhood, composite blocking
- **Three-Tier Match Outcomes**: No Match, Definite Match, Potential Match

#### Data Preparation
- **6 Built-in Normalizers**: Name, email, phone, address, date, plus basic utilities
- **Custom Normalizer Support**: Register domain-specific transformers
- **International Phone Support**: via libphonenumber-js
- **Address Parsing**: US/Canada support with component extraction

#### Database Integration
- **3 ORM Adapters**: Prisma, Drizzle, TypeORM
- **Storage-Agnostic Interface**: DatabaseAdapter interface for custom implementations
- **Query Optimization**: IndexAnalyzer and QueryProfiler utilities
- **Transaction Support**: Atomic merge operations

#### Human Review Workflow
- **Review Queue System**: Manage potential matches requiring human judgment
- **Queue Operations**: Add, list, get, confirm, reject, merge, delete, cleanup
- **Metrics and Reporting**: Throughput, wait times, reviewer stats, aging reports
- **Auto-Queueing**: Fire-and-forget integration with resolver

#### Golden Record Management
- **14 Built-in Merge Strategies**: preferFirst, preferLast, preferNewer, preferOlder, preferNonNull, preferLonger, preferShorter, concatenate, union, mostFrequent, average, sum, min, max
- **Provenance Tracking**: Field-level attribution of source records
- **Unmerge Capability**: Full restoration of original records
- **Custom Merge Strategies**: User-defined merge logic

#### External Services
- **5 Built-in Validators**: NHS number, email, phone, SSN, NINO
- **4 Built-in Lookup Services**: Address enrichment, email enrichment, phone carrier lookup, mock services
- **Resilience Patterns**: Timeout, retry with exponential backoff, circuit breaker
- **Service Caching**: LRU cache with configurable TTL

#### Machine Learning
- **SimpleClassifier Model**: Logistic regression with L2 regularization
- **Pre-trained Weights**: Person/customer matching model (>85% accuracy)
- **8 Feature Extractors**: exactMatch, similarity, lengthDifference, missingField, fieldPresence, normalizedLength, numericDifference, dateProximity
- **Model Trainer**: Gradient descent with early stopping and validation split
- **Feedback Loop**: FeedbackCollector learns from human review decisions
- **Three Integration Modes**: hybrid, mlOnly, fallback

#### Benchmarks and Documentation
- **Benchmark Infrastructure**: Dataset loader, metrics collector, report generator
- **Standard Datasets**: Febrl, Fodors-Zagat restaurant benchmarks
- **Scalability Tests**: 10k, 100k, 1M record tests
- **API Reference**: Complete documentation for all public APIs
- **Use Case Guides**: Customer deduplication, patient matching, real-time lookup, batch migration
- **Tuning Guides**: Threshold optimization, blocking optimization, performance optimization
- **Algorithm Selection Guide**: Decision tree for choosing algorithms

#### Performance
- **Real-time Matching**: <100ms for single record matching
- **Batch Processing**: 100k records in <60s
- **Memory Efficient**: <1GB for 100k record batch operations
- **Fast ML Predictions**: <10ms per prediction
- **Optimized Blocking**: Block generation in <100ms for 100k records

#### Quality and Testing
- **4085+ Tests**: Comprehensive test coverage across all modules
- **96%+ Code Coverage**: High test coverage maintained throughout
- **Edge Case Testing**: Null handling, empty inputs, extreme values
- **Performance Regression Tests**: Automated performance monitoring
- **TypeScript**: Full type safety with strict mode

### Known Limitations

- **Address Parsing**: Currently supports US/Canada only; international support planned for future releases
- **Name Handling**: Optimized for English names; multi-language name support planned
- **Phonetic Algorithms**: Soundex and Metaphone are English-only
- **ML Models**: SimpleClassifier included; advanced models (neural networks) planned for future releases

### Dependencies

- **Runtime**: libphonenumber-js (phone number parsing)
- **Peer Dependencies**: None (optional adapters work with Prisma, Drizzle, TypeORM if installed)
- **Node.js**: Requires Node.js 18 or higher

### Breaking Changes

This is the initial release, so no breaking changes from previous versions.

[0.1.0]: https://github.com/8arr3tt/have-we-met/releases/tag/v0.1.0
