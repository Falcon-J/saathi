// The six tools. Each one is a single SQL function call; the function checks the key, the fence and the input.
// Schemas stay lean because tools/list goes into every agent's context (budget: 3 KB). The SQL enforces the limits;
// zod keeps only the ones the SQL doesn't check.
import { z } from "zod"
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server"

export type Result = { ok: boolean; [field: string]: unknown }
type Call = (fn: string, args: Record<string, unknown>) => Promise<Result>

const task = z.string()
// next_task returns the fence as a string; a number is accepted too. Anything else can't match, so it comes back fenced.
const fence = z.coerce.string()
const lease = z.number().optional().describe("Seconds, 60-3600, default 900")
const held = { task, fence }
const asFence = (f: string) => /^\d{1,15}$/.test(f) ? Number(f) : -1
// Whole numbers in range without zod's .int().min().max(), which add bytes to every schema. The SQL clamps further.
const int = (n: number | undefined, max: number) => n === undefined ? undefined : Math.min(Math.max(Math.round(n), 0), max)

// Success: the fields without `ok`. Failure: isError with {code, message, hint}, so the agent knows what to do next.
function toResult({ ok, ...out }: Result): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, ...(!ok && { isError: true }) }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function registerTools(server: McpServer, call: Call, client?: string) {
  server.registerTool("next_task", {
    description: "Claim the next ready task, or a named one.",
    inputSchema: z.object({
      task: task.optional(),
      wait: z.number().int().min(0).max(20).optional().describe("Seconds to wait for work"),
      lease,
      request_id: z.string().max(100).optional().describe("Retry with it to get the same claim"),
    }),
  }, async ({ task, wait = 0, lease, request_id }, ctx) => {
    const args = { p_task: task, p_lease: int(lease, 3600), p_request_id: request_id, p_client: client }
    const until = Date.now() + wait * 1000
    let r = await call("agent_next_task", args)
    // Stop once the caller has gone, so nobody claims a task whose answer can't be delivered.
    while (r.ok && r.task === null && Date.now() + 2000 <= until) {
      await sleep(2000)
      if (ctx.mcpReq.signal.aborted) break
      r = await call("agent_next_task", args)
    }
    return toResult(r)
  })

  server.registerTool("heartbeat", {
    description: "Keep your lease and report progress. Returns answers to your questions.",
    inputSchema: z.object({
      ...held,
      steps: z.array(z.string().max(120)).optional().describe("Your plan, up to 20 short lines"),
      done: z.number().optional().describe("Steps finished"),
      now: z.string().optional().describe("What you are doing now"),
      lease,
    }),
    annotations: { idempotentHint: true },
  }, async ({ task, fence, steps, done, now, lease }) => toResult(await call("agent_heartbeat", {
    p_task: task, p_fence: asFence(fence), p_steps: steps, p_done: int(done, 20), p_now: now, p_lease: int(lease, 3600) })))

  server.registerTool("ask", {
    description: "Ask a person a question about your task. The answer arrives in heartbeat.",
    inputSchema: z.object({ ...held, question: z.string(), options: z.array(z.string().max(80)).optional().describe("Up to 4 choices") }),
  }, async ({ task, fence, question, options }) => toResult(await call("agent_ask", {
    p_task: task, p_fence: asFence(fence), p_question: question, p_options: options ?? [] })))

  server.registerTool("submit", {
    description: "Hand back proof that done_when is met. A person reviews it.",
    inputSchema: z.object({
      ...held,
      summary: z.string(),
      checks: z.array(z.object({ name: z.string(), result: z.enum(["pass", "fail", "skip"]), detail: z.string().optional() }))
        .describe("1-20 checks you really ran, e.g. tests"),
      changes: z.object({ files: z.number(), added: z.number(), removed: z.number(), url: z.string().max(500).optional() }).optional(),
      scope_ok: z.boolean().optional().describe("You stayed inside the scope"),
    }),
    annotations: { idempotentHint: true },
  }, async ({ task, fence, summary, checks, changes, scope_ok }) => toResult(await call("agent_submit", {
    p_task: task, p_fence: asFence(fence), p_summary: summary, p_checks: checks, p_changes: changes, p_scope_ok: scope_ok })))

  server.registerTool("release", {
    description: "Give a task back: say where you stopped and what's next.",
    inputSchema: z.object({ ...held, note: z.string() }),
    annotations: { idempotentHint: true },
  }, async ({ task, fence, note }) => toResult(await call("agent_release", { p_task: task, p_fence: asFence(fence), p_note: note })))

  server.registerTool("get_task", {
    description: "Read a task, its links and its history.",
    inputSchema: z.object({ task }),
    annotations: { readOnlyHint: true },
  }, async ({ task }) => toResult(await call("agent_get_task", { p_task: task })))
}
