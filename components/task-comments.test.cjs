const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')


const draftStorage = {}
new Function('exports', ts.transpileModule(require('node:fs').readFileSync('lib/draft-storage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(draftStorage)
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const comment = { id: 'comment', authorEmail: 'member@example.test', body: 'Ready', createdAt: '2026-10-04T10:00:00Z' }

// Execute the real component with controlled hooks/actions. This checks async state
// transitions without a DOM; browser acceptance separately checks rendered behavior.
function harness(actions) {
  const slots = []
  let cursor = 0, pendingEffects = [], tree
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { current: initial }
      return slots[index]
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, callback }
      return slots[index].callback
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!equal(slots[index]?.deps, deps)) {
        slots[index]?.cleanup?.()
        slots[index] = { deps }
        pendingEffects.push(() => { slots[index].cleanup = effect() })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const source = ts.transpileModule(readFileSync(`${__dirname}/task-comments.tsx`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const deps = {
    react,
    '@/lib/draft-storage': draftStorage,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/app/actions/comments': actions,
    'lucide-react': { Loader2: 'Loader2', MessageSquare: 'MessageSquare' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/textarea': { Textarea: 'Textarea' },
  }
  new Function('require', 'exports', source)(name => {
    assert.ok(name in deps, `Unexpected runtime dependency ${name}`)
    return deps[name]
  }, exports)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(item => nodes(item)) : [node, ...nodes(node.props?.children)]
  return {
    render(props = { taskId: 'task' }) {
      cursor = 0
      tree = exports.TaskComments(props)
      const effects = pendingEffects
      pendingEffects = []
      effects.forEach(effect => effect())
      return tree
    },
    find(type) { return nodes(tree).find(node => node.type === type) },
    count(type) { return nodes(tree).filter(node => node.type === type).length },
    submitButton() { return nodes(tree).find(node => node.type === 'Button' && node.props.type === 'submit') },
    text() { return JSON.stringify(tree) },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('late comment reads cannot replace a newer realtime result', async () => {
  const first = deferred(), second = deferred()
  let reads = 0
  const ui = harness({ getTaskComments: () => ++reads === 1 ? first.promise : second.promise })
  ui.render()
  ui.render({ taskId: 'task', refreshEvent: { type: 'task-comment-created', data: { taskId: 'task' } } })
  second.resolve({ comments: [comment] })
  await tick()
  first.resolve({ comments: [] })
  await tick()
  ui.render()
  assert.equal(ui.count('article'), 1)
})

test('submit and realtime delivery of the same comment render one record', async () => {
  const submitted = deferred()
  const ui = harness({ getTaskComments: async () => ({ comments: [comment] }), addTaskComment: () => submitted.promise })
  ui.render()
  await tick()
  ui.render()
  ui.find('Textarea').props.onChange({ target: { value: 'Ready' } })
  ui.render()
  const save = ui.find('form').props.onSubmit({ preventDefault() {} })
  submitted.resolve({ success: true, comment })
  await save
  ui.render()
  assert.equal(ui.count('article'), 1)
})

test('a transport failure clears loading and offers a successful read retry', async () => {
  let reads = 0
  const ui = harness({ getTaskComments: async () => {
    if (++reads === 1) throw new Error('private transport details')
    return { comments: [comment] }
  } })
  ui.render()
  await tick()
  ui.render()
  assert.match(ui.text(), /Unable to load comments/)
  assert.doesNotMatch(ui.text(), /private transport details|No comments yet|Loading comments/)
  ui.find('Button').props.onClick()
  await tick()
  ui.render()
  assert.equal(ui.count('article'), 1)
  assert.doesNotMatch(ui.text(), /Unable to load comments/)
})

test('an unknown save outcome preserves the draft and requires reconciliation', async () => {
  const ui = harness({ getTaskComments: async () => ({ comments: [] }), addTaskComment: async () => { throw new Error('private details') } })
  ui.render()
  await tick()
  ui.render()
  ui.find('Textarea').props.onChange({ target: { value: 'Keep this draft' } })
  ui.render()
  await ui.find('form').props.onSubmit({ preventDefault() {} })
  ui.render()
  assert.equal(ui.find('Textarea').props.value, 'Keep this draft')
  assert.equal(ui.find('Textarea').props.disabled, false)
  assert.match(ui.text(), /Refresh comments before trying again/)
  assert.doesNotMatch(ui.text(), /private details/)
  assert.equal(ui.submitButton().props.disabled, true, 'an uncertain save cannot be blindly replayed')
  ui.find('Button').props.onClick()
  await tick()
  ui.render()
  assert.equal(ui.submitButton().props.disabled, false)
})

test('a returned uncertain result requires refresh and reuses the original comment command on retry', async () => {
  const commands = []
  const ui = harness({ getTaskComments: async () => ({ comments: [] }), addTaskComment: async (taskId, body, commandId) => {
    commands.push(commandId)
    return { error: 'Refresh comments before trying again.', unknownOutcome: true }
  } })
  ui.render()
  await tick()
  ui.render()
  ui.find('Textarea').props.onChange({ target: { value: 'Keep' } })
  ui.render()
  await ui.find('form').props.onSubmit({ preventDefault() {} })
  ui.render()
  assert.equal(ui.submitButton().props.disabled, true)
  ui.find('Button').props.onClick()
  await tick()
  ui.render()
  await ui.find('form').props.onSubmit({ preventDefault() {} })
  assert.equal(commands.length, 2)
  assert.equal(commands[0], commands[1])
})

test('late reads and saves from a previous task cannot leak into the next task', async () => {
  const oldRead = deferred(), oldSave = deferred()
  let reads = 0
  const ui = harness({ getTaskComments: () => ++reads === 1 ? oldRead.promise : Promise.resolve({ comments: [] }), addTaskComment: () => oldSave.promise })
  ui.render()
  ui.find('Textarea').props.onChange({ target: { value: 'Old task draft' } })
  ui.render()
  const saving = ui.find('form').props.onSubmit({ preventDefault() {} })
  ui.render({ taskId: 'next-task' })
  oldRead.resolve({ comments: [comment] })
  oldSave.resolve({ comment })
  await saving
  await tick()
  ui.render({ taskId: 'next-task' })
  assert.equal(ui.count('article'), 0)
  assert.equal(ui.find('Textarea').props.value, '')
  assert.equal(ui.find('Textarea').props.disabled, false)
  ui.unmount()
})

test('archived discussion renders retained comments without a write composer', async () => {
  const ui = harness({ getTaskComments: async () => ({ comments: [comment] }) })
  ui.render({ taskId: 'task', readOnly: true })
  await tick()
  ui.render({ taskId: 'task', readOnly: true })
  assert.equal(ui.count('article'), 1)
  assert.equal(ui.find('form'), undefined)
  assert.equal(ui.find('Textarea'), undefined)
})

test('saving during a pending read reconciles retained and concurrent discussion', async () => {
  const initial = deferred()
  let reads = 0
  const retained = { ...comment, id: 'retained', body: 'Earlier context' }
  const concurrent = { ...comment, id: 'concurrent', body: 'Another member' }
  const ui = harness({ getTaskComments: () => ++reads === 1 ? initial.promise : Promise.resolve({ comments: [retained, concurrent, comment] }), addTaskComment: async () => ({ comment }) })
  ui.render()
  ui.find('Textarea').props.onChange({ target: { value: 'Ready' } })
  ui.render()
  await ui.find('form').props.onSubmit({ preventDefault() {} })
  initial.resolve({ comments: [retained] })
  await tick()
  ui.render()
  assert.equal(ui.count('article'), 3)
})

 test('older comment pages prepend and deduplicate retained records', async () => {
  const older = { ...comment, id: 'older', body: 'Earlier context' }
  const cursors = []
  const ui = harness({ getTaskComments: async (taskId, cursor) => {
    cursors.push(cursor)
    return cursor ? { comments: [older, comment], nextCursor: null } : { comments: [comment], nextCursor: 'cursor' }
  } })
  ui.render()
  await tick()
  ui.render()
  assert.match(ui.text(), /Load older comments/)
  ui.find('Button').props.onClick()
  await tick()
  ui.render()
  assert.equal(ui.count('article'), 2)
  assert.deepEqual(cursors, [undefined, 'cursor'])
  assert.doesNotMatch(ui.text(), /Load older comments/)
})

test('comment drafts survive closing the task and stay within their account workspace scope', async () => {
  global.sessionStorage = memoryStorage()
  const actions = { getTaskComments: async () => ({ comments: [] }) }
  const props = { taskId: 'task', draftScope: 'account:workspace' }
  const first = harness(actions); first.render(props); await tick(); first.render(props)
  first.find('Textarea').props.onChange({ target: { value: 'Retain my discussion' } }); first.render(props); first.unmount()
  const reopened = harness(actions); reopened.render(props); await tick(); reopened.render(props)
  assert.equal(reopened.find('Textarea').props.value, 'Retain my discussion')
  const other = harness(actions); other.render({ ...props, draftScope: 'other:workspace' }); await tick(); other.render({ ...props, draftScope: 'other:workspace' })
  assert.equal(other.find('Textarea').props.value, '')
  delete global.sessionStorage
})

test('an interrupted comment save reuses its exact command after closing and reopening', async () => {
  global.sessionStorage = memoryStorage()
  const keys = [], pending = deferred()
  const props = { taskId: 'task', draftScope: 'account:workspace' }
  const actions = { getTaskComments: async () => ({ comments: [] }), addTaskComment: async (_task, _body, key) => { keys.push(key); return keys.length === 1 ? pending.promise : { comment } } }
  const first = harness(actions); first.render(props); await tick(); first.render(props)
  first.find('Textarea').props.onChange({ target: { value: 'Ready' } }); first.render(props)
  const saving = first.find('form').props.onSubmit({ preventDefault() {} }); first.unmount()
  const reopened = harness(actions); reopened.render(props); await tick(); reopened.render(props)
  assert.equal(reopened.find('Textarea').props.value, 'Ready')
  await reopened.find('form').props.onSubmit({ preventDefault() {} }); reopened.render(props)
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal(reopened.find('Textarea').props.value, '')
  pending.resolve({ error: 'Response lost', unknownOutcome: true }); await saving
  const last = harness(actions); last.render(props); await tick(); last.render(props)
  assert.equal(last.find('Textarea').props.value, '')
  delete global.sessionStorage
})

test('comment submissions pause when their recovery command cannot be stored', async () => {
  global.sessionStorage = { getItem: () => null, setItem: () => { throw new Error('Storage denied') }, removeItem() {} }
  let writes = 0
  const props = { taskId: 'task', draftScope: 'account:workspace' }
  const ui = harness({ getTaskComments: async () => ({ comments: [] }), addTaskComment: async () => { writes++; return { comment } } })
  ui.render(props); await tick(); ui.render(props)
  ui.find('Textarea').props.onChange({ target: { value: 'Keep in memory' } }); ui.render(props)
  await ui.find('form').props.onSubmit({ preventDefault() {} }); ui.render(props)
  assert.equal(writes, 0); assert.equal(ui.find('Textarea').props.value, 'Keep in memory'); assert.match(ui.text(), /storage/i)
  delete global.sessionStorage
})

test('changing the discussion account scope starts a fresh authoritative read', async () => {
  let reads = 0
  const ui = harness({ getTaskComments: async () => { reads++; return { comments: [comment] } } })
  ui.render({ taskId: 'task', draftScope: 'first:workspace' }); await tick(); ui.render({ taskId: 'task', draftScope: 'first:workspace' })
  ui.render({ taskId: 'task', draftScope: 'second:workspace' }); await tick(); ui.render({ taskId: 'task', draftScope: 'second:workspace' })
  assert.equal(reads, 2); assert.equal(ui.count('article'), 1)
})
