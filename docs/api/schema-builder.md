# Schema Builder API Reference

The Schema Builder configures your record structure, defining fields with their semantic types, normalizers, and validation rules.

## Entry Point

Access the schema builder through `HaveWeMet.create()` or `HaveWeMet.schema()`:

```typescript
import { HaveWeMet } from 'have-we-met';

// Option 1: Through create()
const resolver = HaveWeMet
  .create<Person>()
  .schema(schema => schema
    .field('email').type('email')
    .field('firstName').type('name').component('first')
  )
  // ... continue configuration

// Option 2: Direct schema (shortcut)
const resolver = HaveWeMet
  .schema<Person>({
    email: { type: 'email' },
    firstName: { type: 'name', component: 'first' }
  })
  // ... continue configuration
```

## SchemaBuilder<T>

Main builder class for configuring record schemas.

### Methods

#### `field<K>(name: K): FieldDefinitionBuilder<T>`

Start configuring a field using the fluent builder.

**Parameters:**
- `name: K` - Field name from your record type (type-safe)

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
schema => schema
  .field('email')  // Returns FieldDefinitionBuilder
  .type('email')   // Configure the field
```

#### `field<K>(name: K, definition: FieldDefinition): this`

Configure a field with a direct definition object (backward compatible).

**Parameters:**
- `name: K` - Field name from your record type
- `definition: FieldDefinition` - Field configuration object

**Returns:** `SchemaBuilder<T>` for chaining

**Example:**
```typescript
schema => schema
  .field('email', { type: 'email', required: true })
  .field('phone', { type: 'phone', normalizer: 'phone' })
```

#### `build(): SchemaDefinition<T>`

Build and return the final schema definition.

**Returns:** `SchemaDefinition<T>` - The complete schema configuration

---

## FieldDefinitionBuilder<T>

Fluent builder for configuring individual field properties.

### Methods

#### `type(type: FieldType): this`

Set the semantic field type.

**Parameters:**
- `type: FieldType` - One of: `'name'`, `'email'`, `'phone'`, `'date'`, `'address'`, `'string'`, `'number'`, `'custom'`

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('email').type('email')
.field('dateOfBirth').type('date')
.field('customId').type('custom')
```

#### `component(component: string): this`

Set the component name for composite field types (e.g., name parts).

**Parameters:**
- `component: string` - Component identifier (e.g., `'first'`, `'last'`, `'middle'`, `'suffix'`)

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('firstName').type('name').component('first')
.field('lastName').type('name').component('last')
.field('street').type('address').component('street')
```

#### `required(required?: boolean): this`

Mark field as required for matching. Required fields that are null/undefined will affect match scoring.

**Parameters:**
- `required: boolean` - Whether the field is required (default: `true`)

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('ssn').type('string').required()
.field('middleName').type('name').component('middle').required(false)
```

#### `normalizer(name: string, options?: any): this`

Apply a named normalizer to the field value before comparison.

**Parameters:**
- `name: string` - Normalizer name (see [Available Normalizers](#available-normalizers))
- `options?: any` - Normalizer-specific options

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('email').type('email').normalizer('email')
.field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
.field('name').type('name').normalizer('name', { removeTitles: true })
```

#### `normalizerOptions(options: any): this`

Set options for an already-configured normalizer.

**Parameters:**
- `options: any` - Normalizer-specific options

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('phone')
  .type('phone')
  .normalizer('phone')
  .normalizerOptions({ defaultCountry: 'GB', format: 'e164' })
```

#### `customNormalizer(fn: (value: unknown) => unknown): this`

Apply a custom normalizer function.

**Parameters:**
- `fn: (value: unknown) => unknown` - Custom normalization function

**Returns:** `FieldDefinitionBuilder<T>` for chaining

**Example:**
```typescript
.field('customId')
  .type('string')
  .customNormalizer(value => {
    if (typeof value !== 'string') return value;
    return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  })
```

#### `field<K>(name: K): FieldDefinitionBuilder<T>`

Configure another field (returns to schema context).

**Parameters:**
- `name: K` - Field name from your record type

**Returns:** `FieldDefinitionBuilder<T>` for the new field

**Example:**
```typescript
schema => schema
  .field('email').type('email')
  .field('phone').type('phone')  // Switch to configuring phone
  .field('name').type('name')    // Switch to configuring name
```

#### `build(): SchemaDefinition<T>`

Complete schema configuration and return the definition.

**Returns:** `SchemaDefinition<T>` - The complete schema configuration

---

## Field Types

| Type | Description | Recommended Normalizer |
|------|-------------|----------------------|
| `'name'` | Person names (first, last, middle, etc.) | `'name'` |
| `'email'` | Email addresses | `'email'` |
| `'phone'` | Phone numbers | `'phone'` |
| `'date'` | Dates (birth dates, timestamps) | `'date'` |
| `'address'` | Physical addresses | `'address'` |
| `'string'` | Generic string fields | `'trim'`, `'lowercase'` |
| `'number'` | Numeric fields | None |
| `'custom'` | Custom field type | Custom normalizer |

---

## Available Normalizers

### Basic Normalizers

| Name | Description |
|------|-------------|
| `'trim'` | Remove leading/trailing whitespace |
| `'lowercase'` | Convert to lowercase |
| `'uppercase'` | Convert to uppercase |
| `'normalizeWhitespace'` | Collapse multiple spaces to single space |
| `'alphanumericOnly'` | Remove non-alphanumeric characters |
| `'numericOnly'` | Keep only numeric characters |

### Domain-Specific Normalizers

| Name | Description | Options |
|------|-------------|---------|
| `'name'` | Parse and normalize names | `{ removeTitles, preserveCase }` |
| `'email'` | Normalize email addresses | `{ lowercase, removePlusAddressing }` |
| `'phone'` | Parse and format phone numbers | `{ defaultCountry, format }` |
| `'address'` | Parse and standardize addresses | `{ standardizeAbbreviations }` |
| `'date'` | Parse various date formats | `{ outputFormat }` |

See [Normalizers Overview](../normalizers/overview.md) for detailed documentation.

---

## FieldDefinition Type

The underlying type for field configurations:

```typescript
interface FieldDefinition {
  /** Semantic field type */
  type: FieldType;

  /** Component for composite types (e.g., 'first' for name) */
  component?: string;

  /** Whether field is required for matching */
  required?: boolean;

  /** Named normalizer to apply */
  normalizer?: string;

  /** Options for the normalizer */
  normalizerOptions?: any;

  /** Custom normalizer function */
  customNormalizer?: (value: unknown) => unknown;
}
```

---

## SchemaDefinition Type

The complete schema definition type:

```typescript
type SchemaDefinition<T> = {
  [K in keyof T]?: FieldDefinition;
};
```

---

## Complete Example

```typescript
import { HaveWeMet } from 'have-we-met';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  ssn?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

const resolver = HaveWeMet
  .create<Person>()
  .schema(schema => schema
    // Name fields with components
    .field('firstName')
      .type('name')
      .component('first')
      .normalizer('name')

    .field('lastName')
      .type('name')
      .component('last')
      .normalizer('name')
      .required()

    // Contact fields
    .field('email')
      .type('email')
      .normalizer('email')

    .field('phone')
      .type('phone')
      .normalizer('phone', { defaultCountry: 'US' })

    // Date field
    .field('dateOfBirth')
      .type('date')
      .normalizer('date')

    // Optional identifier
    .field('ssn')
      .type('string')
      .required(false)
      .customNormalizer(val =>
        typeof val === 'string'
          ? val.replace(/\D/g, '')
          : val
      )
  )
  // Continue with blocking, matching, etc.
  .build();
```

---

## Related

- [Matching Builder](./matching-builder.md) - Configure field comparisons
- [Normalizers Overview](../normalizers/overview.md) - Detailed normalizer documentation
- [Examples](../examples.md) - Complete working examples
