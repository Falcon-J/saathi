import assert from "node:assert/strict"
import { test } from "node:test"
import { createMcpHttpHandler } from "./server.ts"
import { McpAuthenticationError } from "./auth.ts"

const config = { enabled: true as const, resource: "https://saathi.example/mcp", issuer: "https://identity.example/auth/v1", jwksUrl: "https://identity.example/auth/v1/.well-known/jwks.json", clientIds: ["test-client"] }
const principal = { userId: "11111111-1111-4111-8111-111111111111", clientId: "test-client", grantId: "22222222-2222-4222-8222-222222222222", capabilities: ["capabilities:read"], workspaceIds: [] }
function request(method = "tools/list", params: unknown = {}) { return new Request(config.resource, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }) }
async function protocolResult(response: Response) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return response.json()
  const messages = (await response.text()).split(/\r?\n/).filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)))
  return messages.find(message => message.id === 1)
}
const executor = { listTools: () => [{ name: "capabilities.list", kind: "read" as const, destructive: false, securitySensitive: false }], call: async () => ({ state: "ok" as const, data: { capabilities: [] } }) }

test("disabled MCP does not expose tools or invoke authentication", async () => {
  let calls = 0
  const handler = createMcpHttpHandler({ config: { enabled: false }, authenticate: async () => { calls++; return principal }, executor: () => executor })
  assert.equal((await handler(request())).status, 404)
  assert.equal(calls, 0)
})

test("unauthenticated discovery returns a protected-resource challenge and no tools", async () => {
  const handler = createMcpHttpHandler({ config, authenticate: async () => { throw new McpAuthenticationError() }, executor: () => executor })
  const response = await handler(request())
  assert.equal(response.status, 401)
  assert.match(response.headers.get("www-authenticate")!, /oauth-protected-resource\/mcp/)
  assert.equal((await response.text()).includes("capabilities.list"), false)
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("cross-origin requests are rejected before authentication", async () => {
  let calls = 0
  const handler = createMcpHttpHandler({ config, authenticate: async () => { calls++; return principal }, executor: () => executor })
  const hostile = request(); hostile.headers.set("origin", "https://untrusted.example")
  assert.equal((await handler(hostile)).status, 403)
  assert.equal(calls, 0)
})
test("a conflicting Host header cannot impersonate the configured MCP resource", async () => {
  let calls = 0
  const handler = createMcpHttpHandler({ config, authenticate: async () => { calls++; return principal }, executor: () => executor })
  const hostile = request(); hostile.headers.set("host", "untrusted.example")
  assert.equal((await handler(hostile)).status, 403)
  assert.equal(calls, 0)
})

test("real MCP SDK discovery publishes only the current executable tools", async () => {
  const handler = createMcpHttpHandler({ config, authenticate: async () => principal, executor: () => executor })
  const response = await handler(request())
  assert.equal(response.status, 200)
  const result = await protocolResult(response)
  assert.deepEqual(result.result.tools.map((tool: { name: string }) => tool.name), ["capabilities.list"])
  assert.equal(result.result.tools[0].annotations.readOnlyHint, true)
})

test("real MCP SDK calls return structured domain results without invoking a model", async () => {
  const handler = createMcpHttpHandler({ config, authenticate: async () => principal, executor: () => executor })
  const response = await handler(request("tools/call", { name: "capabilities.list", arguments: {} }))
  assert.equal(response.status, 200)
  const result = await protocolResult(response)
  assert.deepEqual(result.result.structuredContent, { state: "ok", data: { capabilities: [] } })
})
