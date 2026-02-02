# Benchmark Results Summary

*Generated: 2026-02-02*

This document consolidates benchmark results for the **have-we-met** identity resolution library, providing a comprehensive overview of performance characteristics across different datasets, algorithms, and configurations.

## Quick Reference

### Algorithm Performance

| Algorithm | Best For | Precision | Recall | Throughput |
|-----------|----------|-----------|--------|------------|
| Jaro-Winkler | Names (short strings) | 89-93% | 85-90% | ~400k pairs/sec |
| Levenshtein | Addresses (longer strings) | 87-91% | 83-88% | ~350k pairs/sec |
| Soundex+JW Hybrid | Phonetic name matching | 93% | 90% | ~360k pairs/sec |
| Exact Match | IDs, postcodes | 100% | 100% | ~1M+ pairs/sec |

### Blocking Strategy Effectiveness

| Strategy | Pair Reduction | Recall Impact | Best For |
|----------|----------------|---------------|----------|
| Soundex (surname) | 89-99% | -1-2% | Person matching |
| City | 95-96% | -1% | Business/restaurant matching |
| Postcode | 97-99.9% | -10-15% | Geographic filtering |
| First Letter | 92-96% | -3-5% | Simple blocking |
| Composite | 99%+ | -10-20% | High volume, precision-focused |

### Optimal Thresholds by Use Case

| Use Case | Threshold | Precision | Recall | F1 |
|----------|-----------|-----------|--------|-----|
| High-stakes (medical) | 0.80-0.85 | 96-97% | 68-77% | 80-85% |
| Balanced deduplication | 0.65-0.70 | 89-92% | 87-90% | 90% |
| Discovery/prospecting | 0.55-0.60 | 78-85% | 93-96% | 86-89% |

---

## Dataset Benchmarks

### Febrl Dataset (Person Matching)

The Febrl synthetic dataset is a standard benchmark for person record linkage with controllable corruption levels.

#### Dataset Characteristics

| Size | Records | True Pairs | Corruption |
|------|---------|------------|------------|
| Small | 500 | ~167 | 30% |
| Medium | 1,000 | ~333 | 30% |
| Large | 2,000 | ~667 | 30% |

#### Best Configuration

```typescript
const resolver = HaveWeMet
  .schema({
    givenName: { type: 'name', component: 'first' },
    surname: { type: 'name', component: 'last' },
    dateOfBirth: { type: 'date' },
    ssn: { type: 'identifier' },
    postcode: { type: 'text' },
    address: { type: 'address' },
  })
  .blocking(block => block
    .onField('surname', { transform: 'soundex' })
  )
  .matching(match => match
    .field('givenName').strategy('jaro-winkler').weight(15).threshold(0.8)
    .field('surname').strategy('jaro-winkler').weight(20).threshold(0.8)
    .field('dateOfBirth').strategy('exact').weight(15)
    .field('ssn').strategy('exact').weight(25)
    .field('postcode').strategy('exact').weight(10)
    .field('address').strategy('levenshtein').weight(15).threshold(0.7)
  )
  .thresholds({ noMatch: 0.55, definiteMatch: 0.75 })
  .build()
```

#### Results Summary

| Metric | Value |
|--------|-------|
| Precision | 92.45% |
| Recall | 89.18% |
| F1 Score | 90.79% |
| Optimal Threshold | 0.67 |
| Pair Reduction (Soundex) | 89.5% |
| Throughput | 368,591 pairs/sec |

---

### Restaurant Dataset (Business Entity Matching)

The Fodors-Zagat style dataset benchmarks business entity resolution with name and address variations.

#### Dataset Characteristics

| Size | Records | True Pairs | Corruption |
|------|---------|------------|------------|
| Small | 300 | ~70 | 25% |
| Medium | 600 | ~140 | 25% |
| Large | 1,000 | ~230 | 25% |

#### Best Configuration

```typescript
const resolver = HaveWeMet
  .schema({
    name: { type: 'text' },
    addr: { type: 'address' },
    city: { type: 'text' },
    phone: { type: 'phone' },
    type: { type: 'text' },
  })
  .blocking(block => block
    .onField('city')
  )
  .matching(match => match
    .field('name').strategy('jaro-winkler').weight(30).threshold(0.8)
    .field('addr').strategy('levenshtein').weight(25).threshold(0.75)
    .field('city').strategy('exact').weight(15)
    .field('phone').strategy('exact').weight(20)
    .field('type').strategy('levenshtein').weight(10).threshold(0.7)
  )
  .thresholds({ noMatch: 0.55, definiteMatch: 0.75 })
  .build()
```

#### Results Summary

| Metric | Value |
|--------|-------|
| Precision | 89.42% |
| Recall | 85.71% |
| F1 Score | 87.53% |
| Optimal Threshold | 0.67 |
| Pair Reduction (City) | 95.97% |
| Throughput | 436,165 pairs/sec |

---

## Scalability Analysis

### Scaling Behavior

Performance tested on AMD Ryzen 7 7800X3D with 32GB RAM, Node.js v24.13.0.

| Records | Pairs (No Block) | Pairs (Blocked) | Time (Blocked) | Records/sec |
|---------|------------------|-----------------|----------------|-------------|
| 1,000 | 499,500 | ~35,000 | 47.6 ms | 21,008 |
| 5,000 | 12,497,500 | ~200,000 | 1,143 ms | 4,375 |
| 10,000 | 49,995,000 | ~400,000 | 4,397 ms | 2,274 |

### Complexity Analysis

| Approach | Complexity | Description |
|----------|------------|-------------|
| No blocking | O(n²) | All-pairs comparison |
| With blocking | O(n × b) | Linear with block size |

Where `b` = average block size (typically 5-50).

**Empirical Findings:**
- With Soundex blocking: O(n^1.68) observed complexity
- With City blocking: O(n^1.52) observed complexity

### Memory Usage

| Records | Memory Delta | Per 1k Records |
|---------|--------------|----------------|
| 500 | +6.9 MB | ~13.8 MB |
| 1,000 | +16.1 MB | ~16.1 MB |
| 2,000 | +43.8 MB | ~21.9 MB |

**Recommendation:** Plan for 3-5 MB per 1,000 records, with overhead increasing slightly at scale.

---

## Blocking Strategy Deep Dive

### Comparison Table (10k Records)

| Strategy | Time | Speedup | Pair Reduction | Recall Loss |
|----------|------|---------|----------------|-------------|
| No Blocking | 33,885 ms | 1x | 0% | 0% |
| Soundex | 3,900 ms | **8.7x** | 99% | 1-2% |
| First Letter | 10,863 ms | 3.1x | 96% | 3-5% |
| Postcode | 25.9 ms | **1,307x** | 99.9% | 10-15% |
| Composite | 3,981 ms | 8.5x | 99% | 10-20% |

### Strategy Selection Guide

| Scenario | Recommended Strategy | Rationale |
|----------|----------------------|-----------|
| Person matching | Soundex (surname) | High pair reduction, preserves phonetic matches |
| Business matching | City/Location | Natural grouping, minimal recall loss |
| Geographic data | Postcode | Maximum reduction, acceptable for local data |
| Maximum recall | Composite (union) | Covers multiple blocking keys |
| Streaming/batching | Sorted neighbourhood | Predictable pair counts |

---

## Algorithm Comparison

### String Similarity Algorithms

| Algorithm | Speed | Short Strings | Long Strings | Typo Tolerance | Phonetic |
|-----------|-------|---------------|--------------|----------------|----------|
| Jaro-Winkler | Fast | ★★★★★ | ★★★☆☆ | ★★★★☆ | ☆☆☆☆☆ |
| Levenshtein | Medium | ★★★☆☆ | ★★★★★ | ★★★★★ | ☆☆☆☆☆ |
| Soundex | Fast | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ | ★★★★★ |
| Metaphone | Fast | ★★★★☆ | ★★★☆☆ | ★★★☆☆ | ★★★★★ |
| Exact | Fastest | ★★★★★ | ★★★★★ | ☆☆☆☆☆ | ☆☆☆☆☆ |

### Throughput Benchmarks

| Algorithm | Pairs/sec | Relative Speed |
|-----------|-----------|----------------|
| Exact | 1,000,000+ | 1.00x |
| Soundex | 500,000+ | 0.50x |
| Jaro-Winkler | 400,000 | 0.40x |
| Levenshtein | 350,000 | 0.35x |
| Metaphone | 450,000 | 0.45x |

### Field Weight Recommendations

| Field Type | Weight Range | Algorithm | Rationale |
|------------|--------------|-----------|-----------|
| SSN/National ID | 20-25 | Exact | Highest discriminating power |
| Surname | 15-20 | Jaro-Winkler | Good discriminator with typo tolerance |
| Given Name | 10-15 | Jaro-Winkler | Common names reduce power |
| Date of Birth | 10-15 | Exact | Good discriminator |
| Phone | 15-25 | Exact | Unique when present |
| Email | 15-25 | Exact | Unique when present |
| Address | 10-15 | Levenshtein | Variable quality |
| Postcode | 5-10 | Exact | Moderate discriminator |
| City | 5-10 | Exact | Lower discriminator |

---

## Production Recommendations

### By Dataset Size

#### 1k-10k Records
- Blocking optional but recommended
- In-memory processing works well
- Real-time matching feasible (<5 seconds)
- Single-threaded processing sufficient

#### 10k-100k Records
- Blocking **required** for reasonable performance
- Consider composite blocking for better match coverage
- Batch processing recommended
- Monitor memory usage (~50-500 MB)

#### 100k+ Records
- Use database adapters with streaming/batching
- Implement incremental matching (new vs existing records)
- Consider distributed processing by blocking key
- Soundex or composite blocking essential
- Memory: 1-5 GB depending on record complexity

### Threshold Tuning

1. **Start with 0.65-0.70** for balanced precision/recall
2. **Analyze false positives/negatives** using manual review
3. **Adjust based on use case:**
   - Medical/financial: increase to 0.80+
   - Marketing/discovery: decrease to 0.55-0.60
4. **Consider three-tier outcomes** for ambiguous matches

### Configuration Checklist

- [ ] Schema defined with appropriate field types
- [ ] Blocking strategy selected based on data characteristics
- [ ] Algorithms matched to field types (Jaro-Winkler for names, etc.)
- [ ] Weights assigned reflecting discriminating power
- [ ] Thresholds tuned for use case
- [ ] Memory budget verified for dataset size
- [ ] Batch size configured for large datasets

---

## Cross-Dataset Comparison

### Person vs Business Entity Matching

| Aspect | Person Matching | Business Matching |
|--------|-----------------|-------------------|
| Primary ID | SSN/National ID | Name + Location |
| Best Blocking | Soundex (surname) | City |
| Typical Precision | 90-96% | 85-92% |
| Typical Recall | 85-92% | 78-88% |
| Key Challenge | Name variations | Address variations |
| Optimal Threshold | 0.65-0.70 | 0.65-0.70 |

### Performance Characteristics

| Dataset | Complexity | Pair Reduction | F1 Score |
|---------|------------|----------------|----------|
| Febrl (person) | O(n^1.68) | 89.5% | 90.79% |
| Restaurant (business) | O(n^1.52) | 95.97% | 87.53% |

---

## Benchmark Methodology

### Test Environment

| Component | Specification |
|-----------|---------------|
| CPU | AMD Ryzen 7 7800X3D |
| RAM | 32 GB |
| Node.js | v24.13.0 |
| OS | Windows 10 |
| Test Framework | Vitest Bench |

### Measurement Protocol

1. **Warmup:** 1 run (discarded)
2. **Measurement:** 3-10 runs (averaged)
3. **Metrics:** Mean, min, max, standard deviation
4. **Isolation:** Each benchmark run in isolation

### Reproducibility

```bash
# Run all benchmarks
npm run bench

# Run specific benchmark
npm run bench -- benchmarks/febrl.bench.ts
npm run bench -- benchmarks/restaurant.bench.ts
npm run bench -- benchmarks/scalability.bench.ts
```

---

## References

1. Febrl Dataset: https://recordlinkage.readthedocs.io/en/latest/ref-datasets.html
2. Leipzig Benchmark Datasets: https://dbs.uni-leipzig.de/research/projects/object_matching/benchmark_datasets_for_entity_resolution
3. Winkler, W. E. (1990). "String Comparator Metrics and Enhanced Decision Rules in the Fellegi-Sunter Model of Record Linkage"
4. Russell, R. C. (1918). U.S. Patent 1,261,167 (Soundex)
5. Bilenko, M. & Mooney, R. (2003). "Adaptive Name Matching in Information Integration"
