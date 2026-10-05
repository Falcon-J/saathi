const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
function harness(onAddTask, onReviewBoard) {
  assert.ok(fs.existsSync('components/task-quick-add.tsx'), 'Shared progressive quick add exists')
  const state = []; let cursor = 0
  const react = { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] }, useRef: () => ({ current: null }), useEffect() {} }
  const jsx = (type, props) => ({ type, props })
  const dependencies = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Plus: 'Plus', Loader2: 'Loader2' }, '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' }, '@/components/ui/textarea': { Textarea: 'Textarea' }, '@/lib/mutation-result': { getMutationError: result => result?.error }, '@/lib/task-time': { localDateTimeToIso: (date, time) => date && time ? `${date}T${time}:00Z` : undefined } }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync('components/task-quick-add.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', source)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports)
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  return { render() { cursor = 0; return nodes(exports.TaskQuickAdd({ onAddTask, onReviewBoard })) } }
}
const input = (ui, label, value) => ui.render().find(node => node.props?.['aria-label'] === label).props.onChange({ target: { value } })
const submit = ui => ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
test('quick add reveals details and submits the existing seven argument contract', async () => {
  let saved
  const ui = harness(async (...args) => { saved = args; return {} })
  assert.equal(ui.render().some(node => node.type === 'Textarea'), false)
  ui.render().find(node => node.props?.['aria-expanded'] === false).props.onClick()
  input(ui, 'Task title', '  Draft  '); input(ui, 'Task description', 'Context'); input(ui, 'Task due date', '2026-10-08'); input(ui, 'Task estimate in minutes', '45')
  await submit(ui)
  assert.deepEqual(saved, ['Draft', 'Context', 'medium', '2026-10-08', undefined, 45, undefined])
  assert.equal(ui.render().find(node => node.props?.['aria-label'] === 'Task title').props.value, '')
})
test('unknown outcome blocks retries until refresh succeeds and preserves details', async () => {
  let attempts = 0; let refreshFails = true
  const ui = harness(async () => { attempts++; return { error: 'Unknown', unknownOutcome: true } }, async () => { if (refreshFails) throw Error('failed') })
  input(ui, 'Task title', 'Retain')
  await submit(ui); await submit(ui)
  assert.equal(attempts, 1)
  const review = () => ui.render().find(node => node.type === 'Button' && node.props.children === 'Review Board before retrying')
  await review().props.onClick()
  assert.equal(ui.render().find(node => node.props.type === 'submit').props.disabled, true)
  refreshFails = false; await review().props.onClick()
  assert.equal(ui.render().find(node => node.props.type === 'submit').props.disabled, false)
  assert.equal(ui.render().find(node => node.props?.['aria-label'] === 'Task title').props.value, 'Retain')
})
test('known rejection retains the draft and reports its error', async () => {
  const ui = harness(async () => ({ error: 'Title rejected' }))
  input(ui, 'Task title', 'Retain'); await submit(ui)
  assert.equal(ui.render().find(node => node.props.role === 'alert').props.children, 'Title rejected')
  assert.equal(ui.render().find(node => node.props.type === 'submit').props.disabled, false)
})

test('successful quick add announces the saved task and clears stale success on editing', async () => {
  const ui = harness(async () => ({}))
  input(ui, 'Task title', 'Draft'); await submit(ui)
  assert.equal(ui.render().find(node => node.props.role === 'status').props.children, 'Task added.')
  input(ui, 'Task title', 'Next')
  assert.equal(ui.render().some(node => node.props.role === 'status'), false)
})
module.exports = { harness }
test('transport exceptions retain a detailed draft without leaking internal errors', async () => {
  const ui = harness(async () => { throw Error('secret transport stack') })
  ui.render().find(node => node.props?.['aria-expanded'] === false).props.onClick()
  input(ui, 'Task title', 'Retain'); input(ui, 'Task description', 'Context'); input(ui, 'Task due date', '2026-10-08'); input(ui, 'Task due time', '13:30')
  await submit(ui)
  assert.equal(ui.render().find(node => node.props?.['aria-label'] === 'Task description').props.value, 'Context')
  assert.equal(ui.render().find(node => node.props?.['aria-label'] === 'Task due time').props.value, '13:30')
  assert.equal(ui.render().find(node => node.props.type === 'submit').props.disabled, true)
  assert.doesNotMatch(JSON.stringify(ui.render()), /secret transport stack/)
})
test('date with optional time sends a timestamp instead of an all day deadline', async () => {
  let saved
  const ui = harness(async (...args) => { saved = args; return {} })
  ui.render().find(node => node.props?.['aria-expanded'] === false).props.onClick()
  input(ui, 'Task title', 'Timed'); input(ui, 'Task due date', '2026-10-08'); input(ui, 'Task due time', '13:30')
  await submit(ui)
  assert.equal(saved[3], undefined)
  assert.equal(saved[6], '2026-10-08T13:30:00Z')
})
test('invalid estimate prevents a task mutation and keeps the input', async () => {
  let attempts = 0
  const ui = harness(async () => { attempts++; return {} })
  ui.render().find(node => node.props?.['aria-expanded'] === false).props.onClick()
  input(ui, 'Task title', 'Draft'); input(ui, 'Task estimate in minutes', '1.5')
  await submit(ui)
  assert.equal(attempts, 0)
  assert.match(ui.render().find(node => node.props.role === 'alert').props.children, /whole number/)
  assert.equal(ui.render().find(node => node.props?.['aria-label'] === 'Task estimate in minutes').props.value, '1.5')
})
