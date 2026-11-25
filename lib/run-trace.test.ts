import assert from "node:assert/strict"
import test from "node:test"
import { buildRunGraph, edgeKey, findFailure, foldState, normalizeEvents, traceFailure, type RunEvent } from "./run-trace.ts"
import { demoRun } from "./run-trace-demo.ts"

test("finds the stale cached read as the root cause of the demo failure", () => {
  const graph = buildRunGraph(demoRun.events)
  const failure = findFailure(graph)
  assert.equal(failure, 10)
  const trace = traceFailure(graph, failure!)
  assert.deepEqual(trace.root, { readerSeq: 5, key: "task.SAA-139", versionSeen: 1, latestVersion: 2, latestWriterSeq: 4 })
  assert.deepEqual([...trace.nodes].sort((a, b) => a - b), [5, 7, 9, 10])
  assert.ok(trace.edges.has("5>7") && trace.edges.has("7>9") && trace.edges.has("9>10"))
  assert.ok(!trace.nodes.has(6), "the fresh spec read is not on the causal path")
})

test("folds state in sequence order and bumps versions per write", () => {
  const state = foldState(demoRun.events, 4)
  assert.equal(state.get("task.SAA-139")?.value, "in progress")
  assert.equal(state.get("task.SAA-139")?.version, 2)
  assert.equal(state.has("pr"), false)
})

test("out-of-order and duplicate delivery fold to the same graph", () => {
  const shuffled = [...demoRun.events].reverse().concat(demoRun.events[3])
  assert.deepEqual(normalizeEvents(shuffled).map(event => event.seq), demoRun.events.map(event => event.seq))
  assert.deepEqual(buildRunGraph(shuffled).edges, buildRunGraph(demoRun.events).edges)
})

test("a failure with only fresh reads returns its full slice and no root cause", () => {
  const events: RunEvent[] = [
    { seq: 1, atMs: 0, kind: "start", label: "a", reads: [], writes: [{ key: "x", value: 1 }] },
    { seq: 2, atMs: 1, kind: "tool", label: "b", reads: [{ key: "x", version: 1 }], writes: [{ key: "y", value: 2 }] },
    { seq: 3, atMs: 2, kind: "error", label: "c", reads: [{ key: "y", version: 1 }], writes: [] },
  ]
  const trace = traceFailure(buildRunGraph(events), 3)
  assert.equal(trace.root, null)
  assert.deepEqual([...trace.nodes].sort(), [1, 2, 3])
})

test("on random runs the root cause is a stale read that reaches the failure", () => {
  let seed = 7
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  for (let run = 0; run < 200; run++) {
    const keys = ["a", "b", "c", "d"]
    const versions = new Map<string, number>()
    const events: RunEvent[] = []
    const count = 4 + Math.floor(random() * 20)
    for (let seq = 1; seq <= count; seq++) {
      const known = keys.filter(key => versions.has(key))
      const reads = known.filter(() => random() < 0.5).map(key => ({ key, version: Math.max(1, versions.get(key)! - (random() < 0.2 ? 1 : 0)) }))
      const writes = keys.filter(() => random() < 0.3).map(key => ({ key, value: seq }))
      const kind = seq === count ? "error" : random() < 0.15 ? "external" : "tool"
      events.push({ seq, atMs: seq, kind, label: String(seq), reads: kind === "external" ? [] : reads, writes })
      for (const write of writes) versions.set(write.key, (versions.get(write.key) ?? 0) + 1)
    }
    const graph = buildRunGraph(events)
    const trace = traceFailure(graph, count)
    for (const seq of trace.nodes) assert.ok(seq <= count)
    for (const edge of graph.edges) assert.ok(edge.from < edge.to, "provenance only points forward")
    if (trace.root) {
      assert.ok(trace.nodes.has(trace.root.readerSeq))
      assert.ok(trace.root.versionSeen < trace.root.latestVersion)
      const earlier = graph.stale.filter(read => read.readerSeq < trace.root!.readerSeq)
      for (const read of earlier) assert.ok(!traceFailure(graph, count).nodes.has(read.readerSeq) || read.readerSeq >= trace.root.readerSeq)
    }
    for (const key of trace.edges) assert.ok(graph.edges.some(edge => edgeKey(edge) === key))
  }
})
