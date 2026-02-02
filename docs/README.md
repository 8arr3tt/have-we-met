# have-we-met Documentation

Welcome to the have-we-met documentation. This library provides identity resolution capabilities for Node.js, helping you match, deduplicate, and merge records across datasets.

## Getting Started

New to have-we-met? Start here:

1. **[Examples](./examples.md)** - Complete, real-world configuration examples
2. **[Tuning Guide](./tuning-guide.md)** - Learn to tune weights and thresholds for your use case
3. **[API Reference](./api/index.md)** - Comprehensive API documentation

## Core Concepts

### Matching Approaches

| Approach | Description | When to Use |
|----------|-------------|-------------|
| [Probabilistic Matching](./probabilistic-matching.md) | Score-based matching with configurable weights and thresholds | Most use cases; offers transparency and fine-grained control |
| [ML Matching](./ml-matching/overview.md) | Machine learning-enhanced matching | When you have training data or need to learn complex patterns |

### Key Components

- **[Blocking Strategies](./blocking/overview.md)** - Reduce comparison space for large datasets (essential for 10k+ records)
- **[Normalizers](./normalizers/overview.md)** - Standardize data before comparison for better matching
- **[Algorithms](./algorithms/comparison.md)** - String similarity algorithms and when to use them
- **[Database Adapters](./database-adapters.md)** - Connect to Prisma, Drizzle, or TypeORM

## Multi-Source Consolidation

Match and merge records from multiple databases with different schemas:

- **[Overview](./consolidation/overview.md)** - Architecture, use cases, and key concepts
- **[Getting Started](./consolidation/getting-started.md)** - Quick start guide with examples
- **[Schema Mapping](./consolidation/schema-mapping.md)** - Field mapping and transformations
- **[Conflict Resolution](./consolidation/conflict-resolution.md)** - Source priority and merge strategies
- **[Matching Scopes](./consolidation/matching-scopes.md)** - Within-source-first vs unified pool
- **[ETL Workflow](./consolidation/etl-workflow.md)** - Production ETL patterns and optimization
- **[API Reference](./api-reference/consolidation-builder.md)** - ConsolidationBuilder API

## Use Case Guides

Practical guides for common identity resolution scenarios:

- **[Customer Deduplication](./use-cases/customer-deduplication.md)** - E-commerce and CRM deduplication
- **[Patient Matching](./use-cases/patient-matching.md)** - Healthcare record matching with HIPAA considerations
- **[Real-time Lookup](./use-cases/real-time-lookup.md)** - Point-of-entry matching with low latency
- **[Batch Migration](./use-cases/batch-migration.md)** - Large-scale data migration and consolidation

## API Reference

Complete reference for all public interfaces:

- **[Schema Builder](./api/schema-builder.md)** - Define record schemas and field types
- **[Matching Builder](./api/matching-builder.md)** - Configure field comparisons and weights
- **[Blocking Builder](./api/blocking-builder.md)** - Set up blocking strategies
- **[Resolver](./api/resolver.md)** - Core matching and resolution operations
- **[Adapters](./api/adapters.md)** - Database adapter configuration

## Advanced Topics

### Configuration & Tuning

- **[Threshold Optimization](./tuning/threshold-optimization.md)** - Optimize thresholds with benchmark data
- **[Blocking Optimization](./tuning/blocking-optimization.md)** - Select and tune blocking strategies
- **[Performance Optimization](./tuning/performance-optimization.md)** - Memory, CPU, and throughput tuning

### Features

- **[Review Queue](./review-queue.md)** - Human-in-the-loop workflow for potential matches
- **[Golden Record](./golden-record.md)** - Merge strategies for creating master records
- **[Merge Strategies](./merge-strategies.md)** - Configure how fields are merged
- **[Unmerge](./unmerge.md)** - Undo incorrect merges
- **[Provenance](./provenance.md)** - Track data lineage and source attribution

### ML Matching

- **[Overview](./ml-matching/overview.md)** - When and why to use ML matching
- **[Getting Started](./ml-matching/getting-started.md)** - Quick start with pre-trained models
- **[Feature Extraction](./ml-matching/feature-extraction.md)** - Configure feature extractors
- **[Custom Models](./ml-matching/custom-models.md)** - Train domain-specific models
- **[Training Guide](./ml-matching/training.md)** - Best practices for model training
- **[Feedback Loop](./ml-matching/feedback-loop.md)** - Learn from human decisions

### Database Integration

- **[Database Adapters](./database-adapters.md)** - Overview of adapter system
- **[Prisma Guide](./adapter-guides/prisma.md)** - Prisma ORM integration
- **[Drizzle Guide](./adapter-guides/drizzle.md)** - Drizzle ORM integration
- **[TypeORM Guide](./adapter-guides/typeorm.md)** - TypeORM integration
- **[Database Performance](./database-performance.md)** - Query optimization and indexing

### Operational

- **[Queue Workflows](./queue-workflows.md)** - Review queue workflow patterns
- **[Queue Metrics](./queue-metrics.md)** - Monitoring queue performance
- **[Queue UI Guide](./queue-ui-guide.md)** - Building review interfaces
- **[Service Plugins](./service-plugins.md)** - Extend with custom services
- **[Service Resilience](./service-resilience.md)** - Handle service failures gracefully
- **[Migration Guide](./migration-guide.md)** - Upgrade between versions

## Reference

### Blocking

- **[Strategies Guide](./blocking/strategies.md)** - Detailed strategy documentation
- **[Selection Guide](./blocking/selection-guide.md)** - Choose the right strategy
- **[Transforms](./blocking/transforms.md)** - Block key transforms reference
- **[Tuning](./blocking/tuning.md)** - Optimize blocking performance

### Normalizers

- **[Name Normalizer](./normalizers/name.md)** - Personal name standardization
- **[Email Normalizer](./normalizers/email.md)** - Email address normalization
- **[Phone Normalizer](./normalizers/phone.md)** - Phone number formatting (E.164)
- **[Address Normalizer](./normalizers/address.md)** - Physical address parsing
- **[Date Normalizer](./normalizers/date.md)** - Date format standardization
- **[Custom Normalizers](./normalizers/custom.md)** - Build your own normalizers
- **[Performance](./normalizers/performance.md)** - Normalizer performance characteristics
- **[UK Address Support](./normalizers/uk-address-support.md)** - UK-specific address handling

### Algorithms

- **[Algorithm Comparison](./algorithms/comparison.md)** - Side-by-side algorithm benchmarks
- **[Selection Flowchart](./algorithms/selection-flowchart.md)** - Decision guide for algorithm selection
- **[String Similarity](./algorithms/string-similarity.md)** - Algorithm details and examples

### Services

- **[Built-in Services](./built-in-services.md)** - Services included with the library
- **[External Services](./external-services.md)** - Third-party service integration

## Benchmarks

Performance benchmarks and results:

- **[Benchmark Results](../benchmarks/BENCHMARK-RESULTS.md)** - Comprehensive benchmark summary
- **[Scalability Results](../benchmarks/results/scalability-results.md)** - Performance at scale

## Quick Links

| Task | Documentation |
|------|---------------|
| Getting started | [Examples](./examples.md) |
| Configure matching | [Matching Builder](./api/matching-builder.md) |
| Tune thresholds | [Tuning Guide](./tuning-guide.md) |
| Scale to large datasets | [Blocking Overview](./blocking/overview.md) |
| Use machine learning | [ML Matching Overview](./ml-matching/overview.md) |
| Connect a database | [Database Adapters](./database-adapters.md) |
| Review potential matches | [Review Queue](./review-queue.md) |
| Consolidate multiple sources | [Consolidation Overview](./consolidation/overview.md) |

## Support

- [GitHub Issues](https://github.com/8arr3tt/have-we-met/issues) - Report bugs and request features
- [CLAUDE.md](../CLAUDE.md) - Project conventions and guidelines
