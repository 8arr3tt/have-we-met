import { HaveWeMet } from './dist/index.js'

console.log('Creating builder...')
const builder = HaveWeMet.create()

console.log('Setting schema...')
builder.schema((schema) => {
  schema.field('email', { type: 'email' })
})

console.log('Setting matching...')
const result = builder.matching((match) => {
  console.log('In matching configurator')
  const fieldBuilder = match.field('email').strategy('exact').weight(100)
  console.log('Field builder type:', fieldBuilder.constructor.name)
  return fieldBuilder
})

console.log('Result from matching():', result)
console.log('Building resolver...')
try {
  const resolver = builder.build()
  console.log('Resolver built successfully!')
} catch (error) {
  console.error('Error building resolver:', error.message)
}
