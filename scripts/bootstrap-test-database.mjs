import postgres from "postgres"

// SQL-only integration fixture. Never run this against a Supabase Auth project.
const url = process.env.DATABASE_TEST_URL
if (!url) throw new Error("DATABASE_TEST_URL is required")
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("Test bootstrap requires a loopback database")
const connection = postgres(url, { max: 1 })
try {
  await connection.unsafe(`CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, raw_user_meta_data jsonb NOT NULL DEFAULT '{}');
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  console.log("SQL test identity stub installed. This does not validate Supabase authentication.")
} finally { await connection.end() }
