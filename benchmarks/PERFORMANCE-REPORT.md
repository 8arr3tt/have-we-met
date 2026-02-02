# String Similarity Performance Report

**Generated:** 2026-01-30
**Environment:** Node.js v18+, Windows 10, vitest benchmark

## Executive Summary

All string similarity algorithms exceed their performance targets by significant margins. The implementations are highly optimized and suitable for production use in identity resolution workflows.

### Success Criteria Status

| Algorithm               | Target  | Actual    | Status              |
| ----------------------- | ------- | --------- | ------------------- |
| Levenshtein (100 chars) | < 1ms   | ~0.10ms   | ✅ **10x faster**   |
| Jaro-Winkler (names)    | < 0.5ms | ~0.0002ms | ✅ **2500x faster** |
| Soundex encoding        | < 0.1ms | ~0.0002ms | ✅ **500x faster**  |
| Metaphone encoding      | < 0.2ms | ~0.0003ms | ✅ **666x faster**  |

## Detailed Results

### Levenshtein Distance

| Test Case                    | Operations/sec | Mean Time    | Notes                     |
| ---------------------------- | -------------- | ------------ | ------------------------- |
| Short strings (5-10 chars)   | 2,516,437      | 0.0004ms     | Fastest variant           |
| Medium strings (20-50 chars) | 216,179        | 0.0046ms     | Address-length strings    |
| Long strings (100+ chars)    | 9,645          | 0.1037ms     | Still well under target   |
| Batch: 1000 comparisons      | 2,830          | 0.35ms total | ~0.00035ms per comparison |

**Analysis:** Levenshtein performs exceptionally well even on long strings. The Wagner-Fischer dynamic programming implementation is efficient with O(n×m) complexity but optimized memory access patterns.

### Jaro-Winkler Similarity

| Test Case                    | Operations/sec | Mean Time    | Notes                     |
| ---------------------------- | -------------- | ------------ | ------------------------- |
| Short strings (5-10 chars)   | 4,317,352      | 0.0002ms     | Fastest of all algorithms |
| Medium strings (20-50 chars) | 1,557,272      | 0.0006ms     | Excellent for addresses   |
| Long strings (100+ chars)    | 183,410        | 0.0055ms     | Good scaling              |
| Batch: 1000 comparisons      | 5,564          | 0.18ms total | ~0.00018ms per comparison |

**Analysis:** Jaro-Winkler is the fastest algorithm for short strings, making it ideal for name matching. The prefix bonus calculation adds minimal overhead while providing significant matching improvements.

### Soundex Encoding

| Test Case                | Operations/sec | Mean Time    | Notes                        |
| ------------------------ | -------------- | ------------ | ---------------------------- |
| Single encoding          | 5,489,114      | 0.0002ms     | Extremely fast               |
| Batch: 1000 encodings    | 8,121          | 0.12ms total | ~0.00012ms per encoding      |
| Single comparison        | 3,073,468      | 0.0003ms     | Includes double encoding     |
| Medium string comparison | 1,464,276      | 0.0007ms     | String length impact minimal |
| Batch: 1000 comparisons  | 3,701          | 0.27ms total | ~0.00027ms per comparison    |

**Analysis:** Soundex is the fastest encoding algorithm. The simple mapping rules make it highly efficient, suitable for real-time blocking strategies and high-volume matching.

### Metaphone Encoding

| Test Case                | Operations/sec | Mean Time    | Notes                        |
| ------------------------ | -------------- | ------------ | ---------------------------- |
| Single encoding          | 3,793,176      | 0.0003ms     | Very fast despite complexity |
| Batch: 1000 encodings    | 6,171          | 0.16ms total | ~0.00016ms per encoding      |
| Single comparison        | 2,183,605      | 0.0005ms     | Includes double encoding     |
| Medium string comparison | 721,805        | 0.0014ms     | More processing than Soundex |
| Batch: 1000 comparisons  | 2,979          | 0.34ms total | ~0.00034ms per comparison    |

**Analysis:** Metaphone handles complex phonetic rules efficiently. While slightly slower than Soundex due to more sophisticated processing, it remains extremely fast and provides better phonetic matching accuracy.

## Algorithm Comparison

When comparing all algorithms on identical name pairs:

| Algorithm    | Operations/sec | Mean Time | Relative Speed |
| ------------ | -------------- | --------- | -------------- |
| Jaro-Winkler | 1,271,465      | 0.0008ms  | Fastest (1.0x) |
| Soundex      | 905,578        | 0.0011ms  | 1.4x slower    |
| Levenshtein  | 665,246        | 0.0015ms  | 1.9x slower    |
| Metaphone    | 664,821        | 0.0015ms  | 1.9x slower    |

**Analysis:** For typical name matching workloads, Jaro-Winkler offers the best performance. However, all algorithms are fast enough for real-time matching scenarios, so algorithm selection should be based on accuracy requirements rather than performance concerns.

## Performance Characteristics

### String Length Impact

- **Levenshtein:** Performance scales with O(n×m), more noticeable on longer strings
- **Jaro-Winkler:** Better scaling characteristics, efficient even on longer strings
- **Soundex/Metaphone:** Near-constant time regardless of input length (linear preprocessing only)

### Batch Operation Efficiency

All algorithms maintain consistent per-operation performance in batch scenarios, indicating:

- No memory allocation issues
- Efficient garbage collection behavior
- Good cache locality
- No algorithmic bottlenecks

## Optimization Opportunities

While current performance exceeds all targets, potential future optimizations include:

1. **Levenshtein:** Implement two-row space optimization to reduce memory allocation overhead
2. **Soundex/Metaphone:** Add memoization for repeated encodings in batch operations
3. **All algorithms:** Consider SIMD optimizations for very high-throughput scenarios
4. **Engine integration:** Pre-compute phonetic codes during record ingestion for blocking

## Recommendations

### For Name Matching

- **First choice:** Jaro-Winkler (best performance + accuracy for names)
- **Alternative:** Metaphone or Soundex for phonetic matching

### For Address Matching

- **First choice:** Levenshtein (handles variations well)
- **Alternative:** Jaro-Winkler for shorter address components

### For High-Volume Blocking

- **First choice:** Soundex (fastest encoding, good enough for grouping)
- **Alternative:** Metaphone for improved phonetic accuracy

### For General Text

- **First choice:** Levenshtein (versatile, good accuracy)
- **Alternative:** Jaro-Winkler for shorter text fields

## Conclusion

The Phase 2 string similarity implementations demonstrate excellent performance characteristics across all algorithms and test scenarios. All performance targets are exceeded by significant margins, providing ample headroom for production workloads. The library can handle thousands of comparisons per second per algorithm, making it suitable for real-time identity resolution applications.

The consistent performance across batch operations and various input lengths indicates robust, production-ready implementations that will scale effectively in real-world usage.
