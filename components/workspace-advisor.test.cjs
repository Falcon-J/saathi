const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")


const draftStorage = {}
new Function('exports', ts.transpileModule(require('node:fs').readFileSync('lib/draft-storage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(draftStorage)
const advisorSchema = {}
new Function('require', 'exports', ts.transpileModule(fs.readFileSync('lib/ai/workspace-advisor.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(require, advisorSchema)
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }

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

function harness(onConfirmDraft, askWorkspaceAdvisor = async () => ({ response: { capability: 'draft_task', answer: 'Review', attention: [], draft: { title: 'Reviewed', priority: 'medium', description: null, dueDate: null, dueAt: null, estimatedMinutes: null } } })) {
  const slots = []
  let cursor = 0, tree, effects = []
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    react: {
      useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
      useLayoutEffect(effect, deps) { const index = cursor++; if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) { slots[index] = { deps }; effects.push(effect) } },
      useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/draft-storage': draftStorage,
    '@/lib/ai/workspace-advisor': advisorSchema,
    '@/app/actions/workspace-advisor': { askWorkspaceAdvisor },
    'lucide-react': {},
    ...Object.fromEntries(['badge', 'button', 'card', 'textarea'].map(name => [`@/components/ui/${name}`, Object.fromEntries((name === 'card' ? ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'] : [name[0].toUpperCase() + name.slice(1)]).map(component => [component, component]))])),
  }
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name] ?? {}, exports)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render(props = {}) { cursor = 0; tree = exports.WorkspaceAdvisor({ workspaceId: 'workspace', onConfirmDraft, ...props }); const pending = effects; effects = []; pending.forEach(effect => effect()) },
    button(label) { return nodes(tree).find(node => node.type === 'Button' && JSON.stringify(node.props.children).includes(label)) },
    textarea() { return nodes(tree).find(node => node.type === 'Textarea') },
    text() { return JSON.stringify(tree) },
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('Send submits the typed question once and preserves input after failure', async () => {
  const calls = []; let finish
  const ui = harness(async () => ({}), (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve }) })
  ui.render()
  assert.ok(ui.button('Send'))
  ui.textarea().props.onChange({ target: { value: '  ' } }); ui.render()
  assert.equal(ui.button('Send').props.disabled, true)
  ui.button('Send').props.onClick()
  assert.equal(calls.length, 0)
  ui.textarea().props.onChange({ target: { value: 'What is overdue?' } }); ui.render()
  const send = ui.button('Send').props.onClick; send(); send(); ui.render()
  assert.deepEqual(calls, [['workspace', 'identify_attention', 'What is overdue?']])
  assert.equal(ui.button('Send').props.disabled, true)
  finish({ error: 'Unavailable' }); await tick(); ui.render()
  assert.equal(ui.textarea().props.value, 'What is overdue?')
  assert.equal(ui.button('Send').props.disabled, false)
})

test('Send retains the last selected capability', async () => {
  const calls = []
  const ui = harness(async () => ({}), async (...args) => { calls.push(args); return { error: 'Unavailable' } })
  ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
  assert.match(JSON.stringify(ui.button('Send').props.children), /Draft a task/)
  ui.button('Send').props.onClick(); await tick()
  assert.deepEqual(calls.map(call => call[1]), ['draft_task', 'draft_task'])
})

test('replacement advice removes old proposals immediately and keeps them gone after failure', async () => {
  for (const throws of [false, true]) {
    let calls = 0, finish, creations = 0
    const ui = harness(async () => { creations++; return { task: { id: 'task' } } }, async () => {
      if (++calls === 1) return { response: { capability: 'draft_task', answer: 'Old response', attention: [], draft: { title: 'Old proposal', priority: 'medium' } } }
      return new Promise((resolve, reject) => { finish = () => throws ? reject(new Error('Offline')) : resolve({ error: 'Unavailable' }) })
    })
    ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
    const staleConfirm = ui.button('Create task').props.onClick
    const askAgain = ui.button('Draft a task').props.onClick
    askAgain(); askAgain(); staleConfirm(); ui.render()
    assert.equal(calls, 2, 'only one replacement may run')
    assert.equal(creations, 0, 'stale confirmation cannot run during replacement')
    assert.equal(ui.button('Create task'), undefined)
    assert.doesNotMatch(ui.text(), /Old response|Old proposal/)
    finish(); await tick(); ui.render()
    assert.equal(ui.button('Create task'), undefined)
    assert.doesNotMatch(ui.text(), /Old response|Old proposal/)
    assert.match(ui.text(), /Unavailable|temporarily unavailable/)
  }
})

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

test('an uncertain creation preserves its proposal and key until a retry resolves it', async () => {
  const keys = []
  let adviceCalls = 0, committed = false
  const ui = harness(async (_draft, key) => {
    keys.push(key)
    if (!committed) { committed = true; throw new Error('Response lost after commit') }
    if (keys.length === 2) return { error: 'Session temporarily unavailable' }
    return { task: { id: 'task' } }
  }, async () => {
    adviceCalls++
    return { response: { capability: 'draft_task', answer: 'Proposal A', attention: [], draft: { title: 'Task A', priority: 'medium' } } }
  })
  ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
  const replace = ui.button('Draft a task').props.onClick
  const dismiss = ui.button('Dismiss').props.onClick
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.equal(ui.button('Draft a task').props.disabled, true)
  assert.equal(ui.button('Dismiss').props.disabled, true)
  replace(); dismiss(); await tick(); ui.render()
  assert.equal(adviceCalls, 1)
  assert.match(ui.text(), /Proposal A|Task A/)
  assert.match(ui.text(), /Retry this proposal/)
  assert.equal(ui.button('Create task').props.disabled, false)
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.match(ui.text(), /Session temporarily unavailable/)
  assert.equal(ui.button('Draft a task').props.disabled, true)
  assert.equal(ui.button('Dismiss').props.disabled, true)
  replace(); dismiss(); await tick(); ui.render()
  assert.equal(adviceCalls, 1)
  assert.ok(ui.button('Create task'))
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.deepEqual(keys, [keys[0], keys[0], keys[0]])
  assert.equal(ui.button('Create task'), undefined)
  assert.equal(ui.button('Draft a task').props.disabled, false)
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

test('an advisor confirmation keeps its exact proposal and command across closing and reload', async () => {
  global.sessionStorage = memoryStorage()
  const props = { draftScope: 'account:workspace' }, keys = []
  let finish
  const confirm = async (draft, key) => { keys.push([draft.title, key]); return keys.length === 1 ? new Promise(resolve => { finish = resolve }) : { task: { id: 'task' } } }
  const first = harness(confirm); first.render(props); first.button('Draft a task').props.onClick(); await tick(); first.render(props)
  first.button('Create task').props.onClick()
  const reopened = harness(confirm); reopened.render(props); reopened.render(props)
  assert.ok(reopened.button('Create task'), 'the unresolved proposal is available after remount')
  assert.equal(reopened.button('Draft a task').props.disabled, true)
  const other = harness(confirm); other.render({ draftScope: 'other:workspace' }); other.render({ draftScope: 'other:workspace' })
  assert.equal(other.button('Create task'), undefined)
  reopened.button('Create task').props.onClick(); await tick(); reopened.render(props)
  assert.equal(keys.length, 2); assert.deepEqual(keys[0], keys[1]); assert.equal(reopened.button('Create task'), undefined)
  finish({ error: 'Response lost' }); await tick()
  const last = harness(confirm); last.render(props); last.render(props)
  assert.equal(last.button('Create task'), undefined, 'successful recovery clears the retained proposal')
  delete global.sessionStorage
})

test('a returned unknown confirmation keeps replacement blocked until the same command succeeds', async () => {
  const keys = []
  const ui = harness(async (_draft, key) => { keys.push(key); return keys.length === 1 ? { error: 'Temporarily unavailable', unknownOutcome: true } : { task: { id: 'task' } } })
  ui.render(); ui.button('Draft a task').props.onClick(); await tick(); ui.render()
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.equal(ui.button('Draft a task').props.disabled, true)
  assert.equal(ui.button('Dismiss').props.disabled, true)
  ui.button('Create task').props.onClick(); await tick(); ui.render()
  assert.equal(keys[0], keys[1]); assert.equal(ui.button('Create task'), undefined)
})

test('advisor confirmation pauses when its recovery command cannot be stored', async () => {
  global.sessionStorage = { getItem: () => null, setItem: () => { throw new Error('Storage denied') }, removeItem() {} }
  let writes = 0
  const props = { draftScope: 'account:workspace' }
  const ui = harness(async () => { writes++; return { task: { id: 'task' } } })
  ui.render(props); ui.button('Draft a task').props.onClick(); await tick(); ui.render(props)
  ui.button('Create task').props.onClick(); await tick(); ui.render(props)
  assert.equal(writes, 0); assert.ok(ui.button('Create task')); assert.match(ui.text(), /storage/i)
  delete global.sessionStorage
})

test('an advisor account change clears old advice and ignores its late request', async () => {
  let finish
  const ui = harness(async () => ({}), () => new Promise(resolve => { finish = resolve }))
  const first = { draftScope: 'first:workspace' }, next = { draftScope: 'next:workspace' }
  ui.render(first); ui.textarea().props.onChange({ target: { value: 'Private question' } }); ui.render(first)
  ui.button('Send').props.onClick(); ui.render(next); ui.render(next)
  assert.doesNotMatch(ui.text(), /Private question/)
  finish({ response: { capability: 'identify_attention', answer: 'Private advice', attention: [], draft: null } }); await tick(); ui.render(next)
  assert.doesNotMatch(ui.text(), /Private question|Private advice/)
  assert.equal(ui.button('Send').props.disabled, false)
})

test('an advisor account change preserves only the original account confirmation for recovery', async () => {
  global.sessionStorage = memoryStorage()
  let finish
  const keys = []
  const ui = harness((_draft, key) => { keys.push(key); return new Promise(resolve => { finish = resolve }) })
  const first = { draftScope: 'first:workspace' }, next = { draftScope: 'next:workspace' }
  ui.render(first); ui.button('Draft a task').props.onClick(); await tick(); ui.render(first)
  ui.button('Create task').props.onClick(); ui.render(next); ui.render(next)
  assert.equal(ui.button('Create task'), undefined); assert.equal(ui.button('Send').props.disabled, false)
  finish({ error: 'Private failure', unknownOutcome: true }); await tick(); ui.render(next)
  assert.doesNotMatch(ui.text(), /Private failure|Reviewed/)
  const restored = harness(async (_draft, key) => { keys.push(key); return { task: { id: 'task' } } })
  restored.render(first); restored.render(first); assert.ok(restored.button('Create task'))
  restored.button('Create task').props.onClick(); await tick(); assert.equal(keys[0], keys[1])
  delete global.sessionStorage
})
