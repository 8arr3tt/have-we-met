# Phase 3: Data Normalizers - Technical Implementation Plan

## Overview

Phase 3 implements the data preparation layer that transforms raw, messy data into clean, standardized formats optimized for matching. String similarity algorithms work best with normalized inputs—trimmed whitespace, standardized casing, parsed components, and consistent formatting all improve match accuracy.

**Core Principle:** Normalizers should be separate from comparators for composability. They are applied before matching, not within similarity functions.

**Deliverables:**
- Core normalization infrastructure (types, registry, pipeline)
- Name parser and normalizer (components, titles, suffixes, casing)
- Email normalizer (lowercase, trim, plus-addressing, domain extraction)
- Phone normalizer (international format, country codes, standardization)
- Address normalizer (component parsing, abbreviation standardization)
- Date normalizer (multiple format parsing, partial dates)
- Custom transformer support (user-defined normalizers)
- Integration with schema definitions and matching engine
- Comprehensive test coverage and documentation

**Success Criteria:**
- All normalizers handle edge cases gracefully (null, empty, malformed input)
- Normalizers are composable and chainable
- Schema definitions can specify normalizers via string names or custom functions
- Builder API supports normalizer configuration
- Test coverage maintained at 100% on implementation files
- Documentation explains when and how to use each normalizer

---

## Architecture

### Normalization Flow

```
Raw Input → Normalizer(s) → Normalized Value → Comparator → Score
```

1. **Pre-Matching**: Normalizers run before field comparison
2. **Optional**: Fields without normalizers pass through unchanged
3. **Composable**: Multiple normalizers can be chained
4. **Cached**: Normalized values can be cached for repeated comparisons

### Key Components

**Normalizer Registry** (`src/core/normalizers/registry.ts`)
- Central registry mapping normalizer names to functions
- Built-in normalizers: `'name'`, `'email'`, `'phone'`, `'address'`, `'date'`, `'trim'`, `'lowercase'`, etc.
- Support for user-defined normalizers

**Normalizer Functions** (`src/core/normalizers/*.ts`)
- Pure functions: `(value: unknown) => unknown`
- Type-safe with proper TypeScript interfaces
- Handle null/undefined/invalid input gracefully
- Return normalized value or null if normalization fails

**Integration Points**
- Schema definitions already have `normalizer` and `customNormalizer` fields
- Matching engine applies normalizers before field comparison
- Builder API allows normalizer configuration

---

## Technical Specifications

### Normalizer Function Signature

All normalizers must follow this pattern:

```typescript
/**
 * Normalizes a value for matching.
 *
 * @param value - The raw value to normalize
 * @param options - Optional configuration for this normalizer
 * @returns Normalized value, or null if normalization fails
 */
function normalizerName(
  value: unknown,
  options?: NormalizerOptions
): unknown | null
```

**Behavior Requirements:**
- Accept `unknown` input type (defensive programming)
- Return `null` for null/undefined input (preserve nullability)
- Return `null` for malformed input that cannot be normalized
- Never throw errors—log warnings and return null instead
- Be pure functions (no side effects)
- Be idempotent (normalizing twice produces same result as once)

---

## Normalizer Specifications

### 1. Name Normalizer

**Purpose:** Parse and standardize personal names for matching. Handles titles, suffixes, multiple middle names, and compound surnames.

**Module:** `src/core/normalizers/name.ts`

**Functions:**

```typescript
interface NameComponents {
  title?: string           // Mr., Mrs., Dr., etc.
  first?: string          // First/given name
  middle?: string[]       // Middle name(s)
  last?: string           // Last/family/surname
  suffix?: string         // Jr., Sr., III, PhD, etc.
  full?: string           // Full normalized name
}

interface NameNormalizerOptions {
  /** Whether to preserve casing (default: false, converts to Title Case) */
  preserveCase?: boolean
  /** Whether to extract and separate titles (default: true) */
  extractTitles?: boolean
  /** Whether to extract and separate suffixes (default: true) */
  extractSuffixes?: boolean
  /** Whether to normalize whitespace (default: true) */
  normalizeWhitespace?: boolean
  /** Format for output: 'components' or 'full' (default: 'full') */
  outputFormat?: 'components' | 'full'
}

/**
 * Normalizes a name into standardized components or full format.
 */
function normalizeName(
  value: unknown,
  options?: NameNormalizerOptions
): string | NameComponents | null

/**
 * Parses a name string into its components.
 */
function parseNameComponents(name: string): NameComponents
```

**Implementation Details:**

1. **Title Recognition:**
   - Common titles: Mr., Mrs., Ms., Miss, Dr., Prof., Rev., Hon.
   - Academic: PhD, MD, DDS, Esq.
   - Military: Capt., Lt., Col., Gen., Sgt., Maj.
   - Case-insensitive matching with trailing period optional

2. **Suffix Recognition:**
   - Generational: Jr., Sr., II, III, IV, etc.
   - Academic: PhD, MD, DDS, JD, MBA, etc.
   - Professional: Esq., CPA, PE, etc.

3. **Name Parsing Logic:**
   - Remove titles and suffixes first
   - Split remaining by whitespace
   - Single token → last name only
   - Two tokens → first + last
   - Three+ tokens → first + middle(s) + last
   - Handle hyphens (keep as part of name component)
   - Handle apostrophes (O'Brien, D'Angelo)

4. **Casing:**
   - Default: Title Case (first letter uppercase, rest lowercase)
   - Special handling: McGregor, O'Brien, von, de, etc.
   - Option to preserve original casing

**Test Cases:**
- Simple name: `"John Smith"` → `{first: "John", last: "Smith"}`
- With title: `"Dr. Jane Doe"` → `{title: "Dr.", first: "Jane", last: "Doe"}`
- With suffix: `"John Smith Jr."` → `{first: "John", last: "Smith", suffix: "Jr."}`
- Middle names: `"Mary Jane Watson"` → `{first: "Mary", middle: ["Jane"], last: "Watson"}`
- Compound: `"Jean-Claude Van Damme"` → proper parsing
- Apostrophe: `"Patrick O'Brien"` → proper parsing
- Multiple suffixes: `"Dr. John Smith PhD"` → handle both title and suffix
- All uppercase: `"JOHN SMITH"` → normalize to Title Case
- Extra whitespace: `"John    Smith"` → normalize to single space
- Null/empty: handle gracefully

---

### 2. Email Normalizer

**Purpose:** Standardize email addresses for comparison. Handles casing, whitespace, plus-addressing, and domain normalization.

**Module:** `src/core/normalizers/email.ts`

**Functions:**

```typescript
interface EmailComponents {
  localPart: string      // Part before @
  domain: string         // Domain name
  full: string           // Complete normalized email
  baseName?: string      // Local part without plus-addressing
}

interface EmailNormalizerOptions {
  /** Whether to remove plus-addressing (user+tag@domain) (default: true) */
  removePlusAddressing?: boolean
  /** Whether to normalize domain (lowercase, trim) (default: true) */
  normalizeDomain?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
  /** Whether to validate email format (default: true) */
  validate?: boolean
}

/**
 * Normalizes an email address.
 */
function normalizeEmail(
  value: unknown,
  options?: EmailNormalizerOptions
): string | EmailComponents | null

/**
 * Validates email format (basic RFC 5322 compliance).
 */
function isValidEmail(email: string): boolean
```

**Implementation Details:**

1. **Basic Normalization:**
   - Trim whitespace
   - Convert to lowercase (email is case-insensitive per RFC)
   - Validate basic format: `localpart@domain`

2. **Plus-Addressing:**
   - Gmail/many providers support: `user+tag@domain.com`
   - Option to strip `+tag` to get base address: `user@domain.com`
   - Useful for matching: `john+work@gmail.com` = `john@gmail.com`

3. **Domain Normalization:**
   - Lowercase domain (case-insensitive)
   - Trim whitespace around `@`
   - Validate domain format (basic check)

4. **Validation:**
   - Basic format check: contains `@`, has local and domain parts
   - Local part: alphanumeric + `._%+-` allowed
   - Domain part: alphanumeric + `.-` allowed, must have TLD
   - Not full RFC 5322 compliance (too complex), but catches obvious errors

**Gmail-Specific Rules (Optional Enhancement):**
- Gmail ignores dots in local part: `john.smith@gmail.com` = `johnsmith@gmail.com`
- Option to normalize dots for Gmail domains

**Test Cases:**
- Basic: `"John@Example.Com"` → `"john@example.com"`
- Whitespace: `" john@example.com "` → `"john@example.com"`
- Plus-addressing: `"user+tag@domain.com"` → `"user@domain.com"` (if option enabled)
- Gmail dots: `"john.smith@gmail.com"` → `"johnsmith@gmail.com"` (if option enabled)
- Invalid format: `"not-an-email"` → `null`
- Missing domain: `"user@"` → `null`
- Multiple @: `"user@@domain.com"` → `null`
- Null/empty: handle gracefully

---

### 3. Phone Normalizer

**Purpose:** Parse and standardize phone numbers to E.164 international format for reliable comparison.

**Module:** `src/core/normalizers/phone.ts`

**Note:** Consider using `libphonenumber-js` (lightweight version) for parsing. It handles international formats, country codes, and validation.

**Functions:**

```typescript
interface PhoneComponents {
  countryCode?: string   // E.164 country code (e.g., "1" for US)
  nationalNumber: string // National number without country code
  extension?: string     // Extension number if present
  e164: string          // Full E.164 format: +15551234567
}

interface PhoneNormalizerOptions {
  /** Default country code if not present in input (e.g., "US", "GB") */
  defaultCountry?: string
  /** Whether to extract extensions (default: true) */
  extractExtension?: boolean
  /** Format for output: 'e164' or 'components' (default: 'e164') */
  outputFormat?: 'e164' | 'components'
  /** Whether to validate phone number (default: true) */
  validate?: boolean
}

/**
 * Normalizes a phone number to E.164 format.
 */
function normalizePhone(
  value: unknown,
  options?: PhoneNormalizerOptions
): string | PhoneComponents | null

/**
 * Validates if a string looks like a phone number.
 */
function isValidPhone(phone: string, country?: string): boolean
```

**Implementation Details:**

1. **Using libphonenumber-js:**
   ```typescript
   import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

   function normalizePhone(value: unknown, options?: PhoneNormalizerOptions) {
     const str = String(value).trim()
     try {
       const phoneNumber = parsePhoneNumber(str, options?.defaultCountry)
       if (options?.validate && !phoneNumber.isValid()) {
         return null
       }
       return phoneNumber.format('E.164') // +15551234567
     } catch (error) {
       return null // Invalid phone number
     }
   }
   ```

2. **E.164 Format:**
   - International standard: `+[country code][national number]`
   - Example: `+15551234567` (US), `+442071234567` (UK)
   - No spaces, hyphens, or parentheses
   - Always starts with `+`

3. **Parsing Capabilities:**
   - Handles various input formats:
     - `"555-123-4567"` (US local)
     - `"(555) 123-4567"` (US formatted)
     - `"+1 555 123 4567"` (International with spaces)
     - `"1-555-123-4567"` (US with country code)
   - Extracts country code based on prefix or defaults to provided country
   - Removes all formatting characters

4. **Extensions:**
   - Detect: `ext.`, `extension`, `x`, after phone number
   - Example: `"555-1234 ext. 567"` → phone + extension
   - Store separately in components format

**Fallback Without libphonenumber-js:**
If not using the library, implement basic parsing:
- Strip all non-numeric characters (except `+`)
- Detect country code by prefix or use default
- Validate length (typical: 10-15 digits)
- Format to E.164

**Test Cases:**
- US local: `"555-123-4567"` with `defaultCountry: "US"` → `"+15551234567"`
- US formatted: `"(555) 123-4567"` → `"+15551234567"`
- International: `"+44 20 7123 4567"` → `"+442071234567"`
- With extension: `"555-1234 ext 567"` → parse separately
- Invalid: `"123"` → `null`
- Non-numeric: `"not-a-phone"` → `null`
- Different countries: UK, Germany, India, China formats
- Null/empty: handle gracefully

**Dependencies:**
- Add `libphonenumber-js` to `package.json` (lightweight, ~200kb)

---

### 4. Address Normalizer

**Purpose:** Parse and standardize physical addresses. Handles street addresses, cities, states, postal codes, and countries.

**Module:** `src/core/normalizers/address.ts`

**Functions:**

```typescript
interface AddressComponents {
  street?: string         // Street address (number + name)
  streetNumber?: string   // Street number only
  streetName?: string     // Street name only
  unit?: string          // Apartment/unit/suite number
  city?: string          // City name
  state?: string         // State/province (abbreviated if US/Canada)
  postalCode?: string    // ZIP/postal code (formatted)
  country?: string       // Country code (ISO 3166-1 alpha-2)
  full?: string          // Full normalized address
}

interface AddressNormalizerOptions {
  /** Default country if not specified (default: "US") */
  defaultCountry?: string
  /** Whether to abbreviate street types (Street → St) (default: true) */
  abbreviateStreetTypes?: boolean
  /** Whether to abbreviate state names (default: true) */
  abbreviateStates?: boolean
  /** Whether to normalize casing (default: true) */
  normalizeCase?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
}

/**
 * Normalizes a physical address.
 */
function normalizeAddress(
  value: unknown,
  options?: AddressNormalizerOptions
): string | AddressComponents | null

/**
 * Parses an address string into components.
 */
function parseAddressComponents(address: string): AddressComponents

/**
 * Abbreviates US state names (California → CA).
 */
function abbreviateState(state: string): string

/**
 * Abbreviates street types (Street → St, Avenue → Ave).
 */
function abbreviateStreetType(streetType: string): string
```

**Implementation Details:**

1. **Street Address Parsing:**
   - Extract street number: `123` from `"123 Main St"`
   - Extract street name: `Main` from `"123 Main St"`
   - Extract street type: `St`, `Ave`, `Blvd`, `Rd`, `Dr`, `Ln`, etc.
   - Detect unit/apartment: `Apt 4B`, `Unit 12`, `Suite 100`, `#2`

2. **Abbreviation Standards:**
   - Street types (USPS abbreviations):
     - Street → St, Avenue → Ave, Boulevard → Blvd
     - Road → Rd, Drive → Dr, Lane → Ln
     - Circle → Cir, Court → Ct, Place → Pl
   - Directionals: North → N, South → S, East → E, West → W
   - Unit types: Apartment → Apt, Suite → Ste, Building → Bldg

3. **State/Province:**
   - US states: Full name ↔ two-letter abbreviation
   - Example: `California` → `CA`, `New York` → `NY`
   - Map of all 50 states + DC
   - Canadian provinces: `Ontario` → `ON`, `British Columbia` → `BC`

4. **Postal Code:**
   - US ZIP: Format as `12345` or `12345-6789`
   - Canadian: Format as `A1B 2C3` (letter-number pattern)
   - UK postcode: Various formats (e.g., `SW1A 1AA`)
   - Normalize spacing and casing

5. **Parsing Strategy:**
   - Complex task—no single correct algorithm
   - Use heuristics based on patterns:
     - Street address usually comes first
     - City before state
     - State before postal code
     - Country last (if present)
   - Handle comma-delimited: `"123 Main St, New York, NY 10001"`
   - Handle newline-delimited:
     ```
     123 Main St
     Apt 4B
     New York, NY 10001
     ```

6. **Case Normalization:**
   - Title Case for city, street names: `new york` → `New York`
   - Uppercase for state abbreviations: `ca` → `CA`
   - Uppercase for postal codes in some countries

**Limitations (Document Clearly):**
- Address parsing is inherently ambiguous and complex
- This normalizer handles common US/Canada formats well
- International addresses may require country-specific logic
- Does NOT validate addresses against external databases (out of scope for v1)
- Does NOT perform geocoding or USPS verification

**Test Cases:**
- Simple: `"123 Main St, Anytown, CA 90210"` → parse components
- With unit: `"123 Main St Apt 4B, Anytown, CA 90210"` → include unit
- Full state name: `"123 Main St, Anytown, California 90210"` → abbreviate state
- Abbreviate street: `"123 Main Street"` → `"123 Main St"`
- Case: `"123 main st, anytown, ca 90210"` → normalize casing
- Newline format: multi-line address → parse correctly
- Missing components: partial addresses → handle gracefully
- Null/empty: handle gracefully

**Future Enhancement Ideas:**
- Integration with address validation APIs (Google, USPS, etc.)
- Geocoding to lat/long for distance-based matching
- International address format support (UK, EU, Asia)

---

### 5. Date Normalizer

**Purpose:** Parse various date formats into ISO 8601 standard format for consistent comparison. Handle partial dates.

**Module:** `src/core/normalizers/date.ts`

**Functions:**

```typescript
interface DateComponents {
  year?: number
  month?: number        // 1-12
  day?: number          // 1-31
  iso?: string          // ISO 8601: YYYY-MM-DD
  isPartial: boolean    // True if month or day is missing
}

interface DateNormalizerOptions {
  /** How to handle partial dates: 'preserve', 'reject', 'impute' (default: 'preserve') */
  partialDates?: 'preserve' | 'reject' | 'impute'
  /** Value to impute for missing day/month (default: 1) */
  imputeValue?: number
  /** Input format hint (e.g., 'MM/DD/YYYY', 'DD/MM/YYYY') (default: auto-detect) */
  inputFormat?: string
  /** Format for output: 'iso' or 'components' (default: 'iso') */
  outputFormat?: 'iso' | 'components'
}

/**
 * Normalizes a date value to ISO 8601 format.
 */
function normalizeDate(
  value: unknown,
  options?: DateNormalizerOptions
): string | DateComponents | null

/**
 * Parses a date string and returns components.
 */
function parseDateComponents(dateString: string): DateComponents

/**
 * Validates if a date is valid (checks month/day ranges).
 */
function isValidDate(year: number, month: number, day: number): boolean
```

**Implementation Details:**

1. **Input Formats to Support:**
   - ISO 8601: `2024-01-30`, `2024-01`, `2024`
   - US format: `01/30/2024`, `1/30/24`
   - EU format: `30/01/2024`, `30.01.2024`
   - Natural: `January 30, 2024`, `Jan 30 2024`
   - Unix timestamp: `1706630400` (seconds since epoch)
   - JavaScript Date object
   - Partial: `2024-01` (year-month), `2024` (year only)

2. **Parsing Strategy:**
   - Try ISO format first (most unambiguous)
   - Check for month names (January, Jan, etc.)
   - Use format hint if provided
   - For ambiguous formats (MM/DD vs DD/MM):
     - Default to US format (MM/DD/YYYY)
     - Allow override via `inputFormat` option
     - If day > 12, assume DD/MM
   - Handle two-digit years: `24` → `2024` (current century)

3. **Partial Dates:**
   - `preserve`: Keep as partial (year-month or year only)
     - Output: `2024-01` or `2024`
   - `reject`: Return null if not a complete date
   - `impute`: Fill missing values (default day/month = 1)
     - `2024-01` → `2024-01-01`
     - `2024` → `2024-01-01`

4. **Validation:**
   - Check month range: 1-12
   - Check day range based on month and leap years
   - Invalid dates → return null

5. **Output Format:**
   - ISO 8601 string: `2024-01-30` (default)
   - Components object: `{year: 2024, month: 1, day: 30}`

**Test Cases:**
- ISO format: `"2024-01-30"` → `"2024-01-30"`
- US format: `"01/30/2024"` → `"2024-01-30"`
- EU format: `"30/01/2024"` → `"2024-01-30"`
- Natural: `"January 30, 2024"` → `"2024-01-30"`
- Partial year-month: `"2024-01"` → preserve or impute
- Partial year: `"2024"` → preserve or impute
- Two-digit year: `"01/30/24"` → `"2024-01-30"`
- Invalid date: `"02/30/2024"` → `null` (Feb 30 doesn't exist)
- Invalid format: `"not-a-date"` → `null`
- Date object: `new Date('2024-01-30')` → `"2024-01-30"`
- Unix timestamp: `1706630400` → `"2024-01-30"`
- Null/empty: handle gracefully

**Dependencies:**
- Consider lightweight date parsing library (e.g., `date-fns/parse` or built-in `Date`)
- Avoid heavy libraries like `moment.js` (deprecated, large)

---

### 6. Basic Normalizers

**Purpose:** Simple, commonly-used normalizers for general string processing.

**Module:** `src/core/normalizers/basic.ts`

**Functions:**

```typescript
/**
 * Trims whitespace from both ends of a string.
 */
function trim(value: unknown): string | null

/**
 * Converts a string to lowercase.
 */
function lowercase(value: unknown): string | null

/**
 * Converts a string to uppercase.
 */
function uppercase(value: unknown): string | null

/**
 * Normalizes whitespace (collapse multiple spaces to one).
 */
function normalizeWhitespace(value: unknown): string | null

/**
 * Removes all non-alphanumeric characters.
 */
function alphanumericOnly(value: unknown): string | null

/**
 * Removes all non-numeric characters.
 */
function numericOnly(value: unknown): string | null
```

**Implementation Details:**
- Simple string transformations
- Handle null/undefined → return null
- Coerce non-strings to strings first
- Be defensive (no errors on unexpected input)

---

### 7. Custom Normalizers

**Purpose:** Allow users to define and register their own normalizers.

**Schema Integration:**

```typescript
// Option 1: Inline custom normalizer
const schema = {
  customField: {
    type: 'custom',
    customNormalizer: (value) => {
      // User-defined transformation
      return value.toString().trim().toLowerCase()
    }
  }
}

// Option 2: Register named normalizer
import { registerNormalizer } from 'have-we-met'

registerNormalizer('myNormalizer', (value) => {
  return value.toString().toUpperCase()
})

const schema = {
  customField: {
    type: 'custom',
    normalizer: 'myNormalizer'
  }
}
```

**Registry Implementation:**

```typescript
// src/core/normalizers/registry.ts

type NormalizerFunction = (value: unknown, options?: any) => unknown | null

const normalizerRegistry = new Map<string, NormalizerFunction>()

// Built-in normalizers
normalizerRegistry.set('name', normalizeName)
normalizerRegistry.set('email', normalizeEmail)
normalizerRegistry.set('phone', normalizePhone)
normalizerRegistry.set('address', normalizeAddress)
normalizerRegistry.set('date', normalizeDate)
normalizerRegistry.set('trim', trim)
normalizerRegistry.set('lowercase', lowercase)
normalizerRegistry.set('uppercase', uppercase)
normalizerRegistry.set('normalizeWhitespace', normalizeWhitespace)
normalizerRegistry.set('alphanumericOnly', alphanumericOnly)
normalizerRegistry.set('numericOnly', numericOnly)

export function registerNormalizer(name: string, fn: NormalizerFunction) {
  if (normalizerRegistry.has(name)) {
    console.warn(`Normalizer '${name}' is already registered. Overwriting.`)
  }
  normalizerRegistry.set(name, fn)
}

export function getNormalizer(name: string): NormalizerFunction | undefined {
  return normalizerRegistry.get(name)
}
```

---

## Engine Integration

### Applying Normalizers Before Comparison

The matching engine needs to apply normalizers before calling comparators.

**Update:** `src/core/engine.ts`

**Current Flow:**
```typescript
private compareField(
  left: unknown,
  right: unknown,
  config: FieldMatchConfig
): number {
  // Direct comparison
  let similarity = /* call comparator */
  return similarity
}
```

**New Flow:**
```typescript
private compareField(
  left: unknown,
  right: unknown,
  config: FieldMatchConfig,
  fieldName: string
): number {
  // 1. Apply normalization if configured
  const normalizedLeft = this.normalizeValue(left, fieldName)
  const normalizedRight = this.normalizeValue(right, fieldName)

  // 2. Compare normalized values
  let similarity = /* call comparator with normalizedLeft/Right */

  return similarity
}

private normalizeValue(value: unknown, fieldName: string): unknown {
  const fieldDef = this.config.schema[fieldName]
  if (!fieldDef) return value

  // Option 1: Custom normalizer function
  if (fieldDef.customNormalizer) {
    try {
      return fieldDef.customNormalizer(value)
    } catch (error) {
      console.warn(`Custom normalizer failed for field ${fieldName}:`, error)
      return value
    }
  }

  // Option 2: Named normalizer from registry
  if (fieldDef.normalizer) {
    const normalizerFn = getNormalizer(fieldDef.normalizer)
    if (normalizerFn) {
      try {
        return normalizerFn(value, fieldDef.normalizerOptions)
      } catch (error) {
        console.warn(`Normalizer '${fieldDef.normalizer}' failed for field ${fieldName}:`, error)
        return value
      }
    } else {
      console.warn(`Normalizer '${fieldDef.normalizer}' not found for field ${fieldName}`)
    }
  }

  // No normalization configured
  return value
}
```

**Type Updates:**

`src/types/schema.ts` already has:
- `normalizer?: string` - Name of registered normalizer
- `customNormalizer?: (value: unknown) => unknown` - Inline function

Add:
- `normalizerOptions?: any` - Options to pass to the normalizer

**Updated FieldDefinition:**
```typescript
export interface FieldDefinition {
  type: FieldType
  component?: string
  required?: boolean
  normalizer?: string
  normalizerOptions?: any  // <-- Add this
  customNormalizer?: (value: unknown) => unknown
}
```

---

## Implementation Tickets

### Ticket 1: Core Normalization Infrastructure

**Estimated Complexity:** Low-Medium

**Files to Create:**
- `src/core/normalizers/registry.ts` - Normalizer registry and management
- `src/core/normalizers/types.ts` - Shared types and interfaces

**Files to Modify:**
- `src/types/schema.ts` - Add `normalizerOptions` field
- `src/index.ts` - Export normalizer functions and registry

**Implementation Steps:**

1. Create normalizer registry:
   - Map-based registry: `Map<string, NormalizerFunction>`
   - `registerNormalizer(name, fn)` function
   - `getNormalizer(name)` function
   - `listNormalizers()` function for introspection

2. Define shared types:
   ```typescript
   export type NormalizerFunction<TOptions = any> = (
     value: unknown,
     options?: TOptions
   ) => unknown | null

   export interface NormalizerMetadata {
     name: string
     description: string
     supportedTypes: FieldType[]
   }
   ```

3. Update `FieldDefinition` interface:
   - Add `normalizerOptions?: any` field

4. Create utility functions:
   - `applyNormalizer(value, normalizerName, options)` - Apply a named normalizer
   - `composeNormalizers(...normalizers)` - Chain multiple normalizers

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/registry.test.ts`:
  - Register normalizers
  - Get registered normalizers
  - Overwrite existing normalizers (with warning)
  - Get non-existent normalizer returns undefined
  - List all registered normalizers
  - Compose multiple normalizers

**Acceptance Criteria:**
- Registry functions work correctly
- Built-in normalizers can be registered and retrieved
- User-defined normalizers can be added
- All tests pass with 100% coverage

---

### Ticket 2: Basic String Normalizers

**Estimated Complexity:** Low

**Files to Create:**
- `src/core/normalizers/basic.ts` - Basic string normalizers

**Implementation Steps:**

1. Implement functions:
   - `trim(value)` - Trim whitespace
   - `lowercase(value)` - Convert to lowercase
   - `uppercase(value)` - Convert to uppercase
   - `normalizeWhitespace(value)` - Collapse multiple spaces
   - `alphanumericOnly(value)` - Remove non-alphanumeric
   - `numericOnly(value)` - Remove non-numeric

2. Register in registry:
   - Auto-register on module import

3. Add JSDoc with examples

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/basic.test.ts`:
  - Each function with typical inputs
  - Null/undefined handling
  - Non-string inputs (coercion)
  - Empty strings
  - Special characters
  - Unicode characters

**Acceptance Criteria:**
- All functions handle edge cases gracefully
- Return null for null/undefined
- All tests pass with 100% coverage

---

### Ticket 3: Name Normalizer

**Estimated Complexity:** Medium-High

**Files to Create:**
- `src/core/normalizers/name.ts` - Name parsing and normalization

**Implementation Steps:**

1. Create title/suffix recognition lists:
   - Common titles array
   - Common suffixes array
   - Case-insensitive matching

2. Implement `parseNameComponents(name)`:
   - Detect and extract titles
   - Detect and extract suffixes
   - Split remaining into components
   - Handle special cases (hyphens, apostrophes)

3. Implement `normalizeName(value, options)`:
   - Call parser
   - Apply casing rules
   - Normalize whitespace
   - Return full string or components

4. Add special casing rules:
   - McGregor, O'Brien, etc.
   - von, de, van prefixes

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/name.test.ts`:
  - Simple names (first + last)
  - Names with titles
  - Names with suffixes
  - Names with middle names
  - Compound names (hyphenated)
  - Names with apostrophes
  - Multiple titles/suffixes
  - All uppercase/lowercase input
  - Extra whitespace
  - Edge cases: single name, empty, null

**Acceptance Criteria:**
- Correctly parses common name formats
- Handles titles and suffixes
- Normalizes casing appropriately
- All tests pass with 100% coverage
- JSDoc includes usage examples

---

### Ticket 4: Email Normalizer

**Estimated Complexity:** Low-Medium

**Files to Create:**
- `src/core/normalizers/email.ts` - Email normalization

**Implementation Steps:**

1. Implement `isValidEmail(email)`:
   - Basic regex validation
   - Check for @ symbol
   - Check local and domain parts

2. Implement `normalizeEmail(value, options)`:
   - Trim whitespace
   - Convert to lowercase
   - Split on @
   - Handle plus-addressing if option enabled
   - Handle Gmail dots if option enabled
   - Validate format if option enabled
   - Return full string or components

3. Add JSDoc with examples

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/email.test.ts`:
  - Basic emails
  - Various casing
  - Whitespace trimming
  - Plus-addressing removal
  - Gmail dot normalization
  - Invalid formats
  - Missing @ symbol
  - Multiple @ symbols
  - Null/empty

**Acceptance Criteria:**
- Correctly normalizes common email formats
- Plus-addressing option works
- Validation catches obvious errors
- All tests pass with 100% coverage

---

### Ticket 5: Phone Normalizer

**Estimated Complexity:** Medium

**Files to Create:**
- `src/core/normalizers/phone.ts` - Phone number normalization

**Dependencies:**
- Add `libphonenumber-js` to `package.json`

**Implementation Steps:**

1. Install and import libphonenumber-js:
   ```bash
   npm install libphonenumber-js
   ```

2. Implement `normalizePhone(value, options)`:
   - Use `parsePhoneNumber(value, defaultCountry)`
   - Handle parse errors gracefully
   - Validate if option enabled
   - Format to E.164
   - Extract extension if present
   - Return E.164 string or components

3. Implement fallback for basic parsing (if library fails):
   - Strip non-numeric
   - Detect country code
   - Validate length
   - Format to E.164

4. Add JSDoc with examples

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/phone.test.ts`:
  - US local numbers with default country
  - US formatted numbers
  - International numbers
  - Numbers with country codes
  - Numbers with extensions
  - Various formatting (spaces, hyphens, parentheses)
  - Invalid numbers (too short, non-numeric)
  - Different countries (US, UK, Germany, India)
  - Null/empty

**Acceptance Criteria:**
- Correctly parses common phone formats
- Outputs E.164 format
- Handles international numbers
- libphonenumber-js integrated successfully
- All tests pass with 100% coverage

---

### Ticket 6: Address Normalizer

**Estimated Complexity:** High

**Files to Create:**
- `src/core/normalizers/address.ts` - Address parsing and normalization
- `src/core/normalizers/address-data.ts` - Lookup tables (states, abbreviations, etc.)

**Implementation Steps:**

1. Create lookup tables in `address-data.ts`:
   - US states: full name ↔ abbreviation map
   - Canadian provinces: full name ↔ abbreviation map
   - Street type abbreviations (Street → St, Avenue → Ave, etc.)
   - Directional abbreviations (North → N, etc.)
   - Unit type abbreviations (Apartment → Apt, etc.)

2. Implement helper functions:
   - `abbreviateState(state)` - Convert state names to abbreviations
   - `abbreviateStreetType(type)` - Abbreviate street types
   - `parseAddressComponents(address)` - Parse string into components

3. Implement `normalizeAddress(value, options)`:
   - Parse address string
   - Apply abbreviations if options enabled
   - Normalize casing
   - Format output

4. Parsing strategy:
   - Detect patterns (street, city, state, ZIP)
   - Handle comma-delimited
   - Handle newline-delimited
   - Extract unit/apartment numbers

5. Add JSDoc with examples and limitations

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/address.test.ts`:
  - Simple addresses (street, city, state, ZIP)
  - Addresses with apartment/unit numbers
  - Full state names (abbreviate to codes)
  - Full street type names (abbreviate)
  - Various formats (comma-delimited, newline-delimited)
  - Case normalization
  - Partial addresses (missing components)
  - Canadian addresses
  - Null/empty
  - Edge cases (ambiguous parsing)

**Acceptance Criteria:**
- Correctly parses common US address formats
- Abbreviations work correctly
- Case normalization works
- Handles partial addresses gracefully
- All tests pass with 100% coverage
- Documentation clearly states limitations

**Note:** Address parsing is complex and ambiguous. Document limitations clearly. This is a "best effort" implementation for common formats.

---

### Ticket 7: Date Normalizer

**Estimated Complexity:** Medium

**Files to Create:**
- `src/core/normalizers/date.ts` - Date parsing and normalization

**Implementation Steps:**

1. Implement date parsing:
   - Detect format (ISO, US, EU, natural)
   - Parse components (year, month, day)
   - Handle two-digit years (assume 20xx)
   - Handle partial dates (year only, year-month)

2. Implement `parseDateComponents(dateString)`:
   - Try ISO format first
   - Try US format (MM/DD/YYYY)
   - Try EU format (DD/MM/YYYY)
   - Try natural format (January 30, 2024)
   - Handle Unix timestamps
   - Handle Date objects
   - Return components

3. Implement `isValidDate(year, month, day)`:
   - Check month range (1-12)
   - Check day range (1-31)
   - Handle leap years

4. Implement `normalizeDate(value, options)`:
   - Parse input
   - Validate date
   - Handle partial dates per options
   - Format to ISO 8601
   - Return ISO string or components

5. Add JSDoc with examples

**Testing Requirements:**
- Unit tests in `tests/unit/normalizers/date.test.ts`:
  - ISO format dates
  - US format (MM/DD/YYYY)
  - EU format (DD/MM/YYYY)
  - Natural format (January 30, 2024)
  - Partial dates (year-month, year only)
  - Two-digit years
  - Date objects
  - Unix timestamps
  - Invalid dates (Feb 30, month 13, day 32)
  - Invalid formats
  - Null/empty
  - Partial date handling options (preserve, reject, impute)

**Acceptance Criteria:**
- Correctly parses common date formats
- Validates dates (catches Feb 30, etc.)
- Outputs ISO 8601 format
- Partial date handling works
- All tests pass with 100% coverage

**Dependencies:**
- Consider using `date-fns/parse` for robust parsing (optional)

---

### Ticket 8: Engine Integration

**Estimated Complexity:** Medium

**Files to Modify:**
- `src/core/engine.ts` - Apply normalizers before comparison
- `src/core/resolver.ts` - Ensure normalization flows through resolve calls

**Implementation Steps:**

1. Update `MatchingEngine` class:
   - Add `normalizeValue(value, fieldName)` private method
   - Update `compareField()` to call `normalizeValue()` before comparison
   - Handle errors gracefully (log warnings, continue with original value)

2. Implement `normalizeValue()`:
   - Check if field has `customNormalizer` → apply it
   - Check if field has `normalizer` name → get from registry and apply
   - Pass `normalizerOptions` to normalizer function
   - Catch and log errors, return original value on failure

3. Update method signatures if needed:
   - Pass field name to `compareField()` if not already available

4. Add normalization to explanation/audit trail:
   - Include normalized values in field comparison details

**Testing Requirements:**
- Integration tests in `tests/integration/normalization.test.ts`:
  - Configure schema with named normalizers
  - Configure schema with custom normalizers
  - Test full matching workflow with normalization
  - Verify normalized values are compared (not raw values)
  - Test error handling (normalizer throws error)
  - Test non-existent normalizer (warning logged, original value used)
- Update existing integration tests to handle normalization:
  - Tests should pass with normalization enabled
  - Add tests for specific normalizer + comparator combinations

**Acceptance Criteria:**
- Normalizers applied before field comparison
- Custom normalizers work
- Named normalizers work
- Normalizer options passed correctly
- Errors handled gracefully
- All tests pass with 100% coverage

---

### Ticket 9: Builder API Support

**Estimated Complexity:** Low-Medium

**Files to Modify:**
- `src/builder/schema-builder.ts` - Add normalizer configuration methods

**Implementation Steps:**

1. Add methods to `SchemaBuilder` (or wherever schema is configured):
   ```typescript
   .field('email')
     .type('email')
     .normalizer('email', { removePlusAddressing: true })

   .field('customField')
     .type('custom')
     .customNormalizer((value) => value.toString().trim())
   ```

2. Ensure fluent API supports:
   - Setting normalizer name
   - Setting normalizer options
   - Setting custom normalizer function

3. Update TypeScript types for type inference

4. Add JSDoc examples

**Testing Requirements:**
- Integration tests in `tests/integration/builder-normalizers.test.ts`:
  - Configure normalizers via builder API
  - Configure normalizer options
  - Configure custom normalizers
  - Verify configuration flows through to engine
  - Test type inference and autocomplete

**Acceptance Criteria:**
- All normalizers configurable via builder API
- Type inference works correctly
- Examples in JSDoc demonstrate usage
- All tests pass

---

### Ticket 10: Normalizer Documentation

**Estimated Complexity:** Medium

**Files to Create:**
- `docs/normalizers/overview.md` - Normalizer overview and guide
- `docs/normalizers/name.md` - Name normalizer reference
- `docs/normalizers/email.md` - Email normalizer reference
- `docs/normalizers/phone.md` - Phone normalizer reference
- `docs/normalizers/address.md` - Address normalizer reference
- `docs/normalizers/date.md` - Date normalizer reference
- `docs/normalizers/custom.md` - Custom normalizer guide

**Content to Include:**

1. **Overview Document** (`overview.md`):
   - What are normalizers and why use them
   - When to apply normalization
   - How normalizers integrate with matching
   - How to configure normalizers in schema
   - How to use custom normalizers
   - Performance considerations

2. **Per-Normalizer Reference Docs:**
   - Purpose and use cases
   - Options reference (all available options)
   - Code examples (schema config + builder API)
   - Input/output examples
   - Common pitfalls
   - Performance characteristics

3. **Custom Normalizer Guide:**
   - How to write a custom normalizer
   - Normalizer function signature
   - Best practices (handle null, be idempotent, etc.)
   - How to register custom normalizers
   - How to compose normalizers
   - Examples: domain-specific normalizers

4. **Selection Guide:**
   - Decision tree: which normalizer to use for which field
   - Combining normalizers with comparators (recommended pairs)
   - Configuration examples for common use cases:
     - Customer data (name, email, phone)
     - Patient data (name, DOB, address)
     - Contact records (name, phone, email, address)

**Testing:**
- Verify all code examples work
- Ensure examples match actual API

**Acceptance Criteria:**
- All normalizers documented
- Code examples tested and working
- Clear guidance on when to use each normalizer
- Documentation linked from main README.md

---

### Ticket 11: Integration Tests and Examples

**Estimated Complexity:** Medium

**Files to Create:**
- `tests/integration/normalizers-full-workflow.test.ts` - End-to-end tests
- `examples/normalizers/customer-matching.ts` - Example: customer data with normalizers
- `examples/normalizers/patient-matching.ts` - Example: patient data with normalizers

**Implementation Steps:**

1. Create comprehensive integration tests:
   - Configure resolver with multiple normalizers
   - Test full workflow: schema → normalize → compare → score → outcome
   - Test combinations:
     - Name normalizer + Jaro-Winkler comparator
     - Email normalizer + exact match
     - Phone normalizer + exact match
     - Address normalizer + Levenshtein
     - Date normalizer + exact match
   - Test real-world scenarios:
     - Records with slight variations (typos, casing, formatting)
     - Records that should match after normalization
     - Records that should not match even after normalization

2. Create example applications:
   - Customer matching: demonstrate name, email, phone normalizers
   - Patient matching: demonstrate name, DOB, address normalizers
   - Show best practices and recommended configurations

**Testing Requirements:**
- Integration tests cover:
  - All normalizers in action
  - Normalizer + comparator combinations
  - Full resolver workflow
  - Edge cases and error handling

**Acceptance Criteria:**
- All integration tests pass
- Examples run successfully
- Examples demonstrate best practices
- Code is well-commented and instructive

---

## Testing Strategy

### Unit Test Organization

Organize tests by normalizer:

```
tests/unit/normalizers/
├── registry.test.ts      # Registry functions
├── basic.test.ts         # Basic string normalizers
├── name.test.ts          # Name normalizer
├── email.test.ts         # Email normalizer
├── phone.test.ts         # Phone normalizer
├── address.test.ts       # Address normalizer
└── date.test.ts          # Date normalizer
```

### Integration Test Organization

```
tests/integration/
├── normalization.test.ts                # Engine integration
├── builder-normalizers.test.ts          # Builder API
└── normalizers-full-workflow.test.ts    # End-to-end workflows
```

### Coverage Goals

- Maintain 100% coverage on all normalizer implementations
- Maintain 100% coverage on registry and integration code
- Overall project coverage remains > 95%

### Edge Case Testing

Every normalizer must be tested for:
- Null input → returns null
- Undefined input → returns null
- Empty string → appropriate handling
- Malformed input → returns null (graceful degradation)
- Valid input with variations → correct normalization
- Unicode/special characters → handled appropriately

---

## Development Workflow

### Recommended Implementation Order

1. **Ticket 1** - Core Infrastructure (unblocks all normalizers)
2. **Ticket 2** - Basic Normalizers (simple, establishes pattern)
3. **Ticket 3** - Name Normalizer (medium complexity, high value)
4. **Ticket 4** - Email Normalizer (low complexity, high value)
5. **Ticket 5** - Phone Normalizer (medium complexity, external dependency)
6. **Ticket 7** - Date Normalizer (before address for simpler testing)
7. **Ticket 6** - Address Normalizer (most complex, saved for later)
8. **Ticket 8** - Engine Integration (unblocks usage)
9. **Ticket 9** - Builder API (enables configuration)
10. **Ticket 10** - Documentation (completes reference material)
11. **Ticket 11** - Integration Tests & Examples (validates everything works)

### Parallelization Strategy

Phase 3 has significant opportunities for parallel development, particularly in the normalizer implementation tickets.

#### Dependency Graph

```
Ticket 1 (Core Infrastructure)
    ↓
    ├─→ Ticket 2 (Basic Normalizers) ────┐
    ├─→ Ticket 3 (Name Normalizer) ──────┤
    ├─→ Ticket 4 (Email Normalizer) ─────┤
    ├─→ Ticket 5 (Phone Normalizer) ─────┼─→ Ticket 8 (Engine Integration)
    ├─→ Ticket 6 (Address Normalizer) ───┤       ↓
    └─→ Ticket 7 (Date Normalizer) ──────┘       ├─→ Ticket 9 (Builder API)
                                                  │        ↓
                                                  └─→ Ticket 10 (Documentation)
                                                           ↓
                                                  Ticket 11 (Integration Tests)
```

#### Parallel Execution Phases

**Phase 1: Foundation (Sequential)**
- **Ticket 1** must complete first - it creates the registry and types that all other tickets depend on

**Phase 2: Normalizers (Highly Parallel) ⚡**

Once Ticket 1 is complete, **Tickets 2-7 can all be done in parallel**:
- Ticket 2: Basic Normalizers
- Ticket 3: Name Normalizer
- Ticket 4: Email Normalizer
- Ticket 5: Phone Normalizer
- Ticket 6: Address Normalizer
- Ticket 7: Date Normalizer

These are completely independent—they only depend on the registry from Ticket 1. No shared code between normalizers.

**Suggested Priority Within Parallel Group:**
1. **High Priority** (most commonly used): Ticket 4 (Email), Ticket 3 (Name)
2. **Medium Priority**: Ticket 5 (Phone), Ticket 7 (Date)
3. **Lower Priority**: Ticket 2 (Basic - simple), Ticket 6 (Address - complex but less critical)

**Phase 3: Integration (Some Parallelism)**
- **Ticket 8** (Engine Integration) and **Ticket 9** (Builder API) can be done in parallel by different developers
- However, there's a logical dependency: engine integration should inform builder API design
- Solo developers should do Ticket 8 first, then Ticket 9

**Phase 4: Documentation & Testing**
- **Ticket 10** (Documentation) can start as soon as individual normalizers are complete
  - Don't wait for all normalizers—document each as it's finished
  - Parallelize: One dev writes docs while another implements remaining normalizers
- **Ticket 11** (Integration Tests) requires Tickets 1-9 complete

#### Multi-Developer Sprint Plan

**Sprint 1 (1 week):**
- **Developer 1**: Ticket 1 (Core Infrastructure) - 2 days
  - Then: Ticket 3 (Name) - 2 days
  - Then: Ticket 4 (Email) - 1 day
- **Developer 2** (waits for Ticket 1): Ticket 5 (Phone) - 2 days
  - Then: Ticket 7 (Date) - 2 days
- **Developer 3** (waits for Ticket 1): Ticket 2 (Basic) - 1 day
  - Then: Ticket 6 (Address) - 3 days

**Sprint 2 (1 week):**
- **Developer 1**: Ticket 8 (Engine Integration) - 2 days
  - Then: Start Ticket 10 (Documentation) for completed normalizers
- **Developer 2**: Ticket 9 (Builder API) - 2 days
  - Then: Continue Ticket 10 (Documentation)
- **Developer 3**: Finish Ticket 6 if needed
  - Then: Ticket 10 (Documentation)

**Sprint 3:**
- **Any Developer**: Ticket 11 (Integration Tests & Examples) - 2 days
- **Team**: Final polish and review

**Total Time with 3 Developers: ~2.5 weeks**

#### Solo Developer Timeline

**Week 1:**
- Day 1: Ticket 1 (Core Infrastructure)
- Day 2: Ticket 2 (Basic) + Ticket 4 (Email)
- Day 3-4: Ticket 3 (Name)
- Day 5: Ticket 7 (Date)

**Week 2:**
- Day 1-2: Ticket 5 (Phone)
- Day 3-5: Ticket 6 (Address)

**Week 3:**
- Day 1-2: Ticket 8 (Engine Integration)
- Day 3: Ticket 9 (Builder API)
- Day 4-5: Ticket 10 (Documentation)

**Week 4:**
- Day 1-2: Ticket 11 (Integration Tests)
- Day 3-5: Buffer for polish, bug fixes, and review

**Total Time Solo: ~3.5-4 weeks**

#### Key Insight for Planning

The biggest parallelization opportunity is in **Tickets 2-7** (normalizer implementations). With adequate team size:
- **3 developers** can complete all normalizers in ~1 week (vs. 2 weeks solo)
- **6 developers** can complete all normalizers in ~3-4 days (diminishing returns beyond this)

Since normalizers represent ~60% of the work in Phase 3, parallelizing this section can significantly reduce overall timeline.

### Per-Ticket Workflow

1. Create feature branch: `phase-3/ticket-N-description`
2. Implement normalizer with tests (TDD approach recommended)
3. Verify 100% coverage: `npm run test:coverage`
4. Verify types: `npm run lint`
5. Verify build: `npm run build`
6. Manual testing: Try normalizer with sample data
7. Commit: `feat(phase-3): implement [normalizer name]`
8. Merge to main after verification

### Integration Points

- **After Ticket 1**: Infrastructure ready, normalizer development can proceed in parallel
- **After Tickets 2-7**: All normalizers implemented (can complete in any order)
- **After Ticket 8**: Normalizers usable via engine
- **After Ticket 9**: Normalizers configurable via builder
- **After Ticket 10**: Documentation complete
- **After Ticket 11**: Examples and integration tests complete = **Phase 3 Complete**

**Merge Strategy for Parallel Work:**
- Tickets 2-7 should each be developed in separate feature branches
- Can be merged to main independently as each completes
- No merge conflicts expected (separate files)
- Continuous integration will validate each normalizer independently

---

## Performance Considerations

### Normalization Performance

**Targets:**
- Basic normalizers (trim, lowercase, etc.): < 0.001ms
- Name normalizer: < 0.5ms
- Email normalizer: < 0.1ms
- Phone normalizer: < 1ms (using libphonenumber-js)
- Address normalizer: < 2ms (complex parsing)
- Date normalizer: < 0.5ms

**Optimization Opportunities:**

**For Phase 3:**
- Memoization: Cache normalized values for repeated comparisons
- Lazy evaluation: Only normalize when field is actually compared
- Fail fast: Return early for null/invalid input

**For Future Phases:**
- Pre-compute: Normalize and store normalized values in database
- Batch normalization: Process many records at once for batch operations
- Parallel processing: Normalize multiple fields concurrently

### Impact on Matching Performance

- Normalization adds overhead before comparison
- For real-time matching: < 5ms additional latency acceptable
- For batch processing: Parallelization can offset normalization cost
- Blocking (Phase 4) reduces number of comparisons, offsetting normalization cost

---

## Dependencies

### New Dependencies

1. **libphonenumber-js** (Phone normalizer)
   - Lightweight phone parsing library (~200KB)
   - Handles international formats and validation
   - Add to `package.json`: `"libphonenumber-js": "^1.10.x"`

2. **date-fns** (Optional for date parsing)
   - Lightweight date utilities
   - Only if built-in Date parsing proves insufficient
   - Tree-shakeable (only import what we need)
   - Add if needed: `"date-fns": "^3.x"`

### Dependency Management

- Keep dependencies minimal
- Prefer zero-dependency implementations where reasonable
- Document why each dependency was chosen
- Consider bundle size impact

---

## Notes for Future Phases

### Phase 4: Blocking Strategies

Normalizers will enhance blocking:
- Phonetic codes (Soundex/Metaphone) for name-based blocking
- Extract first letter of normalized last name for blocking
- Normalize postal codes for geographic blocking
- Extract year from normalized date for DOB-based blocking

**Recommendation:** Pre-compute normalized values + blocking keys during data ingestion for performance.

### Phase 5: Probabilistic Matching

Normalizers improve match quality:
- Reduce false negatives caused by formatting differences
- Enable higher thresholds (fewer false positives)
- More consistent scoring across records

**Field Weight Adjustments:**
- Exact match on normalized email: Higher weight (now more reliable)
- Exact match on normalized phone: Higher weight
- Fuzzy match on normalized name: Can use stricter threshold

### Phase 6: Database Adapters

Consider storing normalized values:
- Option 1: Normalize on-the-fly during matching (current approach)
- Option 2: Pre-compute and store normalized values in DB
- Option 3: Hybrid: Store some normalized values (blocking keys), compute others on-the-fly

**Trade-offs:**
- Pre-computed: Faster matching, more storage, stale if normalization logic changes
- On-the-fly: Slower matching, less storage, always up-to-date

### Phase 8: Golden Record Management

Normalizers inform merge strategies:
- Prefer normalized values in golden record
- When merging emails: Use normalized, deduplicated values
- When merging phone numbers: Use E.164 format consistently

---

## Open Questions

### Address Parsing Depth

**Question:** How deep should address parsing go?
- **Option 1:** Basic parsing (current plan) - handles common US formats
- **Option 2:** Full USPS compliance - complex, US-only
- **Option 3:** External service integration - depends on API

**Decision for Phase 3:** Implement Option 1 (basic parsing). Document limitations. External service integration can come in Phase 9.

### International Support

**Question:** Should normalizers support non-English data?
- Name normalizer: Currently English-focused
- Address normalizer: Currently US/Canada-focused
- Phone normalizer: International via libphonenumber-js ✓
- Date normalizer: Format-agnostic (works for all locales)

**Decision for Phase 3:** Document as primarily English/US-focused. International expansion is out of scope for v1 but can be added later.

### Normalization Options in Schema vs. Field Config

**Question:** Where should normalizer options live?
- **Option 1:** In schema definition (current plan)
  ```typescript
  schema: { email: { type: 'email', normalizer: 'email', normalizerOptions: {...} } }
  ```
- **Option 2:** In field match config
  ```typescript
  matching: { fields: { email: { ..., normalizerOptions: {...} } } }
  ```

**Decision for Phase 3:** Option 1 (schema definition). Normalization is a property of the field itself, not the matching strategy.

### Normalizer Chaining

**Question:** Should we support chaining multiple normalizers?
```typescript
schema: {
  name: {
    type: 'name',
    normalizers: ['trim', 'lowercase', 'name']  // Apply in sequence
  }
}
```

**Decision for Phase 3:** Not in initial implementation. Single normalizer per field is sufficient. Chaining can be added later if needed (Ticket 1 has `composeNormalizers()` for future use).

### Caching Normalized Values

**Question:** Should normalized values be cached during a matching operation?
- **Benefit:** Avoid re-normalizing the same value multiple times
- **Cost:** Memory overhead, cache management complexity

**Decision for Phase 3:** Not in initial implementation. Profile performance first. Add caching if normalization becomes a bottleneck.

---

## Success Checklist

Phase 3 is complete when:

- [ ] Core infrastructure (registry, types) implemented
- [ ] All normalizers implemented (name, email, phone, address, date, basic)
- [ ] Normalizers integrated into matching engine
- [ ] Builder API supports normalizer configuration
- [ ] Custom normalizer support working
- [ ] libphonenumber-js dependency added and integrated
- [ ] Test coverage maintained at 100% on implementation files
- [ ] All builds passing (ESM + CJS)
- [ ] Documentation complete (overview + per-normalizer guides)
- [ ] Integration tests and examples working
- [ ] All 11 tickets completed and merged
- [ ] Update PLAN.md with Phase 3 completion status

---

## Risk Mitigation

### Complexity Risks

**Risk:** Address parsing is complex and ambiguous
**Mitigation:**
- Document limitations clearly
- Handle common formats well, graceful degradation for edge cases
- Provide custom normalizer option for domain-specific needs

**Risk:** Phone parsing depends on external library
**Mitigation:**
- Use well-maintained library (libphonenumber-js)
- Implement fallback basic parsing if library fails
- Document dependency and licensing

**Risk:** Date format detection is ambiguous (MM/DD vs DD/MM)
**Mitigation:**
- Default to common format (US: MM/DD)
- Allow format hint via options
- Document ambiguity and recommend ISO format for input

### Performance Risks

**Risk:** Normalization adds latency to every comparison
**Mitigation:**
- Set performance targets for each normalizer
- Benchmark after implementation
- Consider caching if needed
- Phase 4 blocking will reduce number of comparisons

**Risk:** Complex normalizers (address, phone) may be slow
**Mitigation:**
- Profile and optimize hot paths
- Consider pre-computing normalized values in future phases
- Document performance characteristics

### Compatibility Risks

**Risk:** Normalizers may not handle all edge cases
**Mitigation:**
- Extensive edge case testing
- Graceful degradation (return null, log warning, continue)
- Never throw errors that break matching

---

*This plan will be updated with completion notes and learnings as implementation progresses.*
