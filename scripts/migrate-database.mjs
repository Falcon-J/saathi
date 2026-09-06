import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

if (!process.env.DATABASE_MIGRATION_URL) throw new Error("DATABASE_MIGRATION_URL is required")
const connection = postgres(process.env.DATABASE_MIGRATION_URL, { max: 1, prepare: false })
try {
  await migrate(drizzle(connection), { migrationsFolder: "./drizzle" })
  console.log("Database migrations applied")
} catch {
  console.error("Database migration failed. Inspect database connectivity and migration state through the operator console.")
  process.exitCode = 1
} finally { await connection.end() }
