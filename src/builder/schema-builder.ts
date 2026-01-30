import type { FieldDefinition, SchemaDefinition } from '../types'

export class SchemaBuilder<T extends object = object> {
  private schema: SchemaDefinition<T> = {} as SchemaDefinition<T>

  field<K extends keyof T & string>(
    name: K,
    definition: FieldDefinition
  ): this {
    ;(this.schema as Record<string, FieldDefinition>)[name] = definition
    return this
  }

  build(): SchemaDefinition<T> {
    return { ...this.schema }
  }
}
