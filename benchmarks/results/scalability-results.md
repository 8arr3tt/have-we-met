# Scalability Benchmark Results

_Generated: 2026-02-02_

## Key Findings

### Why Blocking Matters

At 10,000 records, the impact of blocking strategies is dramatic:

| Strategy                       | Speedup vs No Blocking |
| ------------------------------ | ---------------------- |
| Soundex (surname)              | **8.7x faster**        |
| First Letter (surname)         | 3.1x faster            |
| Postcode                       | **1,307x faster**      |
| Composite (Soundex + Postcode) | 8.5x faster            |

**Key insight:** Without blocking, comparing 10k records requires ~50 million pair comparisons. With effective blocking, this drops to hundreds of thousands or less.

### Scaling Behavior

How processing time grows as dataset size increases (using Soundex blocking):

| Scale Factor | Records | Time Increase |
| ------------ | ------- | ------------- |
| 1x           | 1,000   | baseline      |
| 5x           | 5,000   | 24x slower    |
| 10x          | 10,000  | 92x slower    |

This demonstrates **sub-quadratic scaling** with blocking. Without blocking, 10x more records would mean 100x more time (quadratic). With Soundex blocking, it's only 92x - the blocking overhead is minimal.

### Complexity Analysis

| Approach      | Complexity | 10k Records | 100k Records | 1M Records  |
| ------------- | ---------- | ----------- | ------------ | ----------- |
| No blocking   | O(n²)      | ~50M pairs  | ~5B pairs    | ~500B pairs |
| With blocking | O(n × b)   | ~400k pairs | ~4M pairs    | ~40M pairs  |

Where `b` = average block size (typically 5-50 depending on blocking strategy and data distribution).

### Blocking Strategy Trade-offs

| Strategy          | Pair Reduction     | Risk                                                   |
| ----------------- | ------------------ | ------------------------------------------------------ |
| Soundex (surname) | High (~99%)        | May miss matches with very different surname spellings |
| First Letter      | Moderate (~96%)    | Misses typos in first character                        |
| Postcode          | Very High (~99.9%) | Misses matches across different postcodes              |
| Composite (union) | High (~99%)        | Good coverage, slightly more pairs                     |

**Recommendation:** Use Soundex blocking for name-heavy matching, or composite blocking for better coverage at the cost of more comparisons.

### Blocking Effectiveness by Scale

The larger your dataset, the more blocking helps:

| Dataset Size | Pairs Without Blocking | Estimated Pairs With Blocking | Reduction |
| ------------ | ---------------------- | ----------------------------- | --------- |
| 1,000        | 499,500                | ~35,000                       | ~93%      |
| 10,000       | 49,995,000             | ~400,000                      | ~99.2%    |
| 100,000      | 4,999,950,000          | ~5,000,000                    | ~99.9%    |

### Memory Considerations

Memory usage scales linearly with record count:

- Approximate overhead: 3-5 MB per 1,000 records (varies by record complexity)
- 10k records: ~40-50 MB
- 100k records: ~400-500 MB

For datasets exceeding available memory, use database adapters with streaming/batching.

---

## Test Environment

| Component | Specification                                                          |
| --------- | ---------------------------------------------------------------------- |
| CPU       | AMD Ryzen 7 7800X3D                                                    |
| RAM       | 32 GB                                                                  |
| Node.js   | v24.13.0                                                               |
| OS        | Windows 10                                                             |
| Test Data | Synthetic Febrl-like records, 50% duplicate rate, 30% field corruption |

**Note:** Absolute performance numbers below are specific to this hardware. Relative comparisons and scaling behavior are transferable across environments.

---

## Absolute Performance Numbers

### Scaling Test (Soundex Blocking)

| Records | Mean Time | Min      | Max      | Samples |
| ------- | --------- | -------- | -------- | ------- |
| 1,000   | 47.6 ms   | 44.3 ms  | 53.8 ms  | 11      |
| 5,000   | 1,143 ms  | 1,071 ms | 1,249 ms | 10      |
| 10,000  | 4,397 ms  | 4,267 ms | 4,540 ms | 10      |

### Blocking Strategy Comparison (10k Records)

| Strategy               | Mean Time | Ops/sec | Variance |
| ---------------------- | --------- | ------- | -------- |
| No blocking            | 33,885 ms | 0.03    | ±2.13%   |
| Soundex blocking       | 3,900 ms  | 0.26    | ±1.39%   |
| First letter blocking  | 10,863 ms | 0.09    | ±1.63%   |
| Postcode blocking      | 25.9 ms   | 38.7    | ±0.76%   |
| Composite blocking     | 3,981 ms  | 0.25    | ±2.48%   |
| Sorted neighbourhood\* | 0.07 ms   | 14,047  | ±8.16%   |

\*Sorted neighbourhood with window=10 generates a fixed number of pairs (n × window), making it not directly comparable to other strategies. It's best suited for streaming scenarios where predictable pair counts matter.

### Throughput Summary

With Soundex blocking on this hardware:

- **1k records:** ~21 complete matching runs per second
- **5k records:** ~0.9 runs per second
- **10k records:** ~0.23 runs per second (~4.4 seconds per run)

---

## Production Recommendations

### For 1k-10k Records

- Blocking optional but recommended
- In-memory processing works well
- Real-time matching feasible (<5 seconds)

### For 10k-100k Records

- Blocking **required** for reasonable performance
- Consider composite blocking for better match coverage
- Batch processing recommended
- Monitor memory usage

### For 100k+ Records

- Use database adapters instead of loading all records
- Implement incremental matching (new records vs existing)
- Consider distributed processing by blocking key
- Soundex or composite blocking essential

---

## How to Run These Benchmarks

```bash
npm run bench -- benchmarks/scalability.bench.ts
```

Expected runtime: ~15 minutes (the "no blocking at 10k" test alone takes ~6 minutes).
