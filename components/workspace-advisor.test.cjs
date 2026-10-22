const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync("components/workspace-advisor.tsx", "utf8")

test("advisor panel keeps AI contextual and reviewable", () => {
  assert.match(source, /"use client"/)
  assert.match(source, /askWorkspaceAdvisor/)
  assert.match(source, /Summarize workspace/)
  assert.match(source, /Find attention items/)
  assert.match(source, /Draft a task/)
  assert.match(source, /Review task draft/)
  assert.match(source, /Create task/)
  assert.match(source, /onConfirmDraft/)
  assert.match(source, /retryAfterSeconds/)
  assert.match(source, /aria-busy/)
  assert.doesNotMatch(source, /autoCreate|autonomous|saveWithoutReview/i)
})

function harness(onConfirmDraft) {
  const slots = []
  let cursor = 0, tree
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: {
      useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
      useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/app/actions/workspace-advisor': { askWorkspaceAdvisor: async () => ({ response: { capability: 'draft_task', answer: 'Review', attention: [], draft: { title: 'Reviewed', priority: 'medium' } } }) },
    'lucide-react': {},
    ...Object.fromEntries(['badge', 'button', 'card', 'textarea'].map(name => [`@/components/ui/${name}`, Object.fromEntries((name === 'card' ? ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'] : [name[0].toUpperCase() + name.slice(1)]).map(component => [component, component]))])),
  }
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name] ?? {}, exports)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render() { cursor = 0; tree = exports.WorkspaceAdvisor({ workspaceId: 'workspace', onConfirmDraft }) },
    button(label) { return nodes(tree).find(node => node.type === 'Button' && JSON.stringify(node.props.children).includes(label)) },
    text() { return JSON.stringify(tree) },
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('reviewed draft retries retain the command and reject immediate double confirmation', async () => {
  const keys = []
  let reject
  const ui = harness((_draft, key) => { keys.push(key); return keys.length === 1 ? new Promise((_resolve, fail) => { reject = fail }) : Promise.resolve({ task: { id: 'task' } }) })
  ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
  const confirm = ui.button('Create task').props.onClick
  confirm(); confirm()
  assert.equal(keys.length, 1)
  reject(new Error('Response lost after commit')); await tick(); ui.render()
  assert.match(ui.text(), /could not confirm|confirmation could not/i)
  assert.ok(ui.button('Create task'))
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  assert.equal(ui.button('Create task'), undefined)
  ui.button('Draft a task').props.onClick(); await tick(); ui.render()
  ui.button('Create task').props.onClick(); await tick()
  assert.notEqual(keys[1], keys[2])
})

test('a committed draft clears the proposal even when refreshing failed', async () => {
  for (const path of ['app/dashboard/page.tsx', 'components/assistant-workspace.tsx']) {
    const file = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let callback
    const visit = node => {
      if (path.startsWith('app/') && ts.isJsxAttribute(node) && node.name.text === 'onConfirmDraft') callback = node.initializer.expression
      if (!path.startsWith('app/') && ts.isVariableDeclaration(node) && node.name.getText(file) === 'confirmDraft') callback = node.initializer
      ts.forEachChild(node, visit)
    }
    visit(file); assert.ok(callback)
    const exports = {}
    const js = ts.transpileModule(`exports.confirm = ${callback.getText(file)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    new Function('exports', 'confirmWorkspaceAdvisorDraft', 'currentWorkspace', 'workspace', 'setBoardRefreshRequest', 'refreshTasks', 'onRefreshTasks', js)(exports, async () => ({ task: { id: 'task' } }), { id: 'workspace' }, { id: 'workspace' }, () => {}, async () => { throw new Error('Refresh unavailable') }, async () => { throw new Error('Refresh unavailable') })
    const ui = harness(exports.confirm)
    ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
    ui.button('Create task').props.onClick(); await tick(); ui.render()
    assert.equal(ui.button('Create task'), undefined, path)
    assert.match(ui.text(), /created.*refresh|saved.*refresh/i, path)
  }
})
