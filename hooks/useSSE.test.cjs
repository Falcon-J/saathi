const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "useSSE.ts"), "utf8")

test("SSE effect depends on a stable connect callback", () => {
  assert.match(source, /useCallback/)
  assert.match(source, /const optionsRef = useRef\(options\)/)
  assert.match(source, /optionsRef\.current = options/)
  assert.match(source, /}, \[connect, disconnect\]\)/)
})

test('reconnection without replay and resync-required invalidate the paged Board', async () => {
  const ts = require('typescript'), slots = [], sources = [], actions = [], onlineListeners = new Set()
  const window = {
    addEventListener(type, listener) { assert.equal(type, 'online'); onlineListeners.add(listener) },
    removeEventListener(type, listener) { assert.equal(type, 'online'); onlineListeners.delete(listener) },
  }
  let cursor = 0, effects = [], missedTask = false, resyncs = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }; return slots[index].callback },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { slots[index]?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = effect() }) } },
  }
  react.useLayoutEffect = react.useEffect
  class EventSource {
    constructor() { sources.push(this) }
    close() { this.closed = true }
  }
  const load = (filename, dependencies) => {
    const exports = {}
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'exports', 'EventSource', 'console', 'window', js)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, EventSource, { log() {}, error() {} }, window)
    return exports
  }
  const { useRealtime } = load('hooks/useRealtime.ts', { react, '@/lib/realtime-sse': { shouldProcessEvent: () => true } })
  const { useTaskBoard } = load('hooks/use-task-board.ts', { react, '@/app/tasks/actions': {
    getTasksPage: async () => { actions.push('page'); return { tasks: missedTask ? [{ id: 'missed-task' }] : [], nextCursor: null } },
    getWorkspaceTaskAggregates: async () => { actions.push('aggregates'); return { aggregates: { total: missedTask ? 1 : 0 } } },
    getTasks: async () => { throw new Error('Board must not fetch the full task collection') },
  } })
  const render = (workspaceId = 'workspace') => {
    cursor = 0
    const realtime = useRealtime({ workspaceId, onResyncRequired: () => { resyncs++ } })
    const board = useTaskBoard(workspaceId, realtime.eventRevision)
    const pending = effects; effects = []; pending.forEach(effect => effect())
    return { realtime, board }
  }
  const tick = () => new Promise(resolve => setImmediate(resolve))
  render(); await tick(); render()
  sources[0].onopen(); render(); await tick()
  const before = render(), readsBefore = actions.length
  missedTask = true
  sources[0].onerror({}); sources[0].onopen()
  const reconnected = render(); await tick()
  assert.equal(reconnected.realtime.eventRevision, before.realtime.eventRevision + 1)
  assert.equal(actions.length, readsBefore + 2)
  assert.deepEqual(render().board.tasks, [{ id: 'missed-task' }])
  const beforeGap = render().realtime.eventRevision
  sources[0].onmessage({ data: JSON.stringify({ type: 'resync-required' }), lastEventId: '' })
  render(); await tick()
  assert.equal(render().realtime.eventRevision, beforeGap + 1)
  assert.ok(resyncs >= 3)
  assert.equal(sources.length, 1, 'native reconnect must retain the same EventSource')
  const beforeOnline = render().realtime.eventRevision
  assert.equal(onlineListeners.size, 1)
  for (const listener of onlineListeners) listener()
  assert.equal(sources.length, 2, 'restoring network must promptly replace the stalled source')
  assert.equal(sources[0].closed, true)
  sources[1].onopen(); render(); await tick()
  assert.equal(render().realtime.eventRevision, beforeOnline + 1)
  render('other-workspace'); await tick()
  assert.equal(onlineListeners.size, 1, 'workspace changes must replace the listener')
  assert.equal(sources[1].closed, true)
  const latest = sources.at(-1), count = sources.length
  render(''); await tick()
  assert.equal(onlineListeners.size, 0)
  assert.equal(latest.closed, true)
  for (const listener of onlineListeners) listener()
  assert.equal(sources.length, count, 'empty workspace must not reconnect')
  render('workspace'); await tick()
  const mountedSource = sources.at(-1)
  slots.forEach(slot => slot?.cleanup?.())
  assert.equal(onlineListeners.size, 0, 'unmount must remove the online listener')
  assert.equal(mountedSource.closed, true)
})
