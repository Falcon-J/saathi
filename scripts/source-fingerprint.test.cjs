const test = require('node:test')
const assert = require('node:assert/strict')

test('source evidence includes new files and content and is independent of enumeration order', async () => {
  const { hashSourceFiles } = await import('./source-fingerprint.mjs')
  const source = { 'tracked.ts': 'old platform', 'new.ts': 'new platform' }
  const read = path => Buffer.from(source[path])
  const before = hashSourceFiles(['tracked.ts'], read)
  const complete = hashSourceFiles(['tracked.ts', 'new.ts'], read)
  assert.notEqual(before, complete)
  assert.equal(complete, hashSourceFiles(['new.ts', 'tracked.ts', 'tracked.ts'], read))
  source['new.ts'] = 'changed platform'
  assert.notEqual(complete, hashSourceFiles(['tracked.ts', 'new.ts'], read))
  assert.notEqual(complete, hashSourceFiles(['tracked.ts', 'new.ts'], path => { if (path === 'new.ts') throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); return read(path) }))
})
