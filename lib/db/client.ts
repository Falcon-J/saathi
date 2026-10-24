import postgres from "postgres"

let database: ReturnType<typeof postgres> | undefined
const developmentRuntime = globalThis as typeof globalThis & { saathiDatabase?: ReturnType<typeof postgres> }

/** Server-only pooled connection. No connection is opened during build/import. */
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured")
  if (!database) {
    const configuredMax = process.env.DATABASE_POOL_MAX ?? "1"
    const max = Number(configuredMax)
    if (!Number.isInteger(max) || max < 1 || max > 10 || configuredMax !== String(max)) {
      throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 10")
    }
    const connect = () => postgres(process.env.DATABASE_URL!, { prepare: false, max, connect_timeout: 10 })
    database = process.env.NODE_ENV === "development"
      ? developmentRuntime.saathiDatabase ??= connect()
      : connect()
  }
  return database
}

export type Transaction = postgres.TransactionSql
