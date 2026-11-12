const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const graph = { success: true, tasks: [], dependencies: [], timezone: 'UTC', asOf: '2026-11-12T00:00:00Z' }
const workspace = id => ({ id, name: id, timezone: 'UTC' })
function harness(read) {
  const slots = [], effects = []
  let cursor = 0
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => v !== b[i])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useCallback(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  react.useLayoutEffect = react.useEffect
  const exports = {}
  const deps = { react, '@/app/actions/task-dependencies': { getTaskGraph: read }, '@/lib/read-coordinator': require('../lib/read-coordinator.ts'), '@/lib/next-work': require('../lib/next-work.ts') }
  const code = ts.transpileModule(fs.readFileSync('hooks/use-canvas-graph.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', code)(name => { assert.ok(name in deps, name); return deps[name] }, exports)
  return { render(actor = 'actor', id = 'w', signal = 0) { cursor = 0; const result = exports.useCanvasGraph(actor, id ? workspace(id) : undefined, signal); effects.splice(0).forEach(fn => fn()); return result }, unmount() { slots.forEach(slot => slot?.cleanup?.()) } }
}

test('complete graph loads and denied refresh removes all previous graph records', async () => {
  let denied = false
  const ui = harness(async () => denied ? { error: 'Access denied', code: 'forbidden' } : graph)
  assert.equal(ui.render().loading, true)
  await tick()
  assert.equal(ui.render().entry.complete, true)
  denied = true
  assert.equal(await ui.render().reload(), false)
  assert.equal(ui.render().entry, null)
  assert.equal(ui.render().error, 'Access denied')
})

test('old account and workspace reads cannot expose their records after a scope change', async () => {
  let finish
  const ui = harness(async id => id === 'w' ? new Promise(resolve => { finish = resolve }) : { ...graph, tasks: [{ id: 'new', workspaceId: 'other', title: 'New', completed: false }] })
  const old = ui.render()
  ui.render('new-actor', 'other')
  await tick()
  finish(graph); await tick()
  assert.equal(ui.render('new-actor', 'other').entry.graph.tasks[0].id, 'new')
  assert.equal(await old.reload(), false)
})

test('event bursts coalesce with one trailing authoritative read', async () => {
  let calls = 0, finish
  const ui = harness(async () => ++calls === 1 ? new Promise(resolve => { finish = resolve }) : graph)
  ui.render()
  for (let i = 1; i <= 10; i++) ui.render('actor', 'w', i)
  assert.equal(calls, 1)
  finish(graph); await tick()
  assert.equal(calls, 2)
})

test('unmount invalidates queued reads and old reload callbacks', async () => {
  let finish, calls = 0
  const ui = harness(async () => { calls++; return new Promise(resolve => { finish = resolve }) })
  const state = ui.render()
  ui.render('actor', 'w', 1)
  ui.unmount()
  finish(graph); await tick()
  assert.equal(calls, 1)
  assert.equal(await state.reload(), false)
})

test('a partial or invalid graph never becomes an empty successful canvas', async () => {
  const ui = harness(async () => ({ ...graph, dependencies: [{ workspaceId: 'w', prerequisiteTaskId: 'missing', dependentTaskId: 'other' }] }))
  ui.render(); await tick()
  assert.equal(ui.render().entry, null)
  assert.match(ui.render().error, /unavailable/i)
})

test('no selected workspace does not dispatch any graph reads', async () => {
  let reads = 0
  const ui = harness(async () => { reads++; return graph })
  assert.equal(ui.render('actor', null).entry, null)
  await tick()
  assert.equal(reads, 0)
})
