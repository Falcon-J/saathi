import type { RunEvent } from "./run-trace.ts"

/** A recorded-style run used by the Inspector demo: a cached dependency read goes stale and CI fails later. */
export const demoRun: { id: string; title: string; agent: string; events: RunEvent[] } = {
  id: "run-4817",
  title: "Ship invoice CSV export",
  agent: "Coding agent via MCP",
  events: [
    { seq: 1, atMs: 0, kind: "start", label: "Plan the task", reads: [], writes: [{ key: "goal", value: "Ship invoice CSV export" }] },
    { seq: 2, atMs: 120, kind: "external", label: "SAA-139 marked done", actor: "Priya", reads: [], writes: [{ key: "task.SAA-139", value: "done" }] },
    { seq: 3, atMs: 286, kind: "tool", label: "get_task", reads: [{ key: "goal", version: 1 }], writes: [{ key: "task.SAA-142", value: { status: "ready", blockedBy: ["SAA-139"] } }] },
    { seq: 4, atMs: 410, kind: "external", label: "SAA-139 reopened", actor: "Priya", detail: "InvoiceSchema failed review", reads: [], writes: [{ key: "task.SAA-139", value: "in progress" }] },
    { seq: 5, atMs: 538, kind: "tool", label: "list_deps", detail: "Answered from a 41 second old cache", reads: [{ key: "task.SAA-142", version: 1 }, { key: "task.SAA-139", version: 1, source: "cache", ageMs: 41000 }], writes: [{ key: "blockers", value: [] }] },
    { seq: 6, atMs: 553, kind: "tool", label: "read_doc", reads: [{ key: "task.SAA-142", version: 1 }], writes: [{ key: "spec", value: "Export uses InvoiceSchema from SAA-139" }] },
    { seq: 7, atMs: 1709, kind: "decision", label: "Decide: start", detail: "No open blockers, so start now", reads: [{ key: "blockers", version: 1 }, { key: "spec", version: 1 }], writes: [{ key: "plan", value: "implement now" }] },
    { seq: 8, atMs: 1902, kind: "tool", label: "set status", reads: [{ key: "plan", version: 1 }], writes: [{ key: "task.SAA-142", value: { status: "in progress" } }] },
    { seq: 9, atMs: 18315, kind: "tool", label: "open_pr", reads: [{ key: "plan", version: 1 }, { key: "spec", version: 1 }], writes: [{ key: "pr", value: "#211" }] },
    { seq: 10, atMs: 40798, kind: "error", label: "CI failed", detail: "InvoiceSchema is not defined", reads: [{ key: "pr", version: 1 }], writes: [{ key: "ci", value: "failed" }] },
  ],
}
