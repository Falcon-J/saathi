import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {toDomainCommandId} from './command-identity.ts'
const actor='11111111-1111-4111-8111-111111111111',command='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333'
test('domain command IDs are stable UUIDs isolated by actor and client',()=>{
 const first=toDomainCommandId(actor,'client-a',command)
 assert.equal(z.uuid().safeParse(first).success,true)
 assert.notEqual(first,command)
 assert.equal(toDomainCommandId(actor,'client-a',command),first)
 assert.notEqual(toDomainCommandId(actor,'client-b',command),first)
 assert.notEqual(toDomainCommandId(other,'client-a',command),first)
 assert.notEqual(toDomainCommandId(actor,'client-a',other),first)
 assert.throws(()=>toDomainCommandId('invalid','client-a',command))
 assert.throws(()=>toDomainCommandId(actor,'',command))
})
