import { createPersonRecord } from './tests/fixtures/records.js'

const person = createPersonRecord({ email: 'john@example.com' }, '1')
console.log('Full record:', JSON.stringify(person, null, 2))
console.log('Data only:', JSON.stringify(person.data, null, 2))
