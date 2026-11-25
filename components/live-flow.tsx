"use client"

import { useEffect, useRef } from "react"

/*
 * A looping, declarative picture of Saathi's coordination model: tasks unlock
 * when their prerequisites finish, agents claim work under a lease, a crashed
 * agent's lease expires and the task returns to Ready, and a person reviews.
 * Pure SVG + SMIL so it costs no JS per frame; reduced motion shows one still.
 */

const LOOP = 14
type State = "waiting" | "ready" | "progress" | "review" | "done"
type Node = { id: string; title: string; x: number; y: number; timeline: [number, State, string?][] }

const W = 224, H = 68
const NODES: Node[] = [
  { id: "a", title: "Draft the claim API", x: 20, y: 40, timeline: [[0, "ready", "up next"], [0.06, "progress", "agent-a"], [0.24, "done", "token 41"]] },
  { id: "b", title: "Write the tests", x: 20, y: 236, timeline: [[0, "ready", "up next"], [0.12, "progress", "agent-b"], [0.3, "done", "token 17"]] },
  { id: "c", title: "Build the export", x: 298, y: 138, timeline: [[0, "waiting", "on 2 tasks"], [0.3, "ready", "unblocked"], [0.36, "progress", "agent-a"], [0.58, "review", "needs you"], [0.7, "done", "approved"]] },
  { id: "d", title: "Ship to customers", x: 576, y: 138, timeline: [[0, "waiting", "on 1 task"], [0.7, "ready", "up next"]] },
  { id: "e", title: "Migrate the schema", x: 298, y: 352, timeline: [[0, "ready", "up next"], [0.4, "progress", "agent-c"], [0.5, "progress", "no heartbeat"], [0.6, "ready", "lease expired"], [0.74, "progress", "agent-b"]] },
]

const COLOR: Record<State, string> = {
  waiting: "var(--saathi-warning)",
  ready: "var(--primary)",
  progress: "var(--foreground)",
  review: "var(--saathi-review)",
  done: "var(--saathi-success)",
}
const LABEL: Record<State, string> = { waiting: "Waiting", ready: "Ready", progress: "In progress", review: "Review", done: "Done" }

const LOG: [number, string][] = [
  [0.06, "agent-a  claim     draft-api     #41"],
  [0.12, "agent-b  claim     write-tests   #17"],
  [0.24, "agent-a  done      draft-api"],
  [0.3, "agent-b  done      write-tests"],
  [0.31, "build-export  ready, 0 blockers"],
  [0.36, "agent-a  claim     build-export  #42"],
  [0.4, "agent-c  claim     migrate       #8"],
  [0.5, "agent-c  heartbeat missed"],
  [0.58, "agent-a  submit    build-export"],
  [0.6, "lease expired · migrate → ready"],
  [0.7, "you      approve   build-export"],
  [0.74, "agent-b  claim     migrate  #9, #8 fenced"],
]

/** keyTimes/values for a step function that is `on` within [start, end). */
function stepWindow(start: number, end: number) {
  const times = [0], values = [start === 0 ? 1 : 0]
  if (start > 0) { times.push(start); values.push(1) }
  if (end < 1) { times.push(end); values.push(0) }
  return { keyTimes: times.join(";"), values: values.join(";") }
}

function Blink({ start, end, attr = "opacity" }: { start: number; end: number; attr?: string }) {
  const { keyTimes, values } = stepWindow(start, end)
  return <animate attributeName={attr} dur={`${LOOP}s`} repeatCount="indefinite" calcMode="discrete" keyTimes={keyTimes} values={values} />
}

function anchor(id: string) {
  const node = NODES.find(item => item.id === id)!
  return `${node.x + W - 14},${node.y + 14}`
}

const REST = { a: "700,20", b: "730,20", c: "760,20" }
const AGENTS: { id: string; colour: string; path: [number, string][]; fade?: [number, number] }[] = [
  { id: "agent-a", colour: "var(--primary)", path: [[0, REST.a], [0.04, REST.a], [0.06, anchor("a")], [0.24, anchor("a")], [0.34, anchor("c")], [0.58, anchor("c")], [0.64, REST.a], [1, REST.a]] },
  { id: "agent-b", colour: "var(--saathi-review)", path: [[0, REST.b], [0.1, REST.b], [0.12, anchor("b")], [0.3, anchor("b")], [0.36, REST.b], [0.72, REST.b], [0.74, anchor("e")], [0.96, anchor("e")], [1, REST.b]] },
  { id: "agent-c", colour: "var(--saathi-warning)", path: [[0, REST.c], [0.38, REST.c], [0.4, anchor("e")], [0.5, anchor("e")], [1, anchor("e")]], fade: [0.5, 0.54] },
]

export function LiveFlow({ className = "" }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const element = svg.current
    if (!element || typeof window === "undefined" || !globalThis.matchMedia) return
    const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => {
      if (query.matches) { element.pauseAnimations?.(); element.setCurrentTime?.(LOOP * 0.62) }
      else element.unpauseAnimations?.()
    }
    apply()
    query.addEventListener?.("change", apply)
    return () => query.removeEventListener?.("change", apply)
  }, [])

  const edges: [string, string][] = [["a", "c"], ["b", "c"], ["c", "d"]]
  const nodeById = Object.fromEntries(NODES.map(node => [node.id, node]))

  return <svg ref={svg} viewBox="0 0 820 600" className={className} role="img" aria-labelledby="live-flow-title live-flow-desc" preserveAspectRatio="xMidYMid meet">
    <title id="live-flow-title">Work moving through Saathi</title>
    <desc id="live-flow-desc">Tasks unlock when their prerequisites finish. Agents claim ready tasks under a lease. When an agent stops responding its lease expires and the task returns to Ready. A person approves work that needs review.</desc>
    <defs>
      <pattern id="live-flow-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--border)" /></pattern>
    </defs>
    <rect width="820" height="600" fill="url(#live-flow-dots)" />

    {edges.map(([from, to]) => {
      const a = nodeById[from], b = nodeById[to]
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2
      const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
      const unlock = to === "c" ? 0.3 : 0.7
      return <g key={from + to}>
        <path d={d} fill="none" stroke="var(--border)" strokeWidth="2" />
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray="6 6" opacity="0">
          <Blink start={from === "a" ? 0.24 : from === "b" ? 0.3 : 0.7} end={1} />
          <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite" />
        </path>
        <circle r="4" fill="var(--primary)" opacity="0">
          <Blink start={unlock - 0.04} end={unlock} />
          <animateMotion dur={`${LOOP}s`} repeatCount="indefinite" path={d} keyPoints="0;0;1;1" keyTimes={`0;${unlock - 0.04};${unlock};1`} calcMode="linear" />
        </circle>
      </g>
    })}

    {NODES.map(node => <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
      <rect width={W} height={H} rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      {node.timeline.map(([start, state], index) => {
        const end = node.timeline[index + 1]?.[0] ?? 1
        if (state !== "ready" && state !== "review") return null
        return <rect key={index} width={W} height={H} rx="12" fill="none" stroke={COLOR[state]} strokeWidth="2" opacity={start === 0 ? 1 : 0}><Blink start={start} end={end} /></rect>
      })}
      <text x="14" y="27" fill="var(--foreground)" fontSize="15" fontWeight="600" fontFamily="var(--font-sans), system-ui, sans-serif">{node.title}</text>
      {node.timeline.map(([start, state, detail], index) => {
        const end = node.timeline[index + 1]?.[0] ?? 1
        return <g key={index} opacity={start === 0 ? 1 : 0}>
          <Blink start={start} end={end} />
          <circle cx="19" cy="48" r="4" fill={COLOR[state]} />
          <text x="30" y="52" fill={COLOR[state]} fontSize="11.5" fontFamily="var(--font-mono), ui-monospace, monospace">{LABEL[state]}</text>
          <text x={30 + LABEL[state].length * 7.2 + 8} y="52" fill="var(--muted-foreground)" fontSize="11.5" fontFamily="var(--font-mono), ui-monospace, monospace">{detail ? "· " + detail : ""}</text>
        </g>
      })}
    </g>)}

    {AGENTS.map(agent => <g key={agent.id}>
      <animateMotion dur={`${LOOP}s`} repeatCount="indefinite" calcMode="linear" keyTimes={agent.path.map(([t]) => t).join(";")} values={agent.path.map(([, p]) => p).join(";")} />
      <g opacity="1">
        {agent.fade && <animate attributeName="opacity" dur={`${LOOP}s`} repeatCount="indefinite" keyTimes={`0;${agent.fade[0]};${agent.fade[1]};0.98;1`} values="1;1;0;0;1" />}
        <circle r="9" fill="var(--background)" stroke={agent.colour} strokeWidth="2" />
        <circle r="3.5" fill={agent.colour} />
      </g>
    </g>)}
    <text x="690" y="48" fill="var(--muted-foreground)" fontSize="11" fontFamily="var(--font-mono), ui-monospace, monospace">3 agents over MCP</text>

    <g transform="translate(20 470)" fontFamily="var(--font-mono), ui-monospace, monospace" fontSize="11.5">
      <rect x="0" y="-6" width="780" height="128" rx="10" fill="var(--card)" stroke="var(--border)" />
      <text x="14" y="14" fill="var(--muted-foreground)" fontSize="10.5" letterSpacing="0.6">EVENT LOG</text>
      {LOG.map(([start, line], index) => {
        const column = index < 6 ? 0 : 1
        const row = column ? index - 6 : index
        return <text key={index} x={14 + column * 390} y={34 + row * 15} fill={line.includes("expired") || line.includes("missed") ? "var(--saathi-warning)" : line.startsWith("you") ? "var(--saathi-success)" : "var(--foreground)"} opacity="0" xmlSpace="preserve">
          <Blink start={start} end={0.985} />{line}
        </text>
      })}
    </g>
  </svg>
}
