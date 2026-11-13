const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const tick = () => new Promise(resolve => setImmediate(resolve))
const item = id => ({ id, title: id, workspaceId: 'workspace', workspaceName: 'Delivery' })

function harness(read) {
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, now = 0, nextTimer = 0, writes = 0
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index])
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => {
        writes++
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value
      }]
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!changed(slots[index]?.deps, deps)) return
      const previous = slots[index]
      slots[index] = { deps }
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn() })
    },
  }
  const deps = { react, '@/app/actions/canvas-search': { searchCanvas: read } }
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('components/canvas/use-canvas-search.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', code)(name => {
    assert.ok(name in deps, name)
    return deps[name]
  }, exports, (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id }, id => timers.delete(id))
  return {
    render(query = 'handoff', enabled = true, resourceId, revision = 'actor:0') {
      cursor = 0
      const result = exports.useCanvasSearch(query, enabled, resourceId, revision)
      effects.splice(0).forEach(fn => fn())
      return result
    },
    advance(milliseconds) {
      now += milliseconds
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn() }
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
    writes: () => writes,
  }
}

test('short, excessive and disabled queries dispatch no request; typing is debounced to the latest trimmed query', async () => {
  const calls = []
  const ui = harness(async input => { calls.push(input); return { items: [] } })
  for (const [query, enabled] of [['', true], ['x', true], ['x'.repeat(121), true], ['handoff', false]]) {
    assert.equal(ui.render(query, enabled).loading, false)
    ui.advance(1000)
  }
  assert.deepEqual(calls, [])
  assert.equal(ui.render('  hand  ').loading, true)
  ui.advance(199)
  assert.equal(calls.length, 0)
  ui.render('  handoff  ')
  ui.advance(199)
  assert.equal(calls.length, 0)
  ui.advance(1)
  await tick()
  assert.deepEqual(calls, [{ query: 'handoff' }])
  assert.equal(ui.render('  handoff  ').loading, false)
})

test('late responses cannot replace new query, resource, account or authorization revision results', async () => {
  for (const next of [
    ['other', true, undefined, 'actor:0'],
    ['handoff', true, 'section', 'actor:0'],
    ['handoff', true, undefined, 'other-actor:0'],
    ['handoff', true, undefined, 'actor:1'],
  ]) {
    const pending = []
    const ui = harness(input => new Promise(resolve => pending.push({ input, resolve })))
    ui.render(); ui.advance(200)
    assert.equal(pending.length, 1)
    assert.deepEqual(ui.render(...next).items, [])
    ui.advance(200)
    pending[1].resolve({ items: [item('current')] }); await tick()
    assert.equal(ui.render(...next).items[0].id, 'current')
    pending[0].resolve({ items: [item('stale-private')] }); await tick()
    assert.deepEqual(ui.render(...next).items.map(value => value.id), ['current'])
  }
})

test('empty query and disabled scope immediately hide previously authorized results', async () => {
  const ui = harness(async () => ({ items: [item('previous')] }))
  ui.render(); ui.advance(200); await tick()
  assert.equal(ui.render().items.length, 1)
  assert.deepEqual(ui.render('').items, [])
  assert.deepEqual(ui.render('handoff', false).items, [])
})

test('unmount cancels pending debounce and ignores an already dispatched response', async () => {
  let calls = 0, finish
  const early = harness(async () => { calls++; return { items: [] } })
  early.render(); early.unmount(); early.advance(200)
  assert.equal(calls, 0)
  const late = harness(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  late.render(); late.advance(200); late.unmount()
  const before = late.writes()
  finish({ items: [item('discarded')] }); await tick()
  assert.equal(late.writes(), before)
})

test('failed search has explicit recovery and retries the same scope without retaining old results', async () => {
  const calls = []
  let rejected = true
  const ui = harness(async input => {
    calls.push(input)
    if (rejected) throw new Error('private diagnostic')
    return { items: [item('recovered')] }
  })
  ui.render('handoff', true, 'section'); ui.advance(200); await tick()
  const failed = ui.render('handoff', true, 'section')
  assert.equal(failed.loading, false)
  assert.equal(failed.error, 'Search unavailable. Try again.')
  assert.deepEqual(failed.items, [])
  rejected = false; failed.retry()
  assert.equal(ui.render('handoff', true, 'section').loading, true)
  ui.advance(200); await tick()
  const recovered = ui.render('handoff', true, 'section')
  assert.equal(recovered.error, undefined)
  assert.equal(recovered.items[0].id, 'recovered')
  assert.deepEqual(calls, [{ query: 'handoff', resourceId: 'section' }, { query: 'handoff', resourceId: 'section' }])
})
