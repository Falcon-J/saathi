import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { createTaskRecord,changeTaskRecord,listTaskRecords } from "./tasks.ts"
import { createInvitationRecord,readInvitationPreview,respondToInvitation } from "./invitations.ts"

test("database collaboration boundaries",{skip:!process.env.DATABASE_TEST_URL},async t=>{
  process.env.DATABASE_URL=process.env.DATABASE_TEST_URL
  const db=getDb(),owner={id:randomUUID(),email:randomUUID()+"@example.test"},member={id:randomUUID(),email:randomUUID()+"@example.test"},outsider={id:randomUUID(),email:randomUUID()+"@example.test"},newRecipientEmail=randomUUID()+"@example.test"
  await db`INSERT INTO auth.users(id,email) VALUES(${owner.id},${owner.email}),(${member.id},${member.email}),(${outsider.id},${outsider.email})`
  try{
    const workspace=await createWorkspaceRecord(owner.id,{name:"Integration fixture"})
    const invitation=await createInvitationRecord(owner,workspace.id,member.email)
    const newRecipientInvitation=await createInvitationRecord(owner,workspace.id,newRecipientEmail)
    await t.test("invitation is available before the recipient creates an account",async()=>{
      const preview=await readInvitationPreview(newRecipientInvitation.id)
      assert.ok(preview)
      assert.equal(preview.id,newRecipientInvitation.id)
      assert.equal(preview.workspaceName,"Integration fixture")
      assert.ok(preview.inviterUsername.length>0)
      assert.equal(preview.status,"pending")
      assert.ok(new Date(preview.expiresAt).getTime()>Date.now())
      assert.equal((await db`SELECT id FROM auth.users WHERE email=${newRecipientEmail}`).length,0)
    })
    await t.test("duplicate invitation returns original; outsider cannot accept",async()=>{
      assert.equal((await createInvitationRecord(owner,workspace.id,member.email)).id,invitation.id)
      await assert.rejects(respondToInvitation(outsider,invitation.id,"accepted"),/not available/)
    })
    await t.test("repeated acceptance creates one membership and one accepted event",async()=>{
      await respondToInvitation(member,invitation.id,"accepted");await respondToInvitation(member,invitation.id,"accepted")
      assert.equal((await db`SELECT * FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${member.id}`).length,1)
      assert.equal((await db`SELECT * FROM activity_events WHERE entity_id=${invitation.id} AND event_type='member-added'`).length,1)
      await assert.rejects(respondToInvitation(owner,invitation.id,"revoked"),/no longer pending/)
    })
    await t.test("task assignment rejects non-members and preserves fields across partial edits",async()=>{
      await assert.rejects(createTaskRecord(owner.id,workspace.id,{title:"Invalid",assigneeEmail:outsider.email}),/workspace member/)
      let task=await createTaskRecord(owner.id,workspace.id,{title:"Ship",description:"Keep this",priority:"high",dueDate:"2026-09-15",assigneeEmail:member.email})
      assert.equal(task.dueDate,"2026-09-15")
      task=await changeTaskRecord(owner.id,task.id,"edit",{title:"Ship safely"},task.version)
      assert.equal(task.description,"Keep this");assert.equal(task.assigneeEmail,member.email)
      await assert.rejects(changeTaskRecord(owner.id,task.id,"edit",{title:"Stale"},1),/changed/)
      await assert.rejects(changeTaskRecord(member.id,task.id,"delete",{},task.version),/Access denied/)
      const done=await changeTaskRecord(member.id,task.id,"toggle",{},task.version)
      assert.equal(done.completed,true)
      await assert.rejects(listTaskRecords(outsider.id,workspace.id),/access denied/)
    })
    await t.test("pending invitations expire without adding membership",async()=>{
      const expired=await createInvitationRecord(owner,workspace.id,outsider.email)
      await db`UPDATE workspace_invitations SET expires_at=now()-interval '1 day' WHERE id=${expired.id}`
      await assert.rejects(respondToInvitation(outsider,expired.id,"accepted"),/expired/)
      assert.equal((await db`SELECT * FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${outsider.id}`).length,0)
    })
    await t.test("task errors distinguish validation, denial, missing records and stale edits",async()=>{
      await assert.rejects(createTaskRecord(owner.id,workspace.id,{title:""}), {code:"validation"})
      const task=await createTaskRecord(owner.id,workspace.id,{title:"Error contract",assigneeEmail:member.email})
      await assert.rejects(changeTaskRecord(owner.id,task.id,"edit",{title:"Stale"},0), {code:"conflict"})
      await assert.rejects(changeTaskRecord(owner.id,task.id,"edit",{title:"Missing version"}), {code:"conflict"})
      await assert.rejects(changeTaskRecord(member.id,task.id,"delete",{},task.version), {code:"forbidden"})
      await assert.rejects(listTaskRecords(outsider.id,workspace.id), {code:"forbidden"})
      await assert.rejects(changeTaskRecord(owner.id,randomUUID(),"delete",{},1), {code:"not_found"})
      const cleared=await changeTaskRecord(owner.id,task.id,"edit",{assigneeEmail:undefined,dueDate:undefined},task.version)
      assert.equal(cleared.assigneeEmail,undefined)
      assert.equal(cleared.dueDate,undefined)
    })
    await t.test("task list preserves projections with constant query count and deterministic ordering",async()=>{
      const instant="2026-10-04T10:30:00.000Z"
      const dated=await createTaskRecord(owner.id,workspace.id,{title:"Calendar",dueDate:"2026-10-04",assigneeEmail:member.email})
      const timed=await createTaskRecord(owner.id,workspace.id,{title:"Instant",dueAt:instant})
      await db`UPDATE tasks SET created_at='2026-10-04T00:00:00Z' WHERE workspace_id=${workspace.id}`
      const originalBegin=db.begin
      let queries=0
      db.begin=((options: string, callback: (tx: unknown)=>unknown)=>originalBegin.call(db,options,async(tx: unknown)=>callback(new Proxy(tx as object,{
        apply(target,thisArg,args){queries++;return Reflect.apply(target as (...args: unknown[])=>unknown,thisArg,args)},
      })))) as typeof db.begin
      let tasks
      try { tasks=await listTaskRecords(owner.id,workspace.id) } finally {db.begin=originalBegin}
      assert.equal(queries,2,"one authorization query and one task projection query")
      assert.deepEqual(tasks.map(task=>task.id),tasks.map(task=>task.id).sort())
      assert.equal(tasks.find(task=>task.id===dated.id)?.dueDate,"2026-10-04")
      assert.equal(tasks.find(task=>task.id===dated.id)?.assigneeEmail,member.email)
      assert.equal(tasks.find(task=>task.id===timed.id)?.dueAt,instant)
      assert.equal(tasks.find(task=>task.id===timed.id)?.assigneeEmail,undefined)
      const empty=await createWorkspaceRecord(owner.id,{name:"Empty list"})
      assert.deepEqual(await listTaskRecords(owner.id,empty.id),[])
    })
  }finally{
    // Only records belonging to UUIDs created by this test are removed.
    await db`DELETE FROM workspaces WHERE owner_user_id=${owner.id}`
    await db`DELETE FROM outbox_events WHERE payload->>'userId' IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM profiles WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db`DELETE FROM auth.users WHERE id IN (${owner.id},${member.id},${outsider.id})`
    await db.end()
  }
})
