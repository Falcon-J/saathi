const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const source = fs.readFileSync('scripts/verify-local-auth.mjs', 'utf8')

test('local acceptance rejects non-loopback service URLs', () => {
  const declaration = source.match(/function loopback\(value, protocols\) \{[\s\S]*?\n\}/)
  assert.ok(declaration)
  const loopback = new Function('assert', 'URL', `${declaration[0]}; return loopback`)(assert, URL)
  assert.equal(loopback('http://127.0.0.1:56321', ['http:']), 'http://127.0.0.1:56321')
  assert.throws(() => loopback('http://example.com:56321', ['http:']))
  assert.throws(() => loopback('https://127.0.0.1:56321', ['http:']))
})

test('link acceptance runs real signup and sign-in without seeding mailbox proofs', () => {
  assert.doesNotMatch(source, /INSERT INTO invitation_email_verifications/)
  assert.match(source, /fresh-signup-and-link-acceptance/)
  assert.match(source, /existing-account-sign-in-and-link-acceptance/)
  assert.match(source, /secondAccountBlocked: true, revokedLinkBlocked: true/)
  assert.match(source, /createHash\('sha256'\)\.update\(first\.token\)/)
})

test('local acceptance uses and closes the loopback Redis bridge with scoped cleanup', () => {
  assert.match(source, /startLocalRedisRest\(\{ token: redisToken \}\)/)
  assert.match(source, /UPSTASH_REDIS_REST_URL: redisBridge\.url/)
  assert.match(source, /redisBridge\.close\(\)/)
  assert.match(source, /`stream:\$\{workspace\}`/)
  assert.match(source, /if \(key\.startsWith\(prefix\)\) keys\.add\(key\)/)
  assert.doesNotMatch(source, /FLUSH(?:ALL|DB)/i)
})
