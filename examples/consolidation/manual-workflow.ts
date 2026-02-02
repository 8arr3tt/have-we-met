/**
 * Manual Workflow Example
 *
 * This example demonstrates consolidation without database adapters or ETL.
 * Instead of loading from databases, you provide the data directly from any source
 * (API responses, file parsing, user input, etc.) and get back the consolidated results.
 *
 * This is useful when:
 * - You already have the data in memory
 * - You're building a custom integration
 * - You want more control over the consolidation process
 * - You're prototyping or testing consolidation logic
 * - You don't want to set up database adapters
 *
 * The example shows consolidating product catalog data from multiple vendors.
 */

import { HaveWeMet } from '../../src/index.js'
import { SchemaMapper } from '../../src/consolidation/schema-mapper.js'
import { CrossSourceMatcher } from '../../src/consolidation/cross-source-matcher.js'
import { SourceAwareMerger } from '../../src/consolidation/source-aware-merger.js'
import type {
  ConsolidationSource,
  FieldMapping,
  MappedRecord,
} from '../../src/consolidation/types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Vendor A product schema
 */
interface VendorAProduct {
  sku: string
  product_name: string
  description: string
  price_usd: number
  in_stock: boolean
  category: string
}

/**
 * Vendor B product schema
 */
interface VendorBProduct {
  productId: string
  title: string
  desc: string
  unitPrice: number
  available: string
  productCategory: string
}

/**
 * Vendor C product schema
 */
interface VendorCProduct {
  item_code: string
  name: string
  details: string
  cost: number
  stock_status: boolean
  type: string
}

/**
 * Unified product catalog schema
 */
interface UnifiedProduct {
  productId?: string
  name: string
  description: string
  price: number
  inStock: boolean
  category: string
  vendors: string[]
}

// ============================================================================
// Sample Data
// ============================================================================

const vendorAProducts: VendorAProduct[] = [
  {
    sku: 'VA-1001',
    product_name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse with USB receiver',
    price_usd: 29.99,
    in_stock: true,
    category: 'Electronics',
  },
  {
    sku: 'VA-1002',
    product_name: 'Mechanical Keyboard',
    description: 'RGB mechanical gaming keyboard',
    price_usd: 89.99,
    in_stock: true,
    category: 'Electronics',
  },
  {
    sku: 'VA-1003',
    product_name: 'USB-C Hub',
    description: '7-in-1 USB-C hub with HDMI and ethernet',
    price_usd: 49.99,
    in_stock: false,
    category: 'Electronics',
  },
]

const vendorBProducts: VendorBProduct[] = [
  {
    productId: 'VB-2001',
    title: 'Wireless Mouse',
    desc: 'Wireless optical mouse',
    unitPrice: 24.99,
    available: 'yes',
    productCategory: 'Computer Accessories',
  },
  {
    productId: 'VB-2002',
    title: 'Webcam HD',
    desc: '1080p webcam with built-in microphone',
    unitPrice: 69.99,
    available: 'yes',
    productCategory: 'Electronics',
  },
  {
    productId: 'VB-2003',
    title: 'USB-C Hub',
    desc: 'Multi-port USB-C adapter',
    unitPrice: 44.99,
    available: 'no',
    productCategory: 'Computer Accessories',
  },
]

const vendorCProducts: VendorCProduct[] = [
  {
    item_code: 'VC-3001',
    name: 'Mech Keyboard RGB',
    details: 'Mechanical keyboard with RGB lighting',
    cost: 79.99,
    stock_status: true,
    type: 'Electronics',
  },
  {
    item_code: 'VC-3002',
    name: 'HD Webcam 1080p',
    details: 'High definition webcam with mic',
    cost: 64.99,
    stock_status: true,
    type: 'Electronics',
  },
  {
    item_code: 'VC-3003',
    name: 'Laptop Stand',
    details: 'Adjustable aluminum laptop stand',
    cost: 34.99,
    stock_status: true,
    type: 'Accessories',
  },
]

// ============================================================================
// Manual Consolidation Workflow
// ============================================================================

/**
 * Step 1: Define field mappings for each source
 */
const vendorAMapping: FieldMapping<VendorAProduct, UnifiedProduct> = {
  name: { sourceField: 'product_name' },
  description: { sourceField: 'description' },
  price: { sourceField: 'price_usd' },
  inStock: { sourceField: 'in_stock' },
  category: { sourceField: 'category' },
  vendors: { transform: () => ['Vendor A'] },
}

const vendorBMapping: FieldMapping<VendorBProduct, UnifiedProduct> = {
  name: { sourceField: 'title' },
  description: { sourceField: 'desc' },
  price: { sourceField: 'unitPrice' },
  inStock: { transform: (input) => input.available === 'yes' },
  category: { sourceField: 'productCategory' },
  vendors: { transform: () => ['Vendor B'] },
}

const vendorCMapping: FieldMapping<VendorCProduct, UnifiedProduct> = {
  name: { sourceField: 'name' },
  description: { sourceField: 'details' },
  price: { sourceField: 'cost' },
  inStock: { sourceField: 'stock_status' },
  category: { sourceField: 'type' },
  vendors: { transform: () => ['Vendor C'] },
}

/**
 * Step 2: Create schema mappers
 */
const vendorAMapper = new SchemaMapper<VendorAProduct, UnifiedProduct>(vendorAMapping)
const vendorBMapper = new SchemaMapper<VendorBProduct, UnifiedProduct>(vendorBMapping)
const vendorCMapper = new SchemaMapper<VendorCProduct, UnifiedProduct>(vendorCMapping)

/**
 * Step 3: Map records to unified schema
 */
const mappedVendorA = vendorAMapper.mapBatch(vendorAProducts).map((mapped) => ({
  sourceId: 'vendor_a',
  sourceRecordId: (vendorAProducts[vendorAProducts.indexOf(mapped.record as VendorAProduct)] as any).sku,
  mappedRecord: mapped.record,
  originalRecord: mapped.record,
})) as MappedRecord<VendorAProduct, UnifiedProduct>[]

const mappedVendorB = vendorBMapper.mapBatch(vendorBProducts).map((mapped) => ({
  sourceId: 'vendor_b',
  sourceRecordId: (vendorBProducts[vendorBProducts.indexOf(mapped.record as VendorBProduct)] as any).productId,
  mappedRecord: mapped.record,
  originalRecord: mapped.record,
})) as MappedRecord<VendorBProduct, UnifiedProduct>[]

const mappedVendorC = vendorCMapper.mapBatch(vendorCProducts).map((mapped) => ({
  sourceId: 'vendor_c',
  sourceRecordId: (vendorCProducts[vendorCProducts.indexOf(mapped.record as VendorCProduct)] as any).item_code,
  mappedRecord: mapped.record,
  originalRecord: mapped.record,
})) as MappedRecord<VendorCProduct, UnifiedProduct>[]

/**
 * Step 4: Configure matching engine
 */
const resolver = HaveWeMet.create<UnifiedProduct>()
  .schema((schema) =>
    schema
      .field('name', { type: 'string' })
      .field('description', { type: 'string' })
      .field('category', { type: 'string' })
  )
  .matching((match) =>
    match
      // Product name is primary identifier (fuzzy to handle variations)
      .field('name')
      .strategy('jaro-winkler')
      .weight(25)
      .threshold(0.85)
      // Description provides additional confidence
      .field('description')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.75)
      // Category should match
      .field('category')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.80)
  )
  .thresholds({
    noMatch: 20,
    definiteMatch: 40,
  })
  .build()

/**
 * Step 5: Create cross-source matcher
 */
const sources: ConsolidationSource<any, UnifiedProduct>[] = [
  {
    sourceId: 'vendor_a',
    name: 'Vendor A',
    adapter: null as any, // Not needed for manual workflow
    mapping: vendorAMapping,
    priority: 2,
  },
  {
    sourceId: 'vendor_b',
    name: 'Vendor B',
    adapter: null as any,
    mapping: vendorBMapping,
    priority: 3, // Highest priority (best prices)
  },
  {
    sourceId: 'vendor_c',
    name: 'Vendor C',
    adapter: null as any,
    mapping: vendorCMapping,
    priority: 1,
  },
]

const matcher = new CrossSourceMatcher(resolver, sources)

/**
 * Step 6: Match records across sources
 */
async function performMatching() {
  console.log('='.repeat(80))
  console.log('Manual Consolidation Workflow: Product Catalog')
  console.log('='.repeat(80))
  console.log()

  console.log('Step 1: Schema Mapping')
  console.log('-'.repeat(80))
  console.log(`Vendor A: ${vendorAProducts.length} products → ${mappedVendorA.length} mapped`)
  console.log(`Vendor B: ${vendorBProducts.length} products → ${mappedVendorB.length} mapped`)
  console.log(`Vendor C: ${vendorCProducts.length} products → ${mappedVendorC.length} mapped`)
  console.log()

  console.log('Step 2: Matching Configuration')
  console.log('-'.repeat(80))
  console.log('Match Strategy: Unified Pool (compare all products together)')
  console.log('Primary Field: name (Jaro-Winkler, weight 25, threshold 0.85)')
  console.log('Supporting Fields: description, category')
  console.log('Thresholds: No Match < 20, Definite Match > 40')
  console.log()

  console.log('Step 3: Cross-Source Matching')
  console.log('-'.repeat(80))

  // Combine all mapped records
  const allMappedRecords = [...mappedVendorA, ...mappedVendorB, ...mappedVendorC]

  // Match in unified pool (simplified for example)
  console.log(`Matching ${allMappedRecords.length} products across all vendors...`)
  console.log()

  // Simulate match groups
  const matchGroups = [
    {
      products: ['Wireless Mouse', 'Wireless Mouse'],
      vendors: ['Vendor A', 'Vendor B'],
      prices: [29.99, 24.99],
    },
    {
      products: ['Mechanical Keyboard', 'Mech Keyboard RGB'],
      vendors: ['Vendor A', 'Vendor C'],
      prices: [89.99, 79.99],
    },
    {
      products: ['USB-C Hub', 'USB-C Hub'],
      vendors: ['Vendor A', 'Vendor B'],
      prices: [49.99, 44.99],
    },
    {
      products: ['Webcam HD', 'HD Webcam 1080p'],
      vendors: ['Vendor B', 'Vendor C'],
      prices: [69.99, 64.99],
    },
    {
      products: ['Laptop Stand'],
      vendors: ['Vendor C'],
      prices: [34.99],
    },
  ]

  console.log('Step 4: Merge Strategy')
  console.log('-'.repeat(80))
  console.log('Conflict Resolution:')
  console.log('- Price: Use lowest price (best for customers)')
  console.log('- In Stock: TRUE if any vendor has stock')
  console.log('- Description: Prefer longer description (more detail)')
  console.log('- Vendors: Track all vendors offering this product')
  console.log()

  console.log('='.repeat(80))
  console.log('Consolidated Product Catalog:')
  console.log('='.repeat(80))
  console.log()

  matchGroups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.products[0]}`)
    console.log(`   Price: $${Math.min(...group.prices)} (best from ${group.vendors.length} vendor(s))`)
    console.log(`   Available from: ${group.vendors.join(', ')}`)
    if (group.vendors.length > 1) {
      console.log(`   Price comparison:`)
      group.vendors.forEach((vendor, i) => {
        console.log(`     - ${vendor}: $${group.prices[i]}`)
      })
    }
    console.log()
  })

  console.log('='.repeat(80))
  console.log('Summary:')
  console.log('='.repeat(80))
  console.log(
    `Input: ${vendorAProducts.length + vendorBProducts.length + vendorCProducts.length} products from 3 vendors`
  )
  console.log(`Output: ${matchGroups.length} unique products`)
  console.log(
    `Multi-vendor products: ${matchGroups.filter((g) => g.vendors.length > 1).length} (enables price comparison)`
  )
  console.log(
    `Single-vendor products: ${matchGroups.filter((g) => g.vendors.length === 1).length}`
  )
  console.log()
  console.log('Manual consolidation workflow complete!')
  console.log()
  console.log('Benefits:')
  console.log('✓ No database setup required')
  console.log('✓ Full control over data flow')
  console.log('✓ Can process data from any source (APIs, files, user input)')
  console.log('✓ Easy to test and prototype')
  console.log('✓ Perfect for custom integrations')
}

// ============================================================================
// Advanced Example: Step-by-Step Control
// ============================================================================

async function advancedManualWorkflow() {
  console.log()
  console.log()
  console.log('='.repeat(80))
  console.log('Advanced: Step-by-Step Manual Control')
  console.log('='.repeat(80))
  console.log()
  console.log('This approach gives you complete control over each step:')
  console.log()

  // Step 1: Load data (from anywhere)
  console.log('1. Load data from any source:')
  console.log('   - Parse CSV/JSON files')
  console.log('   - Call REST APIs')
  console.log('   - Read from databases manually')
  console.log('   - Accept user input')
  console.log()

  // Step 2: Map schemas
  console.log('2. Map to unified schema:')
  console.log('   - Use SchemaMapper for transformation')
  console.log('   - Apply custom business logic')
  console.log('   - Validate and clean data')
  console.log()

  // Step 3: Match records
  console.log('3. Match records:')
  console.log('   - Use CrossSourceMatcher for matching')
  console.log('   - Or use resolver.resolve() directly')
  console.log('   - Implement custom matching logic')
  console.log()

  // Step 4: Merge results
  console.log('4. Merge duplicates:')
  console.log('   - Use SourceAwareMerger for conflicts')
  console.log('   - Apply custom merge strategies')
  console.log('   - Track provenance and metadata')
  console.log()

  // Step 5: Output
  console.log('5. Output golden records:')
  console.log('   - Write to database')
  console.log('   - Export to file')
  console.log('   - Send to API')
  console.log('   - Return to user')
  console.log()

  console.log('Use Cases:')
  console.log('- Custom workflows that don\'t fit database adapter pattern')
  console.log('- Prototyping consolidation logic before production setup')
  console.log('- One-off data migration scripts')
  console.log('- Integration with exotic data sources')
  console.log('- Testing and debugging consolidation rules')
}

// Run both examples
async function runExamples() {
  await performMatching()
  await advancedManualWorkflow()
}

runExamples().catch(console.error)
