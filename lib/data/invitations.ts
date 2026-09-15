import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent, flushOutbox } from "./events.ts"
import type { InvitationStatus } from "../invitation-domain.ts"

export class InvitationError extends Error {}
export interface Invitation {
  id:string;workspaceId:string;workspaceName:string;inviterEmail:string;inviterUsername:string;
  inviteeEmail:string;status:InvitationStatus;createdAt:string;expiresAt:string;
  deliveryStatus:"queued"|"sent"|"failed"|"unconfigured"|"cancelled"|"delivered"|"bounced"|"complained";
}
type Actor={id:string;email:string}
const iso=(v:Date|string)=>new Date(v).toISOString()
async function projection(tx:Transaction,id:string):Promise<Invitation> {
  const [r]=await tx`SELECT i.*,w.name,p.username,u.email AS inviter_email,
    (SELECT COALESCE(delivery_status,status) FROM invitation_emails e WHERE e.invitation_id=i.id ORDER BY created_at DESC LIMIT 1) AS delivery
    FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
    JOIN profiles p ON p.id=i.inviter_user_id JOIN auth.users u ON u.id=i.inviter_user_id WHERE i.id=${id}`
  if(!r)throw new InvitationError("Invitation unavailable")
  return {id:r.id,workspaceId:r.workspace_id,workspaceName:r.name,inviterEmail:r.inviter_email,inviterUsername:r.username,
    inviteeEmail:r.invitee_email,status:r.status === "pending" && new Date(r.expires_at).getTime()<=Date.now()?"expired":r.status,
    createdAt:iso(r.created_at),expiresAt:iso(r.expires_at),deliveryStatus:process.env.RESEND_API_KEY&&r.delivery?r.delivery:"unconfigured"}
}
async function queueEmail(tx:Transaction,invitationId:string) {
  // Save immutable provider request so idempotent retries never change the payload.
  const invite=await projection(tx,invitationId)
  const base=process.env.NEXT_PUBLIC_APP_URL
  const from=process.env.EMAIL_FROM
  if(!base || !from)return
  const [suppressed]=await tx`SELECT email FROM email_suppressions WHERE email=${invite.inviteeEmail}`
  if(suppressed)throw new InvitationError("Email delivery is disabled for this address after a bounce or complaint")
  const origin=new URL(base)
  if(origin.protocol!=="https:" && !["localhost","127.0.0.1"].includes(origin.hostname))throw new InvitationError("Invitation email is not configured")
  const link=new URL(`/invitations/${invitationId}`,origin).toString()
  await tx`INSERT INTO invitation_emails(id,invitation_id,payload) VALUES(${randomUUID()},${invitationId},${tx.json({
    from,to:[invite.inviteeEmail],subject:"You have been invited to a Saathi workspace",
    text:`${invite.inviterUsername} invited you to ${invite.workspaceName}.\n\nSign in with the invited email address to review and accept:\n${link}\n\nThis invitation expires in seven days. Ignore this email if it was unexpected.`
  })})`
}
export async function createInvitationRecord(actor:Actor,workspaceId:string,email:string):Promise<Invitation> {
  const parsed=z.string().trim().email().max(255).safeParse(email)
  if(!parsed.success)throw new InvitationError("Enter a valid email address")
  const recipient=parsed.data.toLowerCase()
  if(recipient===actor.email.toLowerCase())throw new InvitationError("You cannot invite yourself to the workspace")
  return getDb().begin(async tx=>{
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${workspaceId} FOR UPDATE`
    if(!w || w.owner_user_id!==actor.id)throw new InvitationError("Only workspace owner can send invitations")
    const [member]=await tx`SELECT m.user_id FROM workspace_members m JOIN auth.users u ON u.id=m.user_id WHERE m.workspace_id=${workspaceId} AND lower(u.email)=${recipient}`
    if(member)throw new InvitationError("User is already a member of this workspace")
    await tx`UPDATE workspace_invitations SET status='expired',updated_at=now() WHERE workspace_id=${workspaceId} AND invitee_email=${recipient} AND status='pending' AND expires_at<=now()`
    const [existing]=await tx`SELECT id FROM workspace_invitations WHERE workspace_id=${workspaceId} AND invitee_email=${recipient} AND status='pending'`
    if(existing)return projection(tx,existing.id)
    const id=randomUUID()
    await tx`INSERT INTO workspace_invitations(id,workspace_id,inviter_user_id,invitee_email,expires_at) VALUES(${id},${workspaceId},${actor.id},${recipient},now()+interval '7 days')`
    await queueEmail(tx,id)
    await appendDomainEvent(tx,{workspaceId,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:"invitation_created"}})
    return projection(tx,id)
  })
}
export async function listInvitationRecords(actor:Actor,workspaceId?:string):Promise<Invitation[]> {
  return getDb().begin("isolation level repeatable read read only",async tx=>{
    if(workspaceId){const [w]=await tx`SELECT id FROM workspaces WHERE id=${workspaceId} AND owner_user_id=${actor.id}`;if(!w)throw new InvitationError("Only the owner can view workspace invitations")}
    const rows=workspaceId ? await tx`SELECT id FROM workspace_invitations WHERE workspace_id=${workspaceId} ORDER BY created_at DESC LIMIT 100`
      : await tx`SELECT id FROM workspace_invitations WHERE invitee_email=${actor.email.toLowerCase()} AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 100`
    return Promise.all(rows.map(r=>projection(tx,r.id)))
  })
}
export async function readInvitationRecord(actor:Actor,id:string):Promise<Invitation|null> {
  return getDb().begin(async tx=>{
    const [allowed]=await tx`SELECT i.id FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
      WHERE i.id=${id} AND (i.invitee_email=${actor.email.toLowerCase()} OR w.owner_user_id=${actor.id})`
    return allowed?projection(tx,id):null
  })
}
export async function respondToInvitation(actor:Actor,id:string,action:"accepted"|"declined"|"revoked"|"resend"):Promise<void> {
  const workspaceId=await getDb().begin(async tx=>{
    const [location]=await tx`SELECT workspace_id FROM workspace_invitations WHERE id=${id}`
    if(!location)throw new InvitationError("Invitation unavailable")
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${location.workspace_id} FOR UPDATE`
    const [i]=await tx`SELECT * FROM workspace_invitations WHERE id=${id} FOR UPDATE`
    if(!w || !i)throw new InvitationError("Invitation unavailable")
    const ownerAction=action==="revoked"||action==="resend"
    if(ownerAction?w.owner_user_id!==actor.id:i.invitee_email!==actor.email.toLowerCase())throw new InvitationError("This invitation is not available for your account")
    if(action==="accepted" && i.status==="accepted" && i.accepted_by_user_id===actor.id)return w.id as string
    if(action===i.status)return w.id as string
    if(i.status!=="pending")throw new InvitationError("Invitation is no longer pending")
    if(new Date(i.expires_at).getTime()<=Date.now())throw new InvitationError("Invitation has expired. Ask the owner for a new invitation.")
    if(action==="resend"){
      const [recent]=await tx`SELECT created_at,status FROM invitation_emails WHERE invitation_id=${id} ORDER BY created_at DESC LIMIT 1`
      if(recent && (recent.status==="queued" || Date.now()-new Date(recent.created_at).getTime()<60000))throw new InvitationError("An invitation email is already queued or was just sent")
      await queueEmail(tx,id)
      await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:"invitation_resent"}})
      return w.id as string
    }
    await tx`UPDATE workspace_invitations SET status=${action},responded_at=now(),updated_at=now(),accepted_by_user_id=${action==="accepted"?actor.id:null} WHERE id=${id}`
    await tx`UPDATE invitation_emails SET status='cancelled' WHERE invitation_id=${id} AND status='queued'`
    if(action==="accepted"){
      await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${w.id},${actor.id}) ON CONFLICT DO NOTHING`
      await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"member-added",entityType:"invitation",entityId:id})
    }else{
      await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:`invitation_${action}`}})
    }
    return w.id as string
  })
  await flushOutbox(workspaceId)
}
