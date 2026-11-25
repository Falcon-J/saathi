/**
 * Run trace: turns an agent run's event log into a graph and finds why it failed.
 *
 * Each event lists the state it read (key + version seen) and the state it wrote.
 * Events by other people ("external") also write state, which is how a read goes stale.
 * Everything here is a pure fold over the log, so live view and replay share one code path.
 */
export type RunEventKind = "start" | "tool" | "decision" | "error" | "end" | "external"
export type RunRead = { key: string; version: number; source?: "live" | "cache"; ageMs?: number }
export type RunWrite = { key: string; value: unknown }
export type RunEvent = { seq: number; atMs: number; kind: RunEventKind; label: string; actor?: string; reads: RunRead[]; writes: RunWrite[]; detail?: string }
export type StateEntry = { value: unknown; version: number; writerSeq: number }
export type RunEdge = { from: number; to: number; key: string; stale: boolean }
export type StaleRead = { readerSeq: number; key: string; versionSeen: number; latestVersion: number; latestWriterSeq: number }
export type RunGraph = { events: RunEvent[]; edges: RunEdge[]; stale: StaleRead[]; layer: Map<number, number> }
export type FailureTrace = { failureSeq: number; nodes: Set<number>; edges: Set<string>; root: StaleRead | null }

export const edgeKey = (edge: Pick<RunEdge, "from" | "to">) => `${edge.from}>${edge.to}`

/** Orders by sequence id and drops duplicate deliveries, so out-of-order or replayed streams fold the same way. */
export function normalizeEvents(events: readonly RunEvent[]): RunEvent[] {
  const bySeq = new Map<number, RunEvent>()
  for (const event of events) if (!bySeq.has(event.seq)) bySeq.set(event.seq, event)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

/** State after every event with seq <= upToSeq. Each write bumps that key's version by one. */
export function foldState(events: readonly RunEvent[], upToSeq = Number.POSITIVE_INFINITY): Map<string, StateEntry> {
  const state = new Map<string, StateEntry>()
  for (const event of normalizeEvents(events)) {
    if (event.seq > upToSeq) break
    for (const write of event.writes) state.set(write.key, { value: write.value, version: (state.get(write.key)?.version ?? 0) + 1, writerSeq: event.seq })
  }
  return state
}

/** Builds provenance edges (writer of the version read -> reader) and flags reads that were behind the latest version. O(events + reads + writes). */
export function buildRunGraph(input: readonly RunEvent[]): RunGraph {
  const events = normalizeEvents(input)
  const history = new Map<string, number[]>() // key -> writer seq for version index + 1
  const edges: RunEdge[] = []
  const stale: StaleRead[] = []
  const layer = new Map<number, number>()
  for (const event of events) {
    let depth = 0
    for (const read of event.reads) {
      const writers = history.get(read.key) ?? []
      const writerSeq = writers[read.version - 1]
      const latestVersion = writers.length
      const isStale = read.version < latestVersion
      if (writerSeq !== undefined) {
        edges.push({ from: writerSeq, to: event.seq, key: read.key, stale: isStale })
        depth = Math.max(depth, (layer.get(writerSeq) ?? 0) + 1)
      }
      if (isStale) stale.push({ readerSeq: event.seq, key: read.key, versionSeen: read.version, latestVersion, latestWriterSeq: writers[latestVersion - 1] })
    }
    if (event.kind !== "external" && event.reads.length === 0 && event.seq !== events[0]?.seq) {
      // An agent step that reads nothing still follows the previous agent step.
      const previous = [...layer.keys()].reverse().find(seq => events.find(e => e.seq === seq)?.kind !== "external")
      if (previous !== undefined) depth = Math.max(depth, (layer.get(previous) ?? 0) + 1)
    }
    layer.set(event.seq, depth)
    for (const write of event.writes) history.set(write.key, [...(history.get(write.key) ?? []), event.seq])
  }
  return { events, edges, stale, layer }
}

/**
 * Backward slice from the failure: every step whose writes reached it. The root cause is the earliest
 * stale read inside that slice; the returned path keeps only the steps that connect it to the failure.
 */
export function traceFailure(graph: RunGraph, failureSeq: number): FailureTrace {
  const incoming = new Map<number, RunEdge[]>()
  for (const edge of graph.edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
  const slice = new Set<number>([failureSeq])
  const stack = [failureSeq]
  while (stack.length) {
    const seq = stack.pop()!
    for (const edge of incoming.get(seq) ?? []) if (!slice.has(edge.from)) { slice.add(edge.from); stack.push(edge.from) }
  }
  const root = graph.stale.filter(read => slice.has(read.readerSeq)).sort((a, b) => a.readerSeq - b.readerSeq)[0] ?? null
  if (!root) {
    const edges = new Set(graph.edges.filter(edge => slice.has(edge.from) && slice.has(edge.to)).map(edgeKey))
    return { failureSeq, nodes: slice, edges, root: null }
  }
  // Keep the steps downstream of the root that still reach the failure.
  const outgoing = new Map<number, RunEdge[]>()
  for (const edge of graph.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  const reachable = new Set<number>([root.readerSeq])
  const queue = [root.readerSeq]
  while (queue.length) {
    const seq = queue.shift()!
    for (const edge of outgoing.get(seq) ?? []) if (slice.has(edge.to) && !reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to) }
  }
  const nodes = new Set([...reachable].filter(seq => slice.has(seq)))
  const edges = new Set(graph.edges.filter(edge => nodes.has(edge.from) && nodes.has(edge.to)).map(edgeKey))
  return { failureSeq, nodes, edges, root }
}

/** The failing step: the last error event, if any. */
export const findFailure = (graph: RunGraph) => [...graph.events].reverse().find(event => event.kind === "error")?.seq ?? null
