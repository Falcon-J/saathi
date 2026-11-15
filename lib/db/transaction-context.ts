import { AsyncLocalStorage } from "node:async_hooks"
import type postgres from "postgres"

const transactions = new AsyncLocalStorage<{ transaction: postgres.TransactionSql; database: postgres.Sql }>()
export function getCurrentTransaction(): postgres.TransactionSql | undefined { return transactions.getStore()?.transaction }
export function getTransactionDatabase(): postgres.Sql | undefined { return transactions.getStore()?.database }
/** Nested DAL begin calls retain rollback boundaries using savepoints.
 * PostgreSQL isolation belongs to the outer transaction; nested read options cannot change it. */
export function withTransactionContext<T>(transaction: postgres.TransactionSql, callback: () => T): T {
  const database = new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === "begin") return (...args: unknown[]) => {
        const operation = args.at(-1)
        if (typeof operation !== "function") throw new TypeError("Transaction callback is required")
        return target.savepoint(child => withTransactionContext(child, () => operation(child)))
      }
      return Reflect.get(target, property, receiver)
    },
  }) as unknown as postgres.Sql
  return transactions.run({ transaction, database }, callback)
}
