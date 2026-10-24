const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

test('a board refresh failure after import reports saved tasks instead of failed import', async () => {
  const notices = []
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: { useRef: () => ({ current: null }), useState: () => [false, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': {}, '@/components/ui/button': { Button: 'Button' },
    '@/hooks/use-notifications': { useNotifications: () => Object.fromEntries(['success','warning','error'].map(name => [name, (...args) => notices.push([name, ...args])])) },
    '@/app/actions/migration': { importTasksFromCsv: async () => ({ imported: 2, failed: 0, errors: [] }) },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('components/task-import.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name], exports)
  const tree = exports.TaskImport({ workspaceId: 'workspace', onImported: async () => { throw new Error('Read unavailable') } })
  const input = tree.props.children.find(child => child.type === 'input')
  await input.props.onChange({ target: { files: [{ text: async () => 'title\nFirst\nSecond' }], value: 'file.csv' } })
  assert.equal(notices.length, 1)
  assert.equal(notices[0][0], 'warning')
  assert.match(notices[0][1], /imported/)
  assert.match(notices[0][2], /refresh/i)
})
