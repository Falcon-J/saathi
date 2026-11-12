import { mcpProtectedResourceMetadata, resolveMcpConfig } from "../../../../features/mcp/config"

export const dynamic = "force-dynamic"
export function GET() {
  try {
    const config = resolveMcpConfig()
    return config.enabled
      ? Response.json(mcpProtectedResourceMetadata(config), { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "MCP is not enabled" }, { status: 404, headers: { "cache-control": "no-store" } })
  } catch {
    return Response.json({ error: "MCP configuration is unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
}
