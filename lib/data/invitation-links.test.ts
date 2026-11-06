import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db/client.ts'
import { createWorkspaceRecord } from './workspaces.ts'
import { createInvitationLinkRecord, acceptInvitationLinkRecord, readInvitationLinkPreview, readInvitationPreview, respondToInvitation } from './invitations.ts'

test('bearer invitations preserve atomic admission and legacy boundaries', {skip:!process.env.DATABASE_TEST_URL}, async () => {
  process.env.DATABASE_URL=process.env.DATABASE_TEST_URL
  process.env.DATABASE_POOL_MAX='2'
  const db=getDb(), actors=Array.from({length:4},()=>({id:randomUUID(),email:`${randomUUID()}@example.test`}))
  const [owner,first,second,third]=actors
  let workspaceId:string|undefined
  try {
    for(const actor of actors)await db`INSERT INTO auth.users(id,email) VALUES(${actor.id},${actor.email})`
    const workspace=await createWorkspaceRecord(owner.id,{name:'Bearer link fixture'});workspaceId=workspace.id
    const link=await createInvitationLinkRecord(owner,workspace.id)
    assert.equal((await db`SELECT user_id FROM invitation_email_verifications WHERE user_id IN ${db(actors.map(a=>a.id))}`).length,0)
    assert.equal(await readInvitationPreview(link.invitation.id),null)
    assert.equal((await readInvitationLinkPreview(link.token))?.workspaceName,workspace.name)
    await assert.rejects(respondToInvitation(first,link.invitation.id,'accepted'),/Verify your email/)
    const [secretRow]=await db`SELECT token_hash FROM workspace_invitations WHERE id=${link.invitation.id}`
    await assert.rejects(acceptInvitationLinkRecord(first,secretRow.token_hash),/unavailable/)
    await assert.rejects(acceptInvitationLinkRecord(first,'A'.repeat(43)),/unavailable/)
    const expired=await createInvitationLinkRecord(owner,workspace.id)
    await db`UPDATE workspace_invitations SET expires_at=now()-interval '1 second' WHERE id=${expired.invitation.id}`
    await assert.rejects(acceptInvitationLinkRecord(first,expired.token),/expired/)
    assert.equal(await readInvitationLinkPreview(expired.token),null)
    const attempts=await Promise.allSettled([acceptInvitationLinkRecord(first,link.token),acceptInvitationLinkRecord(second,link.token)])
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1)
    const [stored]=await db`SELECT status,accepted_by_user_id FROM workspace_invitations WHERE id=${link.invitation.id}`
    const winner=actors.find(a=>a.id===stored.accepted_by_user_id)!
    assert.equal(await acceptInvitationLinkRecord(winner,link.token),workspace.id)
    const loser=winner.id===first.id?second:first
    await assert.rejects(acceptInvitationLinkRecord(loser,link.token),/no longer pending/)
    assert.equal((await db`SELECT user_id FROM workspace_members WHERE workspace_id=${workspace.id}`).length,2)
    assert.equal((await db`SELECT id FROM activity_events WHERE entity_id=${link.invitation.id} AND event_type='member-added'`).length,1)
    const race=await createInvitationLinkRecord(owner,workspace.id)
    await Promise.allSettled([respondToInvitation(owner,race.invitation.id,'revoked'),acceptInvitationLinkRecord(third,race.token)])
    const [result]=await db`SELECT status FROM workspace_invitations WHERE id=${race.invitation.id}`
    assert.ok(['revoked','accepted'].includes(result.status))
    const joined=(await db`SELECT user_id FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${third.id}`).length
    assert.equal(joined,result.status==='accepted'?1:0)
    assert.equal(await readInvitationLinkPreview(race.token),null)
  } finally {
    if(workspaceId){await db`DELETE FROM activity_events WHERE workspace_id=${workspaceId}`;await db`DELETE FROM outbox_events WHERE workspace_id=${workspaceId}`;await db`DELETE FROM workspaces WHERE id=${workspaceId}`}
    for(const actor of actors){await db`DELETE FROM profiles WHERE id=${actor.id}`;await db`DELETE FROM auth.users WHERE id=${actor.id}`}
    await db.end()
  }
})
