import assert from "node:assert/strict"
import test from "node:test"
import { installHistoryPositions, subscribeHistoryTraversal, publicHistoryState, readHistoryPosition, historyTraversalDelta } from "./browser-history.ts"

function browser() {
  const entries = [{ state: { __NA: true, custom: "kept" }, url: "/dashboard" }]
  let index = 0
  const listeners: ((event: PopStateEvent) => void)[] = []
  const window = { location: { href: "https://saathi.test/dashboard" }, addEventListener(_name: string, fn: (event: PopStateEvent) => void) { listeners.push(fn) }, history: {
    get state(): unknown { return entries[index].state },
    replaceState(state: typeof entries[number]["state"], _title: string, url?: string | URL | null) { entries[index] = { state, url: String(url ?? entries[index].url) } },
    pushState(state: typeof entries[number]["state"], _title: string, url?: string | URL | null) { entries.splice(++index); entries.push({ state, url: String(url) }) },
    go(delta: number) { index += delta; const event = { cancelBubble: false } as PopStateEvent; listeners.forEach(fn => fn(event)) },
  } }
  return { window: window as unknown as Window, entries, listeners }
}
test("positions cover foreign pages, reload, replace and branching without storage", () => {
  const ui = browser(), w = ui.window
  installHistoryPositions(w)
  const dashboard = readHistoryPosition(w)
  w.history.pushState({ __NA: true }, "", "/canvas")
  const canvas = readHistoryPosition(w)
  assert.equal(historyTraversalDelta(canvas, dashboard), 1)
  installHistoryPositions(w)
  assert.equal(ui.listeners.length, 1)
  w.history.replaceState({ __NA: true }, "", "/canvas?workspace=w")
  assert.deepEqual(readHistoryPosition(w), canvas)
  w.history.go(-1)
  w.history.pushState({}, "", "/archive")
  assert.equal(ui.entries.length, 2)
  assert.equal(historyTraversalDelta(readHistoryPosition(w), dashboard), 1)
  assert.equal(historyTraversalDelta(dashboard, readHistoryPosition(w)), -1)
  const reloaded = browser()
  reloaded.window.history.replaceState(w.history.state, "", "/archive")
  installHistoryPositions(reloaded.window)
  assert.deepEqual(readHistoryPosition(reloaded.window), readHistoryPosition(w))
})
test("public writes retain unrelated metadata without Next internal markers", () => {
  assert.deepEqual(publicHistoryState({ __NA: true, _N: true, __N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"], custom: "kept" }), { custom: "kept" })
  assert.equal(historyTraversalDelta({ session: "a", index: 1, nativeIndex: null }, { session: null, index: null, nativeIndex: null }), null)
  assert.equal(historyTraversalDelta({ session: null, index: null, nativeIndex: 3 }, { session: null, index: null, nativeIndex: 1 }), 2)
})
test("traversal subscriptions see updated positions, clean up and reconnect without native listener churn", () => {
  const ui = browser(), w = ui.window
  installHistoryPositions(w)
  const initial = readHistoryPosition(w)
  w.history.pushState({}, "", "/canvas")
  const observed: number[] = []
  const callback = () => { observed.push(historyTraversalDelta(readHistoryPosition(w), initial)!) }
  const unsubscribe = subscribeHistoryTraversal(w, callback)
  w.history.go(-1)
  assert.deepEqual(observed, [0])
  unsubscribe(); w.history.go(1)
  assert.deepEqual(observed, [0])
  const disconnect = subscribeHistoryTraversal(w, callback)
  w.history.go(-1)
  assert.deepEqual(observed, [0, 0])
  disconnect()
  assert.equal(ui.listeners.length, 1)
})
