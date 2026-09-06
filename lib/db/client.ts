import postgres from "postgres"

let database: ReturnType<typeof postgres> | undefined

/** Server-only pooled connection. No connection is opened during build/import. */
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured")
  database ??= postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10 })
  return database
}

export type Transaction = postgres.TransactionSql
