import assert from 'node:assert/strict'
import { test } from 'node:test'
import type postgres from 'postgres'
import { getCurrentTransaction, getTransactionDatabase, withTransactionContext } from './transaction-context.ts'
function fakeTransaction(events: string[], label: string): postgres.TransactionSql {
  const fn = Object.assign(() => label, { savepoint: async (callback: (tx: postgres.TransactionSql) => Promise<unknown>) => {
    events.push('savepoint')
    try { const result = await callback(fakeTransaction(events, label + '.child')); events.push('release'); return result }
    catch (error) { events.push('rollback'); throw error }
  } })
  return fn as unknown as postgres.TransactionSql
}
test('nested begin uses a savepoint and restores the parent after rollback', async () => {
  const events: string[] = [], tx = fakeTransaction(events, 'parent')
  assert.equal(getTransactionDatabase(), undefined)
  await withTransactionContext(tx, async () => {
    assert.equal(getCurrentTransaction(), tx)
    const db = getTransactionDatabase()!
    await assert.rejects(db.begin('isolation level repeatable read read only', async child => {
      assert.equal(getCurrentTransaction(), child)
      throw new Error('rollback child')
    }), /rollback child/)
    assert.equal(getCurrentTransaction(), tx)
    assert.equal(await db.begin(async () => 'saved'), 'saved')
  })
  assert.deepEqual(events, ['savepoint', 'rollback', 'savepoint', 'release'])
  assert.equal(getCurrentTransaction(), undefined)
})
test('overlapping asynchronous requests never inherit another transaction', async () => {
  const a = fakeTransaction([], 'a'), b = fakeTransaction([], 'b')
  let unblock!: () => void
  const gate = new Promise<void>(resolve => { unblock = resolve })
  const first = withTransactionContext(a, async () => { await gate; assert.equal(getCurrentTransaction(), a) })
  await withTransactionContext(b, async () => { await Promise.resolve(); assert.equal(getCurrentTransaction(), b); unblock() })
  await first
  await assert.rejects(withTransactionContext(a, async () => { throw new Error('failure') }), /failure/)
  assert.equal(getCurrentTransaction(), undefined)
})
