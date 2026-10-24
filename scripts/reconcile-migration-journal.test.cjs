const { test } = require("node:test")
const assert = require("node:assert/strict")

test("catalog verification rejects drift in every migration postcondition category", async () => {
  const { compareCatalogs } = await import("./reconcile-migration-journal.mjs")
  const categories = ["columns", "constraints", "indexes", "rls", "policies", "privileges", "columnPrivileges", "triggers", "function", "functionPrivileges", "publicExecute"]
  const baseline = Object.fromEntries(categories.map(key => [key, [{ definition: "expected" }]]))
  assert.deepEqual(compareCatalogs(baseline, structuredClone(baseline)), [])
  for (const category of categories) {
    const drifted = structuredClone(baseline)
    drifted[category] = [{ definition: "unexpected" }]
    assert.deepEqual(compareCatalogs(baseline, drifted), [category])
    delete drifted[category]
    assert.deepEqual(compareCatalogs(baseline, drifted), [category])
  }
})

test("reconciliation rejects absent URLs and remote reference databases before connecting", async () => {
  const { reconcile } = await import("./reconcile-migration-journal.mjs")
  await assert.rejects(reconcile({}), /URLs are required/)
  await assert.rejects(reconcile({ targetUrl: "postgres://localhost/test", referenceAdminUrl: "postgres://example.com/test" }), /Reference database must be local/)
})

test("local integration: catalog drift cannot baseline the journal; exact schema can", { skip: !process.env.DATABASE_REFERENCE_ADMIN_URL }, async () => {
  const postgres = (await import("postgres")).default
  const { readFile } = require("node:fs/promises")
  const { randomUUID } = require("node:crypto")
  const { reconcile } = await import("./reconcile-migration-journal.mjs")
  const adminUrl = process.env.DATABASE_REFERENCE_ADMIN_URL
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(adminUrl).hostname))
  const admin = postgres(adminUrl, { max: 1 })
  const database = `saathi_reconciliation_test_${randomUUID().replaceAll("-", "")}`
  let target
  try {
    await admin.unsafe(`CREATE DATABASE ${database}`)
    const targetUrl = new URL(adminUrl); targetUrl.pathname = `/${database}`
    target = postgres(targetUrl.toString(), { max: 1 })
    await target.unsafe("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb); CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY,hash text NOT NULL,created_at bigint); DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", require("node:url").pathToFileURL(__filename)), "utf8"))
    for (const entry of journal.entries) await target.unsafe(await readFile(new URL(`../drizzle/${entry.tag}.sql`, require("node:url").pathToFileURL(__filename)), "utf8"))
    const run = () => reconcile({ targetUrl: targetUrl.toString(), referenceAdminUrl: adminUrl, apply: true })
    await target.unsafe("ALTER TABLE public.command_receipts DISABLE ROW LEVEL SECURITY")
    await assert.rejects(run(), /postcondition mismatch: rls/)
    assert.equal((await target.unsafe("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))[0].count, 0)
    await target.unsafe("ALTER TABLE public.command_receipts ENABLE ROW LEVEL SECURITY; GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC")
    await assert.rejects(run(), /postcondition mismatch: functionPrivileges, publicExecute/)
    assert.equal((await target.unsafe("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))[0].count, 0)
    await target.unsafe("REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC")
    await run()
    assert.equal((await target.unsafe("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"))[0].count, journal.entries.length)
    await assert.rejects(run(), /Journal must be empty/)
  } finally {
    await Promise.all([admin.end(), target?.end()])
  }
})
