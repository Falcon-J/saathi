import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import postgres from "postgres"

export function compareCatalogs(expected, actual) {
  return Object.keys(expected).filter(key => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]))
}

const queries = {
  columns: `SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
  constraints: `SELECT c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,k.conname`,
  indexes: `SELECT c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,definition`,
  rls: `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname`,
  policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename,policyname`,
  privileges: `SELECT c.relname,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) WHERE n.nspname='public' AND c.relname=ANY($1) ORDER BY c.relname,r.role,p.privilege`,
  columnPrivileges: `SELECT c.relname,a.attname,r.role,p.privilege,has_column_privilege(r.role,c.oid,a.attnum,p.privilege) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege) WHERE n.nspname='public' AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname,r.role,p.privilege`,
  triggers: `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND ((n.nspname='public' AND c.relname=ANY($1)) OR (n.nspname='auth' AND c.relname='users' AND t.tgname='on_auth_user_created')) ORDER BY n.nspname,c.relname,t.tgname`,
}
async function catalog(sql, tables) {
  const result = {}
  for (const [key, query] of Object.entries(queries)) result[key] = Array.from(await sql.unsafe(query, [tables]))
  result.function = Array.from(await sql`SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS definition`)
  result.functionPrivileges = Array.from(await sql`SELECT role,has_function_privilege(role,'public.handle_new_user()','EXECUTE') AS allowed FROM (VALUES ('anon'),('authenticated')) r(role) ORDER BY role`)
  const publicExecute = await sql`SELECT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.handle_new_user()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS allowed`
  result.publicExecute = Array.from(publicExecute)
  return result
}

export async function reconcile({ targetUrl, referenceAdminUrl, apply = false }) {
  if (!targetUrl || !referenceAdminUrl) throw new Error("Target and reference admin database URLs are required")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(referenceAdminUrl).hostname)) throw new Error("Reference database must be local")
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"))
  const migrations = await Promise.all(journal.entries.map(async entry => {
    const source = await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8")
    return { ...entry, source, hash: createHash("sha256").update(source).digest("hex") }
  }))
  const database = `saathi_reference_${randomUUID().replaceAll("-", "")}`
  const admin = postgres(referenceAdminUrl, { max: 1, connect_timeout: 10 })
  let reference, target
  try {
    await admin.unsafe(`CREATE DATABASE ${database}`)
    const referenceUrl = new URL(referenceAdminUrl); referenceUrl.pathname = `/${database}`
    reference = postgres(referenceUrl.toString(), { max: 1 })
    await reference.unsafe(`CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb); DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
    for (const migration of migrations) await reference.unsafe(migration.source)
    const tables = (await reference`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`).map(row => row.tablename)
    const expected = await catalog(reference, tables)
    target = postgres(targetUrl, { max: 1, prepare: false, connect_timeout: 15 })
    await target.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(1935761768)`
      await transaction.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN ACCESS EXCLUSIVE MODE')
      const rows = await transaction`SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at`
      if (rows.length !== 0) throw new Error("Journal must be empty; partial or populated journals require separate review")
      await transaction.unsafe(`LOCK TABLE ${tables.map(name => `public."${name}"`).join(",")} IN ACCESS SHARE MODE`)
      const differences = compareCatalogs(expected, await catalog(transaction, tables))
      if (differences.length) throw new Error(`Migration postcondition mismatch: ${differences.join(", ")}`)
      const optional = await transaction`SELECT to_regprocedure('public.rls_auto_enable()')::text AS name`
      if (optional[0].name) {
        const privileges = await transaction`SELECT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.rls_auto_enable()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') OR has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') OR has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') AS allowed`
        if (privileges[0].allowed) throw new Error("Optional rls_auto_enable execution privileges do not satisfy migration 0006")
      }
      if (apply) for (const migration of migrations) await transaction`INSERT INTO drizzle.__drizzle_migrations (hash,created_at) VALUES (${migration.hash},${migration.when})`
      console.log(`${apply ? "Reconciled" : "Verified"} ${migrations.length} migration postconditions against a fresh reference database; ${apply ? "journal baseline inserted" : "journal unchanged"}.`)
    })
    console.log(`Local reference database retained for review: ${database}`)
  } finally {
    await Promise.all([admin.end(), reference?.end(), target?.end()])
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.loadEnvFile?.(".env.local")
    await reconcile({ targetUrl: process.env.DATABASE_RECONCILE_URL, referenceAdminUrl: process.env.DATABASE_REFERENCE_ADMIN_URL, apply: process.argv.includes("--apply") })
  } catch (error) {
    const safe = /^(Target|Reference|Journal|Migration postcondition|Optional)/.test(error.message) ? error.message : "Reconciliation failed; inspect database connectivity and state through the operator console."
    console.error(safe); process.exitCode = 1
  }
}
