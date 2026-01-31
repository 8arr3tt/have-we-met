# UK Address Support

The address normalizer now includes comprehensive support for UK addresses alongside US and Canadian addresses.

## Features

### Automatic Detection
UK addresses are automatically detected by their postcode format. When a valid UK postcode is found, the address is parsed using UK-specific rules.

### UK Postcode Support
Supports all valid UK postcode formats:
- Standard formats: A9 9AA, A99 9AA, AA9 9AA, AA99 9AA
- Variable formats: A9A 9AA, AA9A 9AA
- Special Girobank postcode: GIR 0AA

```typescript
import { formatUKPostcode, normalizeAddress } from 'have-we-met'

// Format UK postcodes
formatUKPostcode('SW1A1AA') // 'SW1A 1AA'
formatUKPostcode('GIR0AA')  // 'GIR 0AA'

// Normalize UK addresses
normalizeAddress('Flat 2, 45 Baker Street, London, NW1 6XE')
// Returns: '45 Baker St, Flat 2, London, NW1 6XE, GB'
```

### UK Counties
Support for 70+ UK counties across England, Scotland, Wales, and Northern Ireland:

```typescript
import { abbreviateState } from 'have-we-met'

abbreviateState('Greater London')      // 'London'
abbreviateState('West Yorkshire')      // 'W Yorks'
abbreviateState('Scottish Borders')    // 'Borders'
```

### UK Street Types
Support for UK-specific street types:

```typescript
import { abbreviateStreetType } from 'have-we-met'

abbreviateStreetType('Close', 'GB')     // 'Cl'
abbreviateStreetType('Crescent', 'GB')  // 'Cres'
abbreviateStreetType('Mews', 'GB')      // 'Mews'
abbreviateStreetType('Gardens', 'GB')   // 'Gdns'
```

### UK Unit Designations
Support for UK-specific unit types:
- Flat
- Maisonette
- Apartment
- Suite
- Room
- Floor

```typescript
import { normalizeAddress } from 'have-we-met'

normalizeAddress('Flat 3, 45 Park Road, London, NW1 6XE')
// Returns: '45 Park Rd, Flat 3, London, NW1 6XE, GB'
```

## API

### formatUKPostcode(postcode: string): string | null
Formats a UK postcode to standard format with space separator.

**Parameters:**
- `postcode` - UK postcode to format (with or without space)

**Returns:**
- Formatted postcode (e.g., 'SW1A 1AA') or null if invalid

**Example:**
```typescript
formatUKPostcode('SW1A1AA')   // 'SW1A 1AA'
formatUKPostcode('sw1a 1aa')  // 'SW1A 1AA'
formatUKPostcode('invalid')   // null
```

### parseAddressComponents(address: string): AddressComponents
Parses address string into components, automatically detecting UK addresses by postcode.

**UK Detection:**
When a valid UK postcode is found, the address is parsed using UK rules:
- No state/province (county is optional)
- Postcode format validation
- UK-specific street types
- Country code set to 'GB'

**Example:**
```typescript
import { parseAddressComponents } from 'have-we-met'

const components = parseAddressComponents(
  '45 Baker Street, London, NW1 6XE'
)
// {
//   streetNumber: '45',
//   streetName: 'Baker',
//   streetType: 'Street',
//   city: 'London',
//   postalCode: 'NW1 6XE',
//   country: 'GB'
// }
```

### normalizeAddress(address: string, options?: AddressNormalizerOptions): string
Normalizes address with automatic UK detection and formatting.

**UK Normalization:**
- Formats postcode with space (SW1A 1AA)
- Abbreviates street types (Street → St)
- Abbreviates counties if present
- Sets country code to GB
- Handles UK unit designations (Flat, Maisonette)

**Example:**
```typescript
import { normalizeAddress } from 'have-we-met'

normalizeAddress('Flat 2, 45 Baker Street, London, NW1 6XE')
// '45 Baker St, Flat 2, London, NW1 6XE, GB'

normalizeAddress('10 Downing Street, Westminster, Greater London, SW1A 2AA')
// '10 Downing St, Westminster, London, SW1A 2AA, GB'
```

## Testing

25 comprehensive tests cover UK address functionality:
- Postcode formatting (all formats including GIR 0AA)
- County abbreviations
- Address parsing with UK postcodes
- Address normalization
- Unit designation handling
- Street type abbreviations

All tests passing with 96.8% code coverage.

## Implementation Details

### Data Tables
Located in `src/core/normalizers/address-data.ts`:
- `UK_COUNTIES` - 70+ counties with abbreviations
- `UK_STREET_TYPE_ABBREVIATIONS` - 22 street types
- `UK_POSTCODE_PATTERN` - Regex for validation
- `UK_UNIT_TYPE_ABBREVIATIONS` - UK unit types

### Detection Logic
UK addresses are detected by scanning comma-delimited parts for valid UK postcodes. When found:
1. Postcode is extracted and formatted
2. Country is set to 'GB'
3. UK-specific parsing rules apply
4. No state/province extraction (UK uses counties optionally)

### Parsing Strategy
UK addresses are parsed differently from US addresses:
- Street address comes first
- City/town follows
- County (optional)
- Postcode (required for detection)

Example format: `[Unit,] Street Address, City, [County,] Postcode`
