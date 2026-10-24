import postgres from "postgres"

const url = process.env.DATABASE_TEST_URL
if (!url) throw new Error("DATABASE_TEST_URL is required for test:database")

let parsed
try {
  parsed = new URL(url)
} catch {
  throw new Error("DATABASE_TEST_URL must be a valid PostgreSQL URL")
}

if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
  throw new Error("test:database requires a loopback DATABASE_TEST_URL")
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5 })
try {
  await sql`SELECT 1`
  console.log("Database test preflight passed")
} finally {
  await sql.end()
}
