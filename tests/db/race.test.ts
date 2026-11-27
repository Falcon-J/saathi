// 20 agents race for the same work through the real HTTP path (PostgREST → SQL functions).
// Needs a local Supabase: `supabase start`, then `npm run test:db`.
import { test, before } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

// Connection details come from the env (CI) or from the running local stack.
const local = process.env.SUPABASE_SECRET_KEY ? {} as Record<string, string>
  : JSON.parse(execFileSync("npx", ["-y", "supabase", "status", "-o", "json"], { encoding: "utf8" }))
const url = process.env.SUPABASE_URL ?? local.API_URL
const secret = process.env.SUPABASE_SECRET_KEY ?? local.SECRET_KEY
const dbUrl = process.env.SUPABASE_DB_URL ?? local.DB_URL
const db = createClient(url, secret, { auth: { persistSession: false } })
const sql = (q: string) => execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", q], { encoding: "utf8" }).trim()

const ws = crypto.randomUUID()
const user = crypto.randomUUID()
let keys: string[] = []

type Result = { ok: boolean; code?: string; task?: { ref: string } | null; fence?: string }
const next = async (key: string) => (await db.rpc("agent_next_task", { p_key: key })).data as Result

before(() => {
  sql(`insert into auth.users (id, email, aud, role) values ('${user}', '${user}@race.test', 'authenticated', 'authenticated');
       insert into app.workspaces (id, name, created_by) values ('${ws}', 'race', '${user}');
       insert into app.members (workspace_id, user_id, role) values ('${ws}', '${user}', 'owner');`)
  keys = sql(`select set_config('request.jwt.claims', '{"sub":"${user}"}', false);
              select public.create_agent('${ws}') ->> 'key' from generate_series(1, 20);`).split("\n").slice(1)
  sql(`select set_config('request.jwt.claims', '{"sub":"${user}"}', false);
       select public.create_task('${ws}', 'Task ' || g) from generate_series(1, 5) g;`)
  assert.equal(keys.length, 20)
})

test("20 agents, 5 tasks: every task has exactly one holder", async () => {
  const results = await Promise.all(keys.map(next))
  const claimed = results.filter(r => r.task)
  assert.equal(claimed.length, 5)
  assert.equal(new Set(claimed.map(r => r.task!.ref)).size, 5)
  assert.ok(results.every(r => r.ok))
})

test("after every lease ends, a second race fences every first holder", async () => {
  const first = new Map<string, { ref: string; fence: string }>()
  for (const key of keys) {
    const held = sql(`select t.number || ':' || t.fence from app.tasks t join app.agent_keys k on k.agent_id = t.holder_agent_id
                      where k.hash = app.key_hash('${key}') and t.status = 'working'`)
    if (held) first.set(key, { ref: "SAA-" + held.split(":")[0], fence: held.split(":")[1] })
  }
  assert.equal(first.size, 5)
  sql(`update app.tasks set lease_until = now() - interval '1 second' where workspace_id = '${ws}'`)

  const others = keys.filter(k => !first.has(k))
  const second = (await Promise.all(others.map(next))).filter(r => r.task)
  assert.equal(second.length, 5)
  assert.ok(second.every(r => r.fence === "2"))

  const stale = await Promise.all([...first].map(([key, held]) =>
    db.rpc("agent_submit", { p_key: key, p_task: held.ref, p_fence: Number(held.fence), p_summary: "late",
                            p_checks: [{ name: "tests", result: "pass" }] })))
  assert.ok(stale.every(r => (r.data as Result).code === "fenced"), "no stale write lands")
  assert.equal(sql(`select count(*) from app.submissions s join app.tasks t on t.id = s.task_id where t.workspace_id = '${ws}'`), "0")
})
