const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

test('Board inline edits use the loaded version and preserve an editor version', async () => {
  const writes = [], notices = []
  let reloads = 0
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: { useEffect() {}, useRef: current => ({ current }), useState: value => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/components/task-list': { TaskList: 'TaskList' },
    '@/components/ui/button': { Button: 'Button' },
    '@/hooks/use-task-board': { useTaskBoard: () => ({ tasks: [{ id: 'task', version: 5, updatedAt: 'legacy' }], reload: async () => { reloads++; return true } }) },
    '@/hooks/use-notifications': { useNotifications: () => ({ error: (...args) => notices.push(args) }) },
    '@/app/tasks/actions': { updateTask: async (...args) => { writes.push(args); return { success: true } } },
    '@/lib/mutation-result': { getMutationError: value => value?.error },
  }
  const exports = {}
  const source = ts.transpileModule(readFileSync(`${__dirname}/workspace-board.tsx`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  const tree = exports.WorkspaceBoard({ workspace: { id: 'workspace', members: [] } })
  const list = tree.props.children.find(node => node?.type === 'TaskList')
  await list.props.onEditTask('task', { assigneeEmail: 'member@example.test' })
  await list.props.onEditTask('task', { title: 'Captured draft' }, 2)
  assert.deepEqual(writes, [
    ['task', { assigneeEmail: 'member@example.test' }, 5],
    ['task', { title: 'Captured draft' }, 2],
  ])
  const missing = await list.props.onEditTask('missing', { title: 'Unavailable' })
  assert.match(missing.error, /Task unavailable/)
  assert.equal(writes.length, 2)
  assert.equal(reloads, 3)
  assert.equal(notices.length, 1)
})
