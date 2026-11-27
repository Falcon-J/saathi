"use server"
import { revalidatePath } from "next/cache"
import { serverClient } from "@/lib/supabase"

export type Result = { ok: boolean; message?: string; code?: string; key?: string; agent_id?: string; name?: string; freed?: string[] }
export type AgentAction =
  | { kind: "connect" } | { kind: "rotate"; agent: string } | { kind: "revoke"; agent: string }
  | { kind: "pause"; agent: string; paused: boolean } | { kind: "limit"; agent: string; max: number } | { kind: "release"; task: string }

// Every button on the Agents page. Each is one SQL function, which checks membership and the agent's state.
export async function agentAction(ws: string, a: AgentAction): Promise<Result> {
  const supabase = await serverClient()
  const { data, error } =
    a.kind === "connect" ? await supabase.rpc("create_agent", { p_ws: ws })
    : a.kind === "rotate" ? await supabase.rpc("rotate_key", { p_ws: ws, p_agent: a.agent })
    : a.kind === "revoke" ? await supabase.rpc("revoke_key", { p_ws: ws, p_agent: a.agent })
    : a.kind === "pause" ? await supabase.rpc("pause_agent", { p_ws: ws, p_agent: a.agent, p_paused: a.paused })
    : a.kind === "limit" ? await supabase.rpc("set_agent_limit", { p_ws: ws, p_agent: a.agent, p_max: a.max })
    : await supabase.rpc("release_task", { p_ws: ws, p_task: a.task })
  revalidatePath("/agents")
  if (error || !data) return { ok: false, message: "Couldn't save that. Try again." }
  return data as Result
}
