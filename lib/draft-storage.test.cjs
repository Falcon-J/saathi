const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const helpers = {}
new Function('exports', ts.transpileModule(fs.readFileSync('lib/draft-storage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(helpers)

test('logout clears only the target account draft namespace across workspaces', () => {
  const data = new Map([
    ['saathi:draft:a@example.test:w1:settings', 'one'],
    ['saathi:draft:a@example.test:w2:task-editor', 'two'],
    ['saathi:draft:b@example.test:w1:settings', 'other account'],
    ['saathi:draft:a@example.test.extra:w1:settings', 'other prefix'],
    ['unrelated', 'retain'],
  ])
  const previous = global.sessionStorage
  global.sessionStorage = { get length() { return data.size }, key: index => [...data.keys()][index] ?? null, removeItem: key => data.delete(key) }
  try {
    helpers.clearAccountDrafts('saathi:draft:a@example.test:')
    assert.deepEqual([...data.keys()], ['saathi:draft:b@example.test:w1:settings', 'saathi:draft:a@example.test.extra:w1:settings', 'unrelated'])
  } finally { if (previous === undefined) delete global.sessionStorage; else global.sessionStorage = previous }
})

test('unavailable session storage cannot block logout cleanup', () => {
  const previous = global.sessionStorage
  global.sessionStorage = { get length() { throw Error('Storage blocked') } }
  try { assert.doesNotThrow(() => helpers.clearAccountDrafts('saathi:draft:a@example.test:')) }
  finally { if (previous === undefined) delete global.sessionStorage; else global.sessionStorage = previous }
})
