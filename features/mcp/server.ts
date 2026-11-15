import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import type { CallToolResult, JSONObject } from "@modelcontextprotocol/server"
import { platformContracts } from "../platform/contracts.ts"
import type { PlatformToolName } from "../platform/contracts.ts"
import { McpAuthenticationError } from "./auth.ts"
import type { McpPrincipal } from "./auth.ts"
import type { McpConfig } from "./config.ts"

interface ExecutableTool { name: string; kind: "read" | "mutate"; destructive: boolean; securitySensitive: boolean }
interface McpExecutor {
  listTools(principal: McpPrincipal): readonly ExecutableTool[]
  call(principal: McpPrincipal, name: string, input: unknown): Promise<unknown>
}
export interface McpHttpDependencies {
  config: McpConfig
  authenticate: (request: Request) => Promise<McpPrincipal>
  executor: (principal: McpPrincipal) => McpExecutor
  allowedOrigins?: readonly string[]
}
function json(status: number, message: string, headers?: Record<string, string>) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store", ...headers } })
}

/** One authenticated SDK server per request; no browser cookies or model calls. */
export function createMcpHttpHandler(dependencies: McpHttpDependencies) {
  return async function handle(request: Request): Promise<Response> {
    const config = dependencies.config
    if (!config.enabled) return json(404, "MCP is not enabled")
    const resource = new URL(config.resource)
    const url = new URL(request.url)
    if (url.origin !== resource.origin || url.pathname !== resource.pathname) return json(403, "MCP resource mismatch")
    const host = request.headers.get("host")
    if (host && host.toLowerCase() !== resource.host.toLowerCase()) return json(403, "MCP resource mismatch")
    const origin = request.headers.get("origin")
    if (origin && ![resource.origin, ...(dependencies.allowedOrigins ?? [])].includes(origin)) return json(403, "Origin is not allowed")
    if (!["POST", "GET", "DELETE"].includes(request.method)) return json(405, "Method not allowed", { allow: "POST, GET, DELETE" })
    try {
      const principal = await dependencies.authenticate(request)
      const executor = dependencies.executor(principal)
      const handler = createMcpHandler(() => {
        const server = new McpServer({ name: "saathi", version: "1.0.0" })
        for (const capability of executor.listTools(principal)) {
          const name = capability.name as PlatformToolName
          const contract = platformContracts[name]
          if (!contract) continue
          server.registerTool(name, {
            description: capability.kind === "read" ? "Read authorized Saathi records in the requested scope." : "Apply a versioned, retryable Saathi command within current access.",
            inputSchema: contract.input,
            outputSchema: contract.output,
            annotations: { readOnlyHint: capability.kind === "read", destructiveHint: capability.destructive, idempotentHint: true, openWorldHint: false },
          }, async (input: unknown): Promise<CallToolResult> => {
            const result = await executor.call(principal, name, input)
            const state = result && typeof result === "object" && "state" in result ? result.state : undefined
            return { resultType: "complete", content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result as JSONObject, ...(state !== "ok" && state !== "committed" ? { isError: true } : {}) }
          })
        }
        return server
      }, { legacy: "stateless", maxRequestBodySize: 2 * 1024 * 1024, onerror: () => { console.warn("[Saathi] MCP request rejected") } })
      const response = await handler.fetch(request)
      response.headers.set("cache-control", "no-store")
      return response
    } catch (error) {
      if (error instanceof McpAuthenticationError) {
        const metadata = new URL("/.well-known/oauth-protected-resource" + resource.pathname, resource.origin).href
        return json(error.status, error.message, error.status === 401 ? { "www-authenticate": `Bearer resource_metadata="${metadata}"` } : error.status === 429 ? { "retry-after": String(error.retryAfterSeconds ?? 60) } : undefined)
      }
      return json(503, "MCP is temporarily unavailable")
    }
  }
}
