# Febrl Synthetic Benchmark Datasets

The Febrl (Freely Extensible Biomedical Record Linkage) datasets are widely used benchmarks for evaluating record linkage and deduplication systems.

## Dataset Source

These datasets were generated using the Febrl data generator, which creates synthetic records with realistic variations and errors commonly found in real-world data.

**Original Source**: [RecordLinkage Python Library](https://recordlinkage.readthedocs.io/en/latest/ref-datasets.html)

## Dataset Characteristics

### Dataset 1 (febrl1)
- **Records**: 1,000 records
- **Duplicates**: 500 pairs (each original has one duplicate)
- **Corruption Rate**: Low
- **Purpose**: Easy benchmark for basic algorithm validation

### Dataset 2 (febrl2)
- **Records**: 5,000 records
- **Duplicates**: 1,934 pairs
- **Corruption Rate**: Moderate
- **Purpose**: Medium-sized benchmark for algorithm comparison

### Dataset 3 (febrl3)
- **Records**: 5,000 records
- **Duplicates**: 6,538 pairs
- **Corruption Rate**: Higher
- **Purpose**: Challenging benchmark with multiple duplicates per record

### Dataset 4 (febrl4)
- **Records**: 10,000 records (5,000 pairs)
- **Duplicates**: Various corruption levels
- **Purpose**: Large-scale benchmark for scalability testing

## Record Fields

Each record contains the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| `rec_id` | Record identifier | rec-0-org |
| `given_name` | First name | robert |
| `surname` | Family name | smith |
| `street_number` | Street number | 12 |
| `address_1` | Street address | main street |
| `address_2` | Secondary address | unit 3 |
| `suburb` | Suburb/neighborhood | lakeside |
| `postcode` | Postal code | 2913 |
| `state` | State | nsw |
| `date_of_birth` | Birth date (YYYYMMDD) | 19820415 |
| `soc_sec_id` | Social security ID | 1234567 |
| `org_rec` | Original record ID (for duplicates only) | rec-0-org |

## Corruption Types

The dataset includes realistic data quality issues:

- **Typos**: Character insertions, deletions, substitutions
- **Phonetic errors**: Similar-sounding spellings
- **OCR errors**: Character confusions (0/O, 1/l/I)
- **Missing values**: Random field omissions
- **Format variations**: Different date formats, abbreviations
- **Transpositions**: Swapped characters or words

## Usage in have-we-met

```typescript
import { loadFebrlDataset } from './loader'

// Load a specific Febrl dataset
const dataset = await loadFebrlDataset('febrl1')

console.log(dataset.metadata.recordCount) // 1000
console.log(dataset.truePairs?.length)    // 500
```

## Expected Results

Based on research literature, well-tuned record linkage systems typically achieve:

| Metric | febrl1 | febrl2 | febrl3 | febrl4 |
|--------|--------|--------|--------|--------|
| Precision | 95-99% | 90-97% | 85-95% | 90-97% |
| Recall | 95-99% | 88-95% | 80-92% | 88-95% |
| F1 Score | 95-99% | 89-96% | 82-93% | 89-96% |

These results vary based on:
- Choice of comparison algorithms
- Field weights and thresholds
- Blocking strategy effectiveness
- Use of phonetic algorithms

## License

The Febrl datasets are available for research and benchmarking purposes. Please cite the original Febrl documentation when using these datasets in publications.

## References

1. Christen, P. (2008). "Febrl: A Freely Available Record Linkage System with a Graphical User Interface". Proceedings of the Second Australasian Workshop on Health Data and Knowledge Management.

2. RecordLinkage Python Library: https://recordlinkage.readthedocs.io/
