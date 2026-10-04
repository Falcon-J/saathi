import postgres from "postgres"

let database: ReturnType<typeof postgres> | undefined
const developmentRuntime = globalThis as typeof globalThis & { saathiDatabase?: ReturnType<typeof postgres> }

/** Server-only pooled connection. No connection is opened during build/import. */
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured")
  if (!database) {
    const connect = () => postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 10 })
    database = process.env.NODE_ENV === "development"
      ? developmentRuntime.saathiDatabase ??= connect()
      : connect()
  }
  return database
}

export type Transaction = postgres.TransactionSql
