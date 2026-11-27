// POST /mcp over real HTTP: key auth, both protocol eras, every tool, and the task story at API level.
import { test, expect } from "@playwright/test"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { sql } from "./helpers"

const url = "http://localhost:3000/mcp"
const ws = crypto.randomUUID()
const user = crypto.randomUUID()
const asUser = `select set_config('request.jwt.claims', '{"sub":"${user}"}', false);`
const person = (q: string) => sql(asUser + q).split("\n").slice(1).join("\n")
let keyA = "", keyB = ""

type Out = Record<string, unknown> & { code?: string; hint?: string; fence?: string; task?: Record<string, unknown> | null }

async function connect(key: string, name = "test-agent") {
  const client = new Client({ name, version: "1.0.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${key}` } } }))
  return client
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args })
  return { error: r.isError === true, out: r.structuredContent as Out }
}
// A 2025-06-18 client, as most agents ship today: plain JSON-RPC posts with no session.
const legacy = (key: string, body: object) => fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
             "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${key}` },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
})
const rpcResult = async (r: Response) => {
  const text = await r.text()
  return JSON.parse(text.startsWith("{") ? text : text.split("\n").find(l => l.startsWith("data: "))!.slice(6))
}

test.describe.configure({ mode: "serial" })

test.beforeAll(() => {
  sql(`insert into auth.users (id, email, aud, role) values ('${user}', '${user}@mcp.test', 'authenticated', 'authenticated');
       insert into app.workspaces (id, name, created_by) values ('${ws}', 'mcp', '${user}');
       insert into app.members (workspace_id, user_id, role) values ('${ws}', '${user}', 'owner');`)
  ;[keyA, keyB] = person(`select public.create_agent('${ws}') ->> 'key' from generate_series(1, 2);`).split("\n")
  person(`select public.create_task('${ws}', 'Migrate the users table', 'The migration runs on a copy of prod.');
          select public.create_task('${ws}', 'Ship to customers', p_waits_on => array['SAA-1']);`)
})

test("a missing, malformed or unknown key gets a 401 with a hint, and no OAuth discovery", async () => {
  for (const auth of [undefined, "Bearer nope", `Bearer sk_live_${"x".repeat(32)}`]) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(auth && { authorization: auth }) },
                                 body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })
    expect(r.status).toBe(401)
    expect(r.headers.get("www-authenticate")).toBeNull()
    expect(await r.json()).toMatchObject({ code: "unauthorized", hint: expect.any(String) })
  }
  expect((await fetch(url)).status).toBe(405)
})

test("a current client sees six short tools and the instructions", async () => {
  const client = await connect(keyA)
  const { tools } = await client.listTools()
  expect(tools.map(t => t.name).sort()).toEqual(["ask", "get_task", "heartbeat", "next_task", "release", "submit"])
  expect(JSON.stringify(tools).length).toBeLessThan(3072)
  expect(tools.find(t => t.name === "get_task")?.annotations?.readOnlyHint).toBe(true)
  expect(client.getInstructions()).toContain("next_task")
  await client.close()
})

test("a 2025-06-18 client initializes, gets named after its client, and can call a tool", async () => {
  const init = await rpcResult(await legacy(keyB, { method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Acme Agent", version: "2" } } }))
  expect(init.result.instructions).toContain("next_task")
  expect(sql(`select name from app.agents a join app.agent_keys k on k.agent_id = a.id where k.hash = app.key_hash('${keyB}')`)).toBe("acme-agent")

  const r = await rpcResult(await legacy(keyB, { method: "tools/call", params: { name: "get_task", arguments: { task: "SAA-2" } } }))
  expect(r.result.structuredContent.task).toMatchObject({ ref: "SAA-2", status: "waiting", waits_on: ["SAA-1"] })
})

test("the story: claim, progress, ask, answer, submit, approve, unlock, lease ends, stale writes fenced", async () => {
  const a = await connect(keyA)
  const b = await connect(keyB)

  // Asking for a task that waits on another says what it waits on.
  const blocked = await call(a, "next_task", { task: "SAA-2" })
  expect(blocked).toMatchObject({ error: true, out: { code: "blocked", waits_on: ["SAA-1"] } })

  // Claim, and a retry with the same request_id returns the same claim.
  const claim = await call(a, "next_task", { request_id: "r1" })
  expect(claim.out).toMatchObject({ task: { ref: "SAA-1", done_when: "The migration runs on a copy of prod." }, fence: "1", heartbeat_every: 60 })
  expect((await call(a, "next_task", { request_id: "r1" })).out).toEqual(claim.out)
  const held = { task: "SAA-1", fence: "1" }

  expect((await call(a, "heartbeat", { ...held, steps: ["Copy prod", "Run migration"], done: 1, now: "Running migration" })).out)
    .toMatchObject({ stop: false, lease_until: expect.any(String) })
  expect((await call(a, "ask", { ...held, question: "Keep the old column?", options: ["Yes", "No"] })).out).toEqual({ status: "question" })
  person(`select public.answer_question('${ws}', 'SAA-1', 'Yes, keep it');`)
  expect((await call(a, "heartbeat", held)).out.answer).toMatchObject({ question: "Keep the old column?", text: "Yes, keep it" })

  // Submit twice: the retry returns the first result.
  const proof = { ...held, summary: "Migrated on a copy.", checks: [{ name: "migration", result: "pass" }], changes: { files: 2, added: 40, removed: 3 } }
  expect((await call(a, "submit", proof)).out).toEqual({ status: "review" })
  expect((await call(a, "submit", proof)).out).toEqual({ status: "review" })

  person(`select public.approve_task('${ws}', 'SAA-1');`)
  const second = await call(b, "next_task")
  expect(second.out).toMatchObject({ task: { ref: "SAA-2", waits_on: [] }, fence: "1" })

  // b goes quiet, its lease ends, and a takes over with fence 2. b's late write is refused.
  sql(`update app.tasks set lease_until = now() - interval '1 second' where workspace_id = '${ws}' and number = 2`)
  expect((await call(a, "next_task", { task: "SAA-2" })).out).toMatchObject({ fence: "2" })
  const stale = await call(b, "submit", { task: "SAA-2", fence: 1, summary: "late", checks: [{ name: "t", result: "pass" }] })
  expect(stale).toMatchObject({ error: true, out: { code: "fenced", hint: expect.stringContaining("next_task") } })

  expect((await call(a, "release", { task: "SAA-2", fence: "2", note: "Stopped after step 1; run step 2 next." })).out).toEqual({ status: "ready" })
  expect((await call(a, "get_task", { task: "SAA-2" })).out.task).toMatchObject({ status: "ready", holder: null })
  await Promise.all([a.close(), b.close()])
})

test("bad input comes back as a readable tool error", async () => {
  const a = await connect(keyA)
  const r = await a.callTool({ name: "next_task", arguments: { wait: 99 } }).catch((e: Error) => ({ isError: true, content: [{ type: "text", text: e.message }] }))
  expect(r.isError).toBe(true)
  expect(JSON.stringify(r.content)).toContain("wait")
  await a.close()
})

test("odd input gets a clear answer, never a crash", async () => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18", authorization: `bearer ${keyB}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
                           params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: 42, version: "1" } } }) })
  expect(r.status).toBe(200)
  const b = await connect(keyB)
  const claim = await call(b, "next_task", { lease: 1e12 })
  expect(claim.out).toMatchObject({ task: { ref: "SAA-2" } })
  expect((await call(b, "heartbeat", { task: "SAA-2", fence: claim.out.fence, done: -5, lease: 1e12 })).error).toBe(false)
  expect((await call(b, "heartbeat", { task: "SAA-2", fence: "abc" })).out.code).toBe("fenced")
  await b.close()
})

test("too many calls in a minute get a 429 with retry_after", async () => {
  sql(`update app.agents a set rate_window = now(), rate_count = 120 from app.agent_keys k
       where k.agent_id = a.id and k.hash = app.key_hash('${keyA}')`)
  const r = await legacy(keyA, { method: "tools/list" })
  expect(r.status).toBe(429)
  expect(await r.json()).toMatchObject({ code: "rate_limited", retry_after: expect.any(Number) })
  expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0)
})
