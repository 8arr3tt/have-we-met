# Fodors-Zagat Restaurant Benchmark Dataset

The Fodors-Zagat dataset is a classic benchmark for entity matching research, containing restaurant listings from two different review sources that need to be matched.

## Dataset Source

This dataset pairs restaurants from Fodors and Zagat restaurant guides, commonly used to benchmark entity resolution systems on business entity matching.

**Original Source**: University of Leipzig Database Research Group - [Benchmark Datasets for Entity Resolution](https://dbs.uni-leipzig.de/research/projects/object_matching/benchmark_datasets_for_entity_resolution)

## Dataset Characteristics

### Overview

- **Total Records**: 864 (Fodors: 533, Zagat: 331)
- **True Matches**: 112 matching pairs
- **Match Rate**: ~13% of possible pairs are matches
- **Domain**: Restaurant entities (US-based)

### Challenges

- **Name Variations**: "Mc Donald's" vs "McDonald's", abbreviations
- **Address Formats**: Different formatting, abbreviations (St. vs Street)
- **City/Location**: Slight variations in city names
- **Phone Numbers**: Different formats, missing data
- **Type Classifications**: Different cuisine categorizations

## Record Fields

| Field   | Description     | Example (Fodors)            | Example (Zagat)             |
| ------- | --------------- | --------------------------- | --------------------------- |
| `name`  | Restaurant name | "arnie morton's of chicago" | "arnie morton's of chicago" |
| `addr`  | Street address  | "435 s. la cienega blv."    | "435 s. la cienega blvd."   |
| `city`  | City name       | "los angeles"               | "los angeles"               |
| `phone` | Phone number    | "310-246-1501"              | "310/246-1501"              |
| `type`  | Cuisine type    | "american"                  | "steakhouse"                |
| `class` | Price class     | "$$$$"                      | "expensive"                 |

## Data Quality Issues

The dataset exhibits realistic entity matching challenges:

- **Abbreviations**: "blvd" vs "blv.", "st" vs "street"
- **Punctuation**: Inconsistent use of periods, hyphens
- **Phone formats**: "(310) 246-1501" vs "310-246-1501" vs "310/246-1501"
- **Type mismatches**: "american" vs "steakhouse" for same restaurant
- **Missing values**: Some fields empty in one source but not the other
- **Case variations**: Mixed casing in names and addresses

## Usage in have-we-met

```typescript
import { generateSyntheticRestaurantData } from './loader'

// Generate synthetic restaurant data for benchmarking
const dataset = generateSyntheticRestaurantData({
  recordCount: 500,
  duplicateRate: 0.3,
  corruptionProbability: 0.25,
})

console.log(dataset.metadata.recordCount) // 500
console.log(dataset.truePairs?.length) // ~150 pairs
```

## Expected Results

Well-tuned record linkage systems typically achieve:

| Configuration                 | Precision | Recall | F1 Score |
| ----------------------------- | --------- | ------ | -------- |
| Exact match only              | 100%      | 15-25% | 26-40%   |
| Levenshtein (0.8 threshold)   | 85-92%    | 70-82% | 77-87%   |
| Jaro-Winkler (0.85 threshold) | 88-95%    | 75-88% | 81-91%   |
| Combined with blocking        | 90-96%    | 72-85% | 80-90%   |

## Why This Dataset Matters

1. **Real-world entity types**: Business entities have different characteristics than person records
2. **Multiple matching fields**: Name, address, phone all contribute to matching
3. **Structured addresses**: Tests address parsing and normalization
4. **Categorical data**: Type/class fields show how to handle categorical matching
5. **Moderate size**: Large enough to be meaningful, small enough for quick iteration

## Algorithm Recommendations

Based on benchmark results:

| Field   | Recommended Algorithm       | Rationale                                    |
| ------- | --------------------------- | -------------------------------------------- |
| `name`  | Jaro-Winkler                | Handles word transpositions well             |
| `addr`  | Levenshtein                 | Better for longer strings with abbreviations |
| `city`  | Exact or Soundex            | City names should match closely              |
| `phone` | Exact (after normalization) | Phone numbers are identifiers                |
| `type`  | Token overlap or custom     | Semantic similarity needed                   |

## Blocking Recommendations

Effective blocking strategies for restaurant matching:

1. **City blocking**: Restaurants in different cities rarely match
2. **First letter of name**: Simple but effective
3. **Phone area code**: Good for US restaurants
4. **Normalized city + first word of name**: Balanced approach

## References

1. Bilenko, M., Mooney, R., et al. (2003). "Adaptive Name Matching in Information Integration"
2. University of Leipzig Benchmark Datasets: https://dbs.uni-leipzig.de/research/projects/object_matching/benchmark_datasets_for_entity_resolution
