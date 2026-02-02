import type { FilterCriteria, QueryOptions } from './types'

/**
 * QueryBuilder translates blocking keys and filter criteria into database queries.
 * Provides storage-agnostic query building that adapters can use to construct
 * database-specific queries.
 *
 * @example
 * ```typescript
 * const builder = new QueryBuilder()
 *
 * // Build blocking query
 * const blockingKeys = new Map([['lastName', 'Smith'], ['dobYear', '1985']])
 * const filter = builder.buildBlockingQuery(blockingKeys)
 * // Result: { lastName: { operator: 'eq', value: 'Smith' }, dobYear: { operator: 'eq', value: '1985' } }
 *
 * // Build WHERE clause representation
 * const whereClause = builder.buildWhereClause(filter)
 * // Result: Map with field conditions that adapters can translate to SQL/NoSQL
 * ```
 */
export class QueryBuilder {
  /**
   * Converts blocking keys to filter criteria.
   * Used to generate efficient database queries from blocking strategy output.
   *
   * @param blockingKeys - Map of field names to block values
   * @returns Filter criteria suitable for database queries
   *
   * @example
   * ```typescript
   * const blockingKeys = new Map([['lastName', 'Smith'], ['email', 'john@example.com']])
   * const filter = builder.buildBlockingQuery(blockingKeys)
   * // { lastName: { operator: 'eq', value: 'Smith' }, email: { operator: 'eq', value: 'john@example.com' } }
   * ```
   */
  buildBlockingQuery(blockingKeys: Map<string, unknown>): FilterCriteria {
    const filter: FilterCriteria = {}

    for (const [field, value] of blockingKeys.entries()) {
      if (value === null || value === undefined) {
        continue
      }

      if (Array.isArray(value)) {
        filter[field] = { operator: 'in', value }
      } else {
        filter[field] = { operator: 'eq', value }
      }
    }

    return filter
  }

  /**
   * Builds a WHERE clause representation from filter criteria.
   * Returns a structured representation that database adapters can translate
   * to their specific query language (SQL, MongoDB query, etc.).
   *
   * @param filter - Filter criteria to convert
   * @returns Map of field names to condition objects
   *
   * @example
   * ```typescript
   * const filter: FilterCriteria = {
   *   lastName: { operator: 'eq', value: 'Smith' },
   *   age: { operator: 'gt', value: 18 }
   * }
   * const whereClause = builder.buildWhereClause(filter)
   * ```
   */
  buildWhereClause(
    filter: FilterCriteria
  ): Map<string, { operator: string; value: unknown }> {
    const whereClause = new Map<string, { operator: string; value: unknown }>()

    for (const [field, condition] of Object.entries(filter)) {
      if (condition === null || condition === undefined) {
        continue
      }

      if (
        typeof condition === 'object' &&
        'operator' in condition &&
        'value' in condition
      ) {
        whereClause.set(field, {
          operator: String(condition.operator),
          value: condition.value,
        })
      } else {
        whereClause.set(field, { operator: 'eq', value: condition })
      }
    }

    return whereClause
  }

  /**
   * Builds an ORDER BY clause representation from query options.
   *
   * @param orderBy - Order by configuration
   * @returns Structured representation of ordering
   *
   * @example
   * ```typescript
   * const orderBy = { field: 'lastName', direction: 'asc' as const }
   * const orderByClause = builder.buildOrderByClause(orderBy)
   * // { field: 'lastName', direction: 'asc' }
   * ```
   */
  buildOrderByClause(orderBy: { field: string; direction: 'asc' | 'desc' }): {
    field: string
    direction: 'asc' | 'desc'
  } {
    return orderBy
  }

  /**
   * Builds a LIMIT/OFFSET clause representation from query options.
   *
   * @param options - Query options with limit and offset
   * @returns Structured representation of pagination
   *
   * @example
   * ```typescript
   * const options = { limit: 100, offset: 50 }
   * const limitOffset = builder.buildLimitOffsetClause(options)
   * // { limit: 100, offset: 50 }
   * ```
   */
  buildLimitOffsetClause(options: QueryOptions): {
    limit?: number
    offset?: number
  } {
    return {
      limit: options.limit,
      offset: options.offset,
    }
  }

  /**
   * Builds a complete query representation from multiple components.
   * Combines WHERE, ORDER BY, and LIMIT/OFFSET into a single structure.
   *
   * @param filter - Filter criteria for WHERE clause
   * @param options - Query options for ORDER BY and pagination
   * @returns Complete query representation
   *
   * @example
   * ```typescript
   * const filter = { lastName: { operator: 'eq', value: 'Smith' } }
   * const options = { limit: 10, orderBy: { field: 'firstName', direction: 'asc' as const } }
   * const query = builder.buildQuery(filter, options)
   * ```
   */
  buildQuery(
    filter: FilterCriteria,
    options?: QueryOptions
  ): {
    where: Map<string, { operator: string; value: unknown }>
    orderBy?: { field: string; direction: 'asc' | 'desc' }
    limit?: number
    offset?: number
    fields?: string[]
  } {
    const query: {
      where: Map<string, { operator: string; value: unknown }>
      orderBy?: { field: string; direction: 'asc' | 'desc' }
      limit?: number
      offset?: number
      fields?: string[]
    } = {
      where: this.buildWhereClause(filter),
    }

    if (options?.orderBy) {
      query.orderBy = this.buildOrderByClause(options.orderBy)
    }

    if (options?.limit !== undefined) {
      query.limit = options.limit
    }

    if (options?.offset !== undefined) {
      query.offset = options.offset
    }

    if (options?.fields) {
      query.fields = options.fields
    }

    return query
  }

  /**
   * Merges multiple filter criteria into a single filter using AND logic.
   * All conditions must be satisfied for a record to match.
   *
   * @param filters - Array of filter criteria to merge
   * @returns Merged filter criteria
   *
   * @example
   * ```typescript
   * const filter1 = { lastName: { operator: 'eq', value: 'Smith' } }
   * const filter2 = { age: { operator: 'gt', value: 18 } }
   * const merged = builder.mergeFilters([filter1, filter2])
   * // { lastName: { operator: 'eq', value: 'Smith' }, age: { operator: 'gt', value: 18 } }
   * ```
   */
  mergeFilters(filters: FilterCriteria[]): FilterCriteria {
    const merged: FilterCriteria = {}

    for (const filter of filters) {
      for (const [field, condition] of Object.entries(filter)) {
        if (merged[field]) {
          console.warn(
            `QueryBuilder: Field '${field}' specified multiple times. Using last value.`
          )
        }
        merged[field] = condition
      }
    }

    return merged
  }
}
