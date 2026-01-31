const { MatchingBuilder } = require('./dist/builder/matching-builder.js');

const builder = new MatchingBuilder();
const result = builder.field('email').strategy('exact').weight(100);
console.log('Result type:', result.constructor.name);
const config = result.build();
console.log('Config fields size:', config.fields.size);
console.log('Config fields:', Array.from(config.fields.entries()));
