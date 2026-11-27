// The MCP server behind POST /mcp: stateless, so any serverless instance can answer any request.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { registerTools, type Result } from "./tools"

const instructions = "You work on tasks in a Saathi workspace. Tasks are named like SAA-14. Call next_task to claim ready work. Read done_when and scope, " +
  "and stay inside the scope. Call heartbeat about every minute and after each step; it returns answers and stop requests. " +
  "If you are unsure, call ask and keep calling heartbeat until the answer arrives. When done_when is met, call submit with " +
  "real checks (tests run, results) and the change link. If you can't finish, call release with where you stopped and " +
  "what's next. A fenced error means the task is no longer yours: stop work on it."

// The agent functions are granted to service_role only, and each one checks the agent's key itself.
let db: SupabaseClient | undefined
export async function rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
  db ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!,
                      { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc(fn, args)
  if (error || !data) {
    console.error(`mcp: ${fn} failed`, error?.code, error?.message)
    return { ok: false, code: "unavailable", message: "Saathi can't reach its database right now.", hint: "Try again in a few seconds." }
  }
  return data as Result
}

export const handler = createMcpHandler(({ authInfo }) => {
  const server = new McpServer({ name: "saathi", version: "0.1.0" }, { instructions })
  registerTools(server, (fn, args) => rpc(fn, { p_key: authInfo!.token, ...args }), authInfo!.clientId || undefined)
  return server
}, { legacy: "stateless" })
