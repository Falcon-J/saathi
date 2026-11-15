// Regression probe: controls with inherited SSE IDs must remain actionable.
const fs = require('node:fs')
const ts = require('typescript')
const assert = require('node:assert/strict')
const slots = [], sources = []
let cursor = 0, effects = [], resyncs = 0, taskEvents = 0
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const react = {
  useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
  useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
  useCallback(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback },
  useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect() }) } },
}
class EventSource { constructor() { sources.push(this) } close() {} }
const window = { addEventListener() {}, removeEventListener() {} }
function load(file, dependencies) {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', 'EventSource', 'window', 'console', js)(name => {
    assert.ok(name in dependencies, name); return dependencies[name]
  }, exports, EventSource, window, { log() {}, error() {} })
  return exports
}
const identity = load('lib/identity.ts', {})
const policy = load('lib/workspace-policy.ts', { './identity.ts': identity })
const helpers = load('lib/realtime-sse.ts', { './workspace-policy.ts': policy })
const contract = load('lib/realtime-event.ts', { zod: require('zod') })
const { useRealtime } = load('hooks/useRealtime.ts', { react, '@/lib/realtime-sse': helpers, '@/lib/realtime-event': contract })
function render() {
  cursor = 0
  const state = useRealtime({ workspaceId: 'workspace', onTaskCreated: () => taskEvents++, onResyncRequired: () => resyncs++ })
  const pending = effects; effects = []; pending.forEach(effect => effect())
  return state
}
const taskEvent = { type: 'task-created', workspaceId: 'workspace', userId: 'member', timestamp: 100, data: {} }
render()
sources[0].onopen()
sources[0].onmessage({ data: JSON.stringify(taskEvent), lastEventId: '100-0' })
sources[0].onmessage({ data: JSON.stringify(taskEvent), lastEventId: '100-0' })
const before = { resyncs, revision: render().eventRevision }
// WHATWG EventSource retains the last id for subsequent messages without an id field.
sources[0].onmessage({ data: JSON.stringify({ type: 'heartbeat', data: { activeUsers: ['member@example.test'] } }), lastEventId: '100-0' })
sources[0].onmessage({ data: JSON.stringify({ type: 'resync-required', data: {} }), lastEventId: '100-0' })
sources[0].onmessage({ data: JSON.stringify({ type: 'error', data: { message: 'Realtime unavailable' } }), lastEventId: '100-0' })
const state = render()
const observed = { taskEvents, before, after: { resyncs, revision: state.eventRevision, activeUsers: state.activeUsers, isConnected: state.isConnected, error: state.error } }
assert.equal(taskEvents, 1)
assert.equal(resyncs, before.resyncs + 2, 'missed-event and policy-error controls both revalidate current records')
assert.deepEqual(state.activeUsers, ['member@example.test'])
assert.equal(state.error, 'Realtime unavailable')
assert.equal(state.isConnected, false)
assert.equal(state.eventRevision, before.revision + 2)
for (const [index, invalid] of [
  { ...taskEvent, type: 'unknown' }, { ...taskEvent, workspaceId: 'another-workspace' },
  { ...taskEvent, userId: undefined }, { ...taskEvent, timestamp: 'yesterday' }, { ...taskEvent, data: null },
].entries()) {
  const id = `200-${index}`, beforeInvalid = render().eventRevision, beforeTasks = taskEvents
  sources[0].onmessage({ data: JSON.stringify(invalid), lastEventId: id })
  assert.equal(render().eventRevision, beforeInvalid, 'invalid or cross-workspace domain events must be ignored')
  sources[0].onmessage({ data: JSON.stringify(taskEvent), lastEventId: id })
  assert.equal(taskEvents, beforeTasks + 1, 'invalid events must not poison the replay cache')
}
sources[0].onmessage({ data: JSON.stringify({ type: 'error', data: { message: { unexpected: 'object' } } }), lastEventId: '200-4' })
assert.equal(render().error, 'Realtime updates are temporarily unavailable', 'control errors must remain renderable strings')
const beforeReconnect = render().eventRevision
render().connect()
sources[0].onmessage({ data: JSON.stringify(taskEvent), lastEventId: '300-0' })
assert.equal(render().eventRevision, beforeReconnect, 'a replaced source cannot update the current subscription')
sources[1].onmessage({ data: JSON.stringify(taskEvent), lastEventId: '300-0' })
assert.equal(render().eventRevision, beforeReconnect + 1, 'a stale source cannot poison the new source replay cache')
console.log(JSON.stringify({ passed: true, observed }, null, 2))
