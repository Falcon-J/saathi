"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Background, Handle, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { buildRunGraph, edgeKey, findFailure, foldState, traceFailure, type FailureTrace, type RunEvent } from "@/lib/run-trace"

type Run = { id: string; title: string; agent: string; events: RunEvent[] }
type StepData = { event: RunEvent; tone: "default" | "selected" | "failure" | "root" | "external"; dim: boolean; future: boolean }
type StepNode = Node<StepData, "step">

const COLUMN = 165
const ROW = 88
const kindLabel: Record<RunEvent["kind"], string> = { start: "Start", tool: "Tool", decision: "Decision", error: "Error", end: "End", external: "Someone else" }
const show = (value: unknown) => typeof value === "string" ? `"${value}"` : JSON.stringify(value)

function StepCard({ data }: NodeProps<StepNode>) {
  const { event, tone, dim, future } = data
  return (
    <div className={cn(
      "w-36 rounded-[var(--saathi-radius-card)] border bg-card px-3 py-2 text-left shadow-[var(--saathi-shadow-card)] transition-opacity",
      tone === "selected" && "border-primary bg-accent ring-2 ring-primary",
      tone === "failure" && "border-destructive bg-[var(--saathi-danger-soft)]",
      tone === "root" && "border-[var(--saathi-warning)] bg-[var(--saathi-warning-soft)] ring-2 ring-[var(--saathi-warning)]",
      tone === "external" && "border-dashed",
      tone === "default" && "border-border",
      dim && "opacity-35", future && "opacity-15",
    )}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-[var(--saathi-line-strong)]" />
      <p className="text-xs text-muted-foreground">{event.seq} · {event.kind === "external" ? event.actor ?? kindLabel.external : kindLabel[event.kind]}</p>
      <p className="truncate text-sm font-medium text-foreground">{event.label}</p>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-[var(--saathi-line-strong)]" />
    </div>
  )
}
const nodeTypes = { step: StepCard }

export function RunInspector({ run }: { run: Run }) {
  const graph = useMemo(() => buildRunGraph(run.events), [run.events])
  const failureSeq = useMemo(() => findFailure(graph), [graph])
  const last = graph.events[graph.events.length - 1]?.seq ?? 0
  const [cursor, setCursor] = useState(last)
  const [selected, setSelected] = useState(failureSeq ?? last)
  const [trace, setTrace] = useState<FailureTrace | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const positions = useMemo(() => {
    const rows = new Map<number, number>()
    const placed = new Map<number, { x: number; y: number }>()
    let lastAgent = 0
    for (const event of graph.events) {
      if (event.kind === "external") { placed.set(event.seq, { x: ((graph.layer.get(lastAgent) ?? 0) + 0.5) * COLUMN, y: 3 * ROW }); continue }
      lastAgent = event.seq
      const layer = graph.layer.get(event.seq) ?? 0
      const row = rows.get(layer) ?? 0
      rows.set(layer, row + 1)
      placed.set(event.seq, { x: layer * COLUMN, y: (row === 0 ? 1 : row === 1 ? 0 : 2) * ROW })
    }
    return placed
  }, [graph])

  const nodes = useMemo<StepNode[]>(() => graph.events.map(event => {
    const tone = trace?.root?.readerSeq === event.seq ? "root" : event.seq === selected ? "selected" : event.seq === failureSeq && cursor >= event.seq ? "failure" : event.kind === "external" ? "external" : "default"
    const missed = trace?.root?.latestWriterSeq === event.seq
    return { id: String(event.seq), type: "step", position: positions.get(event.seq)!, draggable: false, connectable: false,
      data: { event, tone, dim: Boolean(trace && !trace.nodes.has(event.seq) && !missed), future: event.seq > cursor } }
  }), [graph, trace, selected, failureSeq, cursor, positions])

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = graph.edges.map(edge => {
      const onPath = trace?.edges.has(edgeKey(edge)) ?? false
      return { id: `${edgeKey(edge)}:${edge.key}`, source: String(edge.from), target: String(edge.to), animated: false,
        style: { stroke: onPath ? "var(--destructive)" : "var(--saathi-line-strong)", strokeWidth: onPath ? 2.5 : 1.25, opacity: edge.to > cursor ? 0.15 : trace && !onPath ? 0.3 : 1 } }
    })
    if (trace?.root) list.push({ id: "missed", source: String(trace.root.latestWriterSeq), target: String(trace.root.readerSeq), label: "missed this change",
      style: { stroke: "var(--saathi-warning)", strokeWidth: 2, strokeDasharray: "6 4" }, labelStyle: { fill: "var(--foreground)", fontSize: 12 }, labelBgStyle: { fill: "var(--card)" } })
    return list
  }, [graph, trace, cursor])

  const event = graph.events.find(item => item.seq === selected) ?? graph.events[0]
  const before = foldState(graph.events, (event?.seq ?? 1) - 1)
  const staleHere = graph.stale.filter(read => read.readerSeq === event?.seq)
  const status = failureSeq !== null && cursor >= failureSeq ? `Failed at step ${failureSeq}` : cursor >= last ? "Finished" : "Running…"

  const move = (seq: number) => { setCursor(seq); setSelected(seq); setTrace(null) }
  const replay = () => {
    if (timer.current) clearInterval(timer.current)
    const first = graph.events[0]?.seq ?? 0
    move(first)
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    timer.current = setInterval(() => setCursor(current => {
      const next = graph.events.find(item => item.seq > current)?.seq
      if (next === undefined) { if (timer.current) clearInterval(timer.current); return current }
      setSelected(next)
      return next
    }), reduced ? 60 : 600)
  }
  const explain = () => {
    if (failureSeq === null) return
    if (trace) { setTrace(null); setSelected(failureSeq); return }
    if (timer.current) clearInterval(timer.current)
    const result = traceFailure(graph, failureSeq)
    setCursor(last); setTrace(result); setSelected(result.root?.readerSeq ?? failureSeq)
  }

  return (
    <section aria-label="Agent run inspector" className="overflow-hidden rounded-[var(--saathi-radius-container)] border border-border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="font-semibold">{run.title}</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", status.startsWith("Failed") ? "bg-[var(--saathi-danger-soft)] text-destructive" : "bg-muted text-muted-foreground")}>{status}</span>
        <span className="text-sm text-muted-foreground">{run.agent}</span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={replay}>Replay</Button>
          {failureSeq !== null && <Button type="button" onClick={explain}>{trace ? "Clear trace" : "Why did it fail?"}</Button>}
        </div>
      </header>
      <div className="grid lg:grid-cols-[1fr_22rem]">
        <div className="h-[26rem] border-b border-border bg-background lg:border-b-0 lg:border-r [&_.react-flow__attribution]:!bg-card [&_.react-flow__attribution_a]:text-muted-foreground">
          <ReactFlowProvider>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08 }} nodesDraggable={false} nodesConnectable={false}
              onNodeClick={(_, node) => { const seq = Number(node.id); if (seq <= cursor) setSelected(seq) }} minZoom={0.25} maxZoom={1.5} aria-label="Run graph">
              <Background gap={24} size={1.2} color="var(--border)" />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        <aside aria-live="polite" className="space-y-4 p-4">
          {trace?.root && event?.seq === trace.root.readerSeq && <p className="rounded-[var(--saathi-radius-card)] border border-[var(--saathi-warning)] bg-[var(--saathi-warning-soft)] p-3 text-sm">
            <strong>Root cause.</strong> This step read <code>{trace.root.key}</code> at version {trace.root.versionSeen}, but step {trace.root.latestWriterSeq} had already changed it to version {trace.root.latestVersion}. Every highlighted step after it trusted the old value.</p>}
          {trace && !trace.root && event?.seq === failureSeq && <p className="rounded-[var(--saathi-radius-card)] border border-border bg-muted p-3 text-sm">No stale read reached this failure. The highlighted steps are everything that fed into it.</p>}
          {!trace && event?.seq === failureSeq && <p className="rounded-[var(--saathi-radius-card)] border border-destructive/40 bg-[var(--saathi-danger-soft)] p-3 text-sm"><strong>Failure.</strong> {event.detail} Press “Why did it fail?” to trace it.</p>}
          {event && <div>
            <h3 className="font-semibold">Step {event.seq}: {event.label}</h3>
            <p className="text-sm text-muted-foreground">{event.kind === "external" ? `${event.actor ?? "Someone"} changed this` : kindLabel[event.kind]} · +{(event.atMs / 1000).toFixed(2)}s</p>
            {event.detail && event.seq !== failureSeq && <p className="mt-1 text-sm">{event.detail}</p>}
          </div>}
          {event && event.reads.length > 0 && <div><p className="text-sm text-muted-foreground">Read</p>
            <pre className="mt-1 whitespace-pre-wrap rounded-[var(--saathi-radius-control)] bg-muted p-3 font-mono text-xs">{event.reads.map(read => {
              const stale = staleHere.find(item => item.key === read.key)
              return `${read.key} v${read.version}${read.source === "cache" ? " (cache)" : ""}${stale ? `  ← latest was v${stale.latestVersion}` : ""}`
            }).join("\n")}</pre></div>}
          {event && event.writes.length > 0 && <div><p className="text-sm text-muted-foreground">State change</p>
            <pre className="mt-1 whitespace-pre-wrap rounded-[var(--saathi-radius-control)] bg-muted p-3 font-mono text-xs">{event.writes.map(write => {
              const previous = before.get(write.key)
              return (previous ? `- ${write.key} = ${show(previous.value)}\n` : "") + `+ ${write.key} = ${show(write.value)}`
            }).join("\n")}</pre></div>}
        </aside>
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
        <Button type="button" variant="outline" size="icon" aria-label="Previous step" disabled={cursor <= (graph.events[0]?.seq ?? 0)} onClick={() => move([...graph.events].reverse().find(item => item.seq < cursor)?.seq ?? cursor)}>‹</Button>
        <input type="range" aria-label="Replay position" className="h-11 min-w-48 flex-1 accent-[var(--primary)]" min={graph.events[0]?.seq ?? 0} max={last} value={cursor} onChange={change => move(Number(change.target.value))} />
        <Button type="button" variant="outline" size="icon" aria-label="Next step" disabled={cursor >= last} onClick={() => move(graph.events.find(item => item.seq > cursor)?.seq ?? cursor)}>›</Button>
        <span className="min-w-28 text-sm tabular-nums text-muted-foreground">Step {cursor} of {last}</span>
      </footer>
    </section>
  )
}
