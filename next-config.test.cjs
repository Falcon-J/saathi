const assert = require('node:assert/strict')
const test = require('node:test')

test('development Server Function arguments are not logged', async () => {
  const { default: config } = await import('./next.config.mjs')
  assert.equal(config.logging?.serverFunctions, false)
})
