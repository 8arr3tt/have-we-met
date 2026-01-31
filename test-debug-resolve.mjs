import { HaveWeMet } from './dist/index.js'

const resolver = HaveWeMet.create()
  .schema((s) => s.field('email', { type: 'email' }))
  .matching((m) => m.field('email').strategy('exact').weight(100))
  .thresholds({ noMatch: 20, definiteMatch: 75 })
  .build()

const input = { id: 'input', email: 'john@example.com' }
const candidates = [{ id: '1', email: 'john@example.com' }]

const results = resolver.resolve(input, candidates)
console.log('Results:', JSON.stringify(results, null, 2))
