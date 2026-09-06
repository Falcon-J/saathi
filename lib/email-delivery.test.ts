import assert from "node:assert/strict"
import test from "node:test"
import { deliverInvitationEmail,mayRetryEmail } from "./email-delivery.ts"
const payload={from:"sender@example.test",to:["recipient@example.test"],subject:"Invite",text:"Review invitation"}
test("email retry sends stable key and unchanged payload",async()=>{
  const requests:RequestInit[]=[]
  const send:typeof fetch=async(_url,init)=>{requests.push(init!);return Response.json({id:"provider-id"})}
  await deliverInvitationEmail("event-id",payload,"test-only",send);await deliverInvitationEmail("event-id",payload,"test-only",send)
  assert.equal(requests[0].body,requests[1].body)
  assert.equal(new Headers(requests[0].headers).get("Idempotency-Key"),"event-id")
})
test("ambiguous delivery stays retryable, invalid recipients do not loop",async()=>{
  assert.deepEqual(await deliverInvitationEmail("id",payload,"test",async()=>{throw new Error("timeout")}),{status:"retry",category:"OUTCOME_UNKNOWN"})
  assert.equal((await deliverInvitationEmail("id",payload,"test",async()=>new Response(null,{status:422}))).status,"failed")
  assert.equal(mayRetryEmail(new Date(0),24*60*60*1000),false)
})
