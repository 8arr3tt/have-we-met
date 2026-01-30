# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Principles

- **Document as we go**: Write and maintain documentation as we build, not afterwards.
- **No unnecessary comments**: Write self-explanatory code. Comments add clutter when the code speaks for itself.

## Project Overview

**have-we-met** is an identity resolution library for Node.js that helps match, deduplicate, and merge records across datasets. It supports deterministic, probabilistic, and ML-based matching paradigms.

## Commands

```bash
npm run build        # Build with tsup (outputs ESM + CJS to dist/)
npm run dev          # Watch mode for development
npm run test         # Run tests with vitest
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run lint         # ESLint + TypeScript type checking
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
```

## Architecture

The library uses a fluent builder API pattern for configuration:

```typescript
const resolver = HaveWeMet
  .schema({ /* field definitions */ })
  .blocking(block => /* blocking strategies */)
  .matching(match => /* field comparisons and weights */)
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .adapter(prismaAdapter(prisma))
  .build()
```

### Planned Code Structure

```
src/
├── index.ts          # Main entry point, public API exports
├── types/            # Core type definitions (Record, MatchResult, Config, Schema)
├── core/             # Matching engine and comparators
├── builder/          # Fluent builder API implementation
└── utils/            # Shared utilities
```

### Key Concepts

- **Three-tier outcomes**: No Match, Definite Match, Potential Match (for human review)
- **Blocking strategies**: Reduce O(n²) comparisons by grouping records
- **String similarity**: Levenshtein, Jaro-Winkler, Soundex, Metaphone algorithms
- **Database adapters**: Storage-agnostic with Prisma/Drizzle/TypeORM support planned

## Git Commits

- Prefix with change type: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Do not include ticket numbers in commit messages
- Do not add Co-Authored-By lines
- Keep commit messages concise

## Development Status

Currently in Phase 1 (Foundation). See PLAN.md for the full 12-phase roadmap.
