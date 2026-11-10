const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

test('the deprecated task stream preserves subscription query parameters in its redirect', async () => {
  const exports = {}
  const source = readFileSync(`${__dirname}/route.ts`, 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', js)(name => { throw new Error(`Unexpected runtime dependency: ${name}`) }, exports)
  const response = await exports.GET(new Request('https://saathi.test/tasks/stream?workspaceId=workspace-1&filter=a%2Bb&filter=c'))
  assert.equal(response.status, 301)
  assert.equal(response.headers.get('location'), '/api/realtime?workspaceId=workspace-1&filter=a%2Bb&filter=c')
  const bare = await exports.GET(new Request('https://saathi.test/tasks/stream'))
  assert.equal(bare.headers.get('location'), '/api/realtime')
})
