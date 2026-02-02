# Examples

This directory contains practical, runnable examples demonstrating core features of have-we-met.

## Running the Examples

All examples use TypeScript and can be run directly with `tsx` or compiled with TypeScript.

### Prerequisites

```bash
# Install dependencies
npm install

# Install tsx for running TypeScript directly (optional)
npm install -g tsx
```

### Run an Example

```bash
# Using tsx (recommended for quick testing)
npx tsx examples/quick-start.ts

# Or compile and run with Node.js
npm run build
node dist/examples/quick-start.js
```

## Available Examples

### 1. quick-start.ts

**Basic in-memory identity resolution**

Demonstrates the core matching workflow without database integration:
- Schema definition
- Blocking configuration
- Weighted probabilistic matching
- Understanding match outcomes (definite-match, potential-match, no-match)
- Match explanations

**When to use this pattern:**
- Small datasets (< 10k records)
- Prototyping and testing configurations
- One-off batch processing

**Run it:**
```bash
npx tsx examples/quick-start.ts
```

---

### 2. batch-deduplication.ts

**Finding all duplicates in a dataset**

Shows how to deduplicate an entire dataset to identify all duplicate clusters:
- Batch processing with blocking strategies
- Identifying duplicate clusters
- Understanding blocking performance benefits
- Handling potential matches that need review

**When to use this pattern:**
- Initial data cleanup
- Migration from legacy systems
- Periodic deduplication jobs

**Run it:**
```bash
npx tsx examples/batch-deduplication.ts
```

---

### 3. database-integration.ts

**Working with database adapters**

Demonstrates database integration using Prisma (patterns apply to Drizzle and TypeORM):
- Checking for duplicates before inserting
- Batch deduplicating database tables
- Using blocking for efficient database queries
- Index optimization for blocking fields

**When to use this pattern:**
- Production systems with persistent storage
- Real-time duplicate detection at point of entry
- Large-scale data deduplication (100k+ records)

**Run it:**
```bash
npx tsx examples/database-integration.ts
```

**Note:** This example uses a mock adapter for demonstration. For production usage with real databases, see:
- [Prisma Adapter Guide](../docs/adapter-guides/prisma.md)
- [Drizzle Adapter Guide](../docs/adapter-guides/drizzle.md)
- [TypeORM Adapter Guide](../docs/adapter-guides/typeorm.md)

---

### 4. ml-matching.ts

**Machine learning-based matching**

Shows how to use ML models to improve matching accuracy:
- Hybrid mode (ML + probabilistic)
- ML-only mode
- Custom feature configuration
- Training custom models from review decisions

**When to use this pattern:**
- Complex matching scenarios where rules are hard to define
- Continuous improvement from human feedback
- Domain-specific matching patterns

**Run it:**
```bash
npx tsx examples/ml-matching.ts
```

**Learn more:**
- [ML Matching Overview](../docs/ml-matching/overview.md)
- [Getting Started Guide](../docs/ml-matching/getting-started.md)
- [Training Guide](../docs/ml-matching/training.md)

---

### 5. review-queue.ts

**Human-in-the-loop review workflow**

Demonstrates the review queue for handling ambiguous matches:
- Auto-queueing potential matches
- Reviewing and deciding on matches
- Confirming or rejecting matches
- Queue metrics and monitoring
- Queue maintenance and cleanup

**When to use this pattern:**
- Regulated industries (healthcare, finance)
- High-stakes matching where errors are costly
- Learning from human decisions to improve matching

**Run it:**
```bash
npx tsx examples/review-queue.ts
```

**Learn more:**
- [Review Queue Overview](../docs/review-queue.md)
- [Queue Workflows](../docs/queue-workflows.md)
- [Queue Metrics](../docs/queue-metrics.md)

---

## Additional Examples by Feature

### Blocking Strategies

Examples in the `blocking/` subdirectories:
- Standard blocking
- Sorted neighbourhood
- Composite blocking

See [Blocking Documentation](../docs/blocking/overview.md)

### Data Normalizers

Examples in the `normalizers/` subdirectory:
- Name normalization
- Email normalization
- Phone number formatting
- Address parsing
- Date parsing

See [Normalizers Documentation](../docs/normalizers/overview.md)

### External Services

Examples in the `external-services/` subdirectory:
- Validation services (NHS number, email, phone)
- Lookup services (address standardization, enrichment)
- Custom service plugins

See [External Services Documentation](../docs/external-services.md)

### Golden Record / Merge

Examples in the `golden-record/` subdirectory:
- Merge strategy configuration
- Provenance tracking
- Unmerge operations

See [Golden Record Documentation](../docs/golden-record.md)

### Database Adapters

Examples in the `database-adapters/` subdirectory:
- Prisma integration
- Drizzle integration
- TypeORM integration

See [Database Adapters Documentation](../docs/database-adapters.md)

---

## Example Data

All examples use synthetic data for demonstration purposes. The datasets include:

- **Person records**: Common fields like firstName, lastName, email, dateOfBirth
- **Customer records**: Business-focused fields including company, phone
- **Patient records**: Healthcare-specific fields like NHS number

For production usage, replace the sample data with your actual records.

---

## Troubleshooting

### TypeScript Errors

If you encounter TypeScript errors when running examples:

```bash
# Ensure types are built
npm run build

# Or use tsx with --tsconfig flag
npx tsx --tsconfig tsconfig.json examples/quick-start.ts
```

### Import Errors

Examples use imports from `../src/index.js` for development. In production, you would import from the npm package:

```typescript
// Development (these examples)
import { HaveWeMet } from '../src/index.js'

// Production
import { HaveWeMet } from 'have-we-met'
```

### Database Examples

The database examples use mock adapters. To use real databases:

1. Install your ORM: `npm install @prisma/client` (or drizzle-orm, typeorm)
2. Set up your database schema
3. Replace the mock adapter with the real adapter
4. Configure connection strings

See the adapter guides in `docs/adapter-guides/` for detailed setup instructions.

---

## Next Steps

After exploring the examples:

1. **Read the documentation**: Start with [PLAN.md](../PLAN.md) for project overview
2. **Configure for your use case**: See [Tuning Guide](../docs/tuning-guide.md)
3. **Set up database integration**: See [Database Adapters](../docs/database-adapters.md)
4. **Implement review workflow**: See [Review Queue Guide](../docs/review-queue.md)
5. **Optimize performance**: See [Performance Guide](../docs/database-performance.md)

---

## Contributing Examples

Have a use case example to share? Contributions are welcome!

1. Create a new `.ts` file in the appropriate subdirectory
2. Include detailed comments explaining the use case
3. Use realistic sample data
4. Follow the existing example structure
5. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
