const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

function harness() {
  const slots = [], sources = [], resyncs = [], errors = []
  let cursor = 0, effects = [], props = { workspaceId: 'workspace' }
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }; return slots[index].callback },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = effect() }) } },
  }
  class EventSource { constructor() { sources.push(this) } close() { this.closed = true } }
  const dependencies = { react, '@/lib/realtime-event': { normalizeRealtimeEvent: event => event }, '@/lib/realtime-sse': { shouldProcessEvent: () => true } }
  const exports = {}
  const source = ts.transpileModule(readFileSync('hooks/useRealtime.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'EventSource', 'window', 'console', source)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, EventSource,
    { addEventListener() {}, removeEventListener() {} }, { log() {}, error() {} })
  return {
    render(overrides = {}) { props = { ...props, ...overrides }; cursor = 0; const value = exports.useRealtime({ ...props, onResyncRequired: () => resyncs.push(props.workspaceId), onError: event => errors.push(event) }); effects.splice(0).forEach(effect => effect()); return value },
    sources, resyncs, errors,
    message(source, type, data = {}) { source.onmessage({ data: JSON.stringify({ type, data }), lastEventId: '' }) },
    unmount() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('connection loss revalidates current data before a reconnect and suppresses repeated outage refreshes', () => {
  const ui = harness(); ui.render()
  const source = ui.sources[0]; source.onopen()
  const before = ui.render().eventRevision, reads = ui.resyncs.length
  source.onerror({ type: 'error' })
  assert.equal(ui.render().eventRevision, before + 1)
  assert.equal(ui.resyncs.length, reads + 1)
  for (let index = 0; index < 20; index++) {
    source.onerror({ type: 'error' })
    ui.message(source, 'error', { message: 'Workspace access ended' })
  }
  assert.equal(ui.render().eventRevision, before + 1)
  assert.equal(ui.resyncs.length, reads + 1)
  assert.equal(ui.errors.length, 21, 'existing error observers still receive transport errors')
  assert.equal(ui.render().isConnected, false)
  source.onopen()
  assert.equal(ui.render().eventRevision, before + 2, 'successful reconnect retains its existing refresh')
  source.onerror({})
  assert.equal(ui.render().eventRevision, before + 3, 'a later outage gets its own single revalidation')
})

test('policy error controls revalidate once and stale or unmounted sources cannot invalidate a new scope', () => {
  const ui = harness(); ui.render()
  const old = ui.sources[0]
  ui.message(old, 'error', { message: 'Workspace access ended' })
  assert.equal(ui.render().eventRevision, 1)
  assert.deepEqual(ui.resyncs, ['workspace'])
  ui.message(old, 'error'); old.onerror({})
  assert.equal(ui.render().eventRevision, 1)
  ui.render({ workspaceId: 'other' })
  const current = ui.sources.at(-1)
  old.onerror({}); ui.message(old, 'error')
  assert.equal(ui.render().eventRevision, 1)
  current.onerror({})
  assert.equal(ui.render().eventRevision, 2)
  assert.deepEqual(ui.resyncs, ['workspace', 'other'])
  ui.unmount(); current.onerror({}); ui.message(current, 'error')
  assert.equal(ui.resyncs.length, 2)
})

test('successful stream activity rearms a later policy loss without requiring a native reconnect', () => {
  const ui = harness(); ui.render()
  const source = ui.sources[0]
  ui.message(source, 'error')
  assert.equal(ui.resyncs.length, 1)
  ui.message(source, 'heartbeat')
  assert.equal(ui.render().isConnected, true)
  ui.message(source, 'error')
  assert.equal(ui.resyncs.length, 2)
  ui.message(source, 'error'); source.onerror({})
  assert.equal(ui.resyncs.length, 2)
})
