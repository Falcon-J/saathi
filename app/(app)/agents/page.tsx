import { headers } from "next/headers"
import { getMe, serverClient } from "@/lib/supabase"
import { Agents, type Agent } from "./agents"

export const metadata = { title: "Agents" }

// Agents: the roster, with the open agent (?agent=<id>, or the first) in the pane.
export default async function Page({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const ws = (await getMe())?.workspaces[0]
  if (!ws) throw new Error("No workspace to show")
  const { data, error } = await (await serverClient()).rpc("agents_view", { p_ws: ws.id })
  if (error || !data) throw new Error("agents_view failed")
  // The address agents connect to is this site's own /mcp.
  const h = await headers()
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`
  return <Agents ws={ws.id} wsName={ws.name} agents={(data as { agents: Agent[] }).agents} picked={(await searchParams).agent ?? null}
                 mcpUrl={`${origin}/mcp`} at={new Date().toISOString()} />
}
