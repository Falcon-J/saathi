// POST /mcp: Streamable HTTP for any MCP client, authenticated by `Authorization: Bearer sk_live_…`.
// Keys only, with no OAuth discovery, so clients that prefer OAuth still send the header.
import { handler, rpc } from "@/mcp/server"

const bearer = /^Bearer (sk_live_[A-Za-z0-9]{32})$/
type Message = { method?: string; params?: { clientInfo?: { name?: string }; _meta?: Record<string, { name?: string }> } }

const deny = (status: number, body: Record<string, unknown>) => Response.json(body, {
  status, headers: typeof body.retry_after === "number" ? { "retry-after": String(body.retry_after) } : {},
})

// The client's own name names the agent: from initialize (2025 clients), the request _meta (2026 clients), or the User-Agent.
function clientName(messages: Message[], req: Request) {
  for (const m of messages) {
    const name = m?.params?.clientInfo?.name ?? m?.params?._meta?.["io.modelcontextprotocol/clientInfo"]?.name
    if (name) return name.slice(0, 80)
  }
  return req.headers.get("user-agent")?.split(/[\s/]/)[0]?.slice(0, 80) || undefined
}

export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.match(bearer)?.[1]
  if (!key) {
    return deny(401, { code: "unauthorized", message: "The key is missing or malformed.",
                       hint: "Send Authorization: Bearer sk_live_… with a key from Agents › Connect." })
  }
  const body: unknown = await req.json().catch(() => undefined)
  if (body === undefined) return deny(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
  const messages = (Array.isArray(body) ? body : [body]) as Message[]
  const client = clientName(messages, req)

  // A tool call checks the key inside its own SQL function. Anything else checks it here, in one call.
  if (!messages.some(m => m?.method === "tools/call")) {
    const r = await rpc("agent_hello", { p_key: key, p_client: client })
    if (!r.ok) return deny(r.code === "rate_limited" ? 429 : r.code === "unavailable" ? 503 : 401, { ...r, ok: undefined })
  }
  return handler.fetch(req, { authInfo: { token: key, clientId: client ?? "", scopes: [] }, parsedBody: body })
}

const notAllowed = () => new Response(null, { status: 405, headers: { allow: "POST" } })
export { notAllowed as GET, notAllowed as DELETE }
