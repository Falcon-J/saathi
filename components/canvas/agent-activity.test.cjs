const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done }), resolve: value => resolve(value) } }
const workspaceId = '11111111-1111-4111-8111-111111111111'
const run = { id: '22222222-2222-4222-8222-222222222222', workspaceId, taskId: '33333333-3333-4333-8333-333333333333', state: 'awaiting_review', progress: 'Ready for review', evidence: [{ kind: 'text', text: 'Verified result' }], reviewComment: null, task: { id: '33333333-3333-4333-8333-333333333333', title: 'Deliver outcome', version: 4, canReview: true } }
function harness(actions, options = {}) {
  let cursor = 0, effects = [], tree
  const slots = []
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useCallback(callback, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback },
    useEffect(effect, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) { slots[index]?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = effect() }) } },
  }
  react.useLayoutEffect = react.useEffect
  const jsx = (type, props) => ({ type, props })
  const storage = options.storage ?? new Map()
  const browserStorage = { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (options.storageFails) throw Error('Storage unavailable'); storage.set(key, value) }, removeItem: key => storage.delete(key) }
  const draft = {}
  new Function('exports', 'sessionStorage', ts.transpileModule(fs.readFileSync('lib/draft-storage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(draft, browserStorage)
  const exports = {}, deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/app/actions/coordination': actions, '@/features/coordination/contracts': require('../../features/coordination/contracts.ts'), '@/lib/draft-storage': draft, '@/components/ui/button': { Button: 'Button' }, '@/components/ui/textarea': { Textarea: 'Textarea' }, '@/components/ui/label': { Label: 'Label' } }
  const source = ts.transpileModule(fs.readFileSync('components/canvas/agent-activity.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', source)(name => { assert.ok(name in deps, name); return deps[name] }, exports)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return {
    render(props = { workspaceId, actorId: 'actor', refreshSignal: 0 }) { cursor = 0; tree = exports.AgentActivity({ actorId: 'actor', ...props }); const queued = effects; effects = []; queued.forEach(effect => effect()); return tree },
    button(label) { return nodes(tree).find(node => node.type === 'Button' && node.props.children === label) },
    text() { return JSON.stringify(tree) },
    comment(value) { nodes(tree).find(node => node.type === 'Textarea').props.onChange({ target: { value } }) },
    commentValue() { return nodes(tree).find(node => node.type === 'Textarea')?.props.value },
    storage,
  }
}

test('review comments and exact unresolved commands survive tool remount without crossing accounts', async () => {
  const reviews = [], storage = new Map()
  const actions = { getAgentActivity: async () => ({ runs: [run], nextCursor: null }), reviewAgentRun: async input => { reviews.push(input); return { unknownOutcome: true, error: 'Unknown outcome' } } }
  const first = harness(actions, { storage }); first.render(); await tick(); first.render()
  first.comment('Keep my review'); first.render()
  const draft = harness(actions, { storage }); draft.render(); await tick(); draft.render()
  assert.equal(draft.commentValue(), 'Keep my review')
  await draft.button('Approve and complete task').props.onClick(); draft.render()
  const restored = harness(actions, { storage }); restored.render(); await tick(); restored.render()
  assert.ok(restored.button('Retry same review'))
  await restored.button('Retry same review').props.onClick()
  assert.deepEqual(reviews[1], reviews[0]); assert.equal(reviews[1].comment, 'Keep my review')
  const other = harness(actions, { storage }); const props = { workspaceId, actorId: 'different-actor' }
  other.render(props); await tick(); other.render(props)
  assert.equal(other.button('Retry same review'), undefined); assert.equal(other.commentValue(), '')
})

test('unavailable recovery storage prevents dispatching a review with no durable retry identity', async () => {
  let writes = 0
  const ui = harness({ getAgentActivity: async () => ({ runs: [run], nextCursor: null }), reviewAgentRun: async () => { writes++; return { success: true, run } } }, { storageFails: true })
  ui.render(); await tick(); ui.render(); await ui.button('Approve and complete task').props.onClick(); ui.render()
  assert.equal(writes, 0); assert.match(ui.text(), /storage.*unavailable/i)
})
test('agent activity displays real evidence and task-version-bound human approval, respecting review ceiling', async () => {
  const reviews = []
  const ui = harness({ getAgentActivity: async () => ({ runs: [run], nextCursor: null }), reviewAgentRun: async input => { reviews.push(input); return { success: true, run: { ...run, state: 'succeeded' } } } })
  ui.render(); await tick(); ui.render()
  assert.match(ui.text(), /Verified result/)
  ui.render({ workspaceId, refreshSignal: 0, canReview: false })
  assert.equal(ui.button('Approve and complete task'), undefined)
  ui.render({ workspaceId, refreshSignal: 0, canReview: true })
  await ui.button('Approve and complete task').props.onClick()
  assert.equal(reviews[0].expectedTaskVersion, 4)
  assert.equal(reviews[0].decision, 'approve')
  assert.ok(reviews[0].commandId)
})
test('workspace changes and realtime refresh reject stale reads and remove denied data', async () => {
  const first = deferred(), second = deferred(); let reads = 0
  const ui = harness({ getAgentActivity: () => ++reads === 1 ? first.promise : second.promise })
  ui.render({ workspaceId: 'old', refreshSignal: 0 })
  ui.render({ workspaceId: 'new', refreshSignal: 1 })
  second.resolve({ error: 'Access unavailable' }); await tick()
  first.resolve({ runs: [{ ...run, task: { ...run.task, title: 'Private old task' } }], nextCursor: null }); await tick()
  ui.render({ workspaceId: 'new', refreshSignal: 1 })
  assert.match(ui.text(), /Access unavailable/)
  assert.doesNotMatch(ui.text(), /Private old task/)
})
test('uncertain review retries preserve the exact command and expected task version', async () => {
  const reviews = []
  const ui = harness({ getAgentActivity: async () => ({ runs: [run], nextCursor: null }), reviewAgentRun: async input => { reviews.push(input); return reviews.length === 1 ? { unknownOutcome: true, error: 'Could not confirm' } : { success: true, run: { ...run, state: 'succeeded' } } } })
  ui.render(); await tick(); ui.render()
  await ui.button('Approve and complete task').props.onClick(); ui.render()
  await ui.button('Retry same review').props.onClick()
  assert.deepEqual(reviews[1], reviews[0])
})
test('agent follow is opt-in and targets a real run task identifier only', async () => {
  const followed = []
  const ui = harness({ getAgentActivity: async () => ({ runs: [run], nextCursor: null }) })
  const props = { workspaceId, refreshSignal: 0, onFollowTask: taskId => followed.push(taskId) }
  ui.render(props); await tick(); ui.render(props)
  assert.deepEqual(followed, [])
  ui.button('Follow agent').props.onClick()
  assert.deepEqual(followed, [run.taskId])
  ui.render({ ...props, followingTaskId: run.taskId })
  assert.equal(ui.button('Following agent').props.disabled, true)
})
test('following ends only after a successful complete current-scope read confirms no active run', async () => {
  let ended = 0, rows = [run]
  const ui = harness({ getAgentActivity: async () => ({ runs: rows, nextCursor: null }) })
  const props = { workspaceId, refreshSignal: 0, followingTaskId: run.taskId, onFollowingEnded: () => { ended++ } }
  ui.render(props); await tick(); ui.render(props)
  assert.equal(ended, 0)
  rows = [{ ...run, state: 'succeeded' }]
  ui.render({ ...props, refreshSignal: 1 }); await tick(); ui.render({ ...props, refreshSignal: 1 })
  assert.equal(ended, 1)
})
