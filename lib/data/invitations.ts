import { randomUUID, randomBytes, createHash } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent } from "./events.ts"
import type { InvitationStatus } from "../invitation-domain.ts"

export class InvitationError extends Error {}
export interface Invitation {
  id:string;workspaceId:string;workspaceName:string;inviterEmail:string;inviterUsername:string;
  kind?:"link";inviteeEmail:string;status:InvitationStatus;createdAt:string;expiresAt:string;
}
export interface InvitationPreview {
  id:string;workspaceName:string;inviterUsername:string;status:"pending";expiresAt:string;
}
export interface InvitationLinkPreview extends Omit<InvitationPreview,"status"> { status:"pending"|"accepted";workspaceId?:string }
type Actor={id:string;email:string}
const verificationRequired = "Verify your email to view and respond to workspace invitations."
const normalizedEmail = (email:string) => email.trim().toLowerCase()
async function hasEmailProof(tx:Transaction,actor:Actor,lock=false):Promise<boolean> {
  // Lock the Auth identity during mutations so an email change cannot race admission.
  const [user]=lock ? await tx`SELECT id,email FROM auth.users WHERE id=${actor.id} FOR SHARE`
    : await tx`SELECT id,email FROM auth.users WHERE id=${actor.id}`
  const email=normalizedEmail(actor.email)
  if(!user || normalizedEmail(user.email ?? "")!==email)return false
  const [proof]=await tx`SELECT user_id FROM invitation_email_verifications WHERE user_id=${actor.id} AND email=${email}`
  return Boolean(proof)
}
async function requireEmailProof(tx:Transaction,actor:Actor,lock=false) {
  if(!await hasEmailProof(tx,actor,lock))throw new InvitationError(verificationRequired)
}
export async function hasInvitationEmailProof(actor:Actor):Promise<boolean> {
  return getDb().begin("isolation level repeatable read read only",tx=>hasEmailProof(tx,actor))
}
// Called only after the server verifies an OTP for this immutable identity and email.
export async function recordInvitationEmailProof(actor:Actor):Promise<void> {
  await getDb().begin(async tx=>{
    const [user]=await tx`SELECT id,email FROM auth.users WHERE id=${actor.id} FOR UPDATE`
    const email=normalizedEmail(actor.email)
    if(!user || normalizedEmail(user.email ?? "")!==email)throw new InvitationError(verificationRequired)
    await tx`INSERT INTO invitation_email_verifications(user_id,email) VALUES(${actor.id},${email})
      ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=now()`
  })
}
const iso=(v:Date|string)=>new Date(v).toISOString()
async function projection(tx:Transaction,id:string):Promise<Invitation> {
  const [r]=await tx`SELECT i.*,w.name,p.username,u.email AS inviter_email
    FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
    JOIN profiles p ON p.id=i.inviter_user_id JOIN auth.users u ON u.id=i.inviter_user_id WHERE i.id=${id}`
  if(!r)throw new InvitationError("Invitation unavailable")
  return {id:r.id,workspaceId:r.workspace_id,workspaceName:r.name,inviterEmail:r.inviter_email,inviterUsername:r.username,
    kind:r.token_hash?"link":undefined,inviteeEmail:r.invitee_email ?? "",status:r.status === "pending" && new Date(r.expires_at).getTime()<=Date.now()?"expired":r.status,
    createdAt:iso(r.created_at),expiresAt:iso(r.expires_at)}
}
export async function createInvitationRecord(actor:Actor,workspaceId:string,email:string,beforeCreate?:(recipient:string)=>Promise<void>):Promise<Invitation> {
  if(!z.string().uuid().safeParse(workspaceId).success)throw new InvitationError("Invalid workspace identifier")
  const parsed=z.string().trim().email().max(255).safeParse(email)
  if(!parsed.success)throw new InvitationError("Enter a valid email address")
  const recipient=parsed.data.toLowerCase()
  if(recipient===actor.email.toLowerCase())throw new InvitationError("You cannot invite yourself to the workspace")
  return getDb().begin(async tx=>{
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${workspaceId} FOR UPDATE`
    if(!w || w.owner_user_id!==actor.id || w.archived_at)throw new InvitationError("Only an active workspace owner can send invitations")
    const [member]=await tx`SELECT m.user_id FROM workspace_members m JOIN auth.users u ON u.id=m.user_id WHERE m.workspace_id=${workspaceId} AND lower(u.email)=${recipient}`
    if(member)throw new InvitationError("User is already a member of this workspace")
    await tx`UPDATE workspace_invitations SET status='expired',updated_at=now() WHERE workspace_id=${workspaceId} AND invitee_email=${recipient} AND status='pending' AND expires_at<=now()`
    const [existing]=await tx`SELECT id FROM workspace_invitations WHERE workspace_id=${workspaceId} AND invitee_email=${recipient} AND status='pending'`
    if(existing)return projection(tx,existing.id)
    // Charge shared admission only for a validated, authorized new invitation.
    // The workspace lock remains held, so ownership cannot change before insertion.
    await beforeCreate?.(recipient)
    const id=randomUUID()
    await tx`INSERT INTO workspace_invitations(id,workspace_id,inviter_user_id,invitee_email,expires_at) VALUES(${id},${workspaceId},${actor.id},${recipient},now()+interval '7 days')`
    await appendDomainEvent(tx,{workspaceId,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:"invitation_created"}})
    return projection(tx,id)
  })
}
export async function listInvitationRecords(actor:Actor,workspaceId?:string):Promise<Invitation[]> {
  return getDb().begin("isolation level repeatable read read only",async tx=>{
    if(workspaceId){const [w]=await tx`SELECT id FROM workspaces WHERE id=${workspaceId} AND owner_user_id=${actor.id} AND archived_at IS NULL`;if(!w)throw new InvitationError("Only the owner can view active workspace invitations")}
    if(!workspaceId)await requireEmailProof(tx,actor)
    const rows=workspaceId ? await tx`SELECT id FROM workspace_invitations WHERE workspace_id=${workspaceId} ORDER BY created_at DESC LIMIT 100`
      : await tx`SELECT i.id FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
        WHERE i.invitee_email=${actor.email.toLowerCase()} AND i.status='pending' AND i.expires_at>now() AND w.archived_at IS NULL ORDER BY i.created_at DESC LIMIT 100`
    return Promise.all(rows.map(r=>projection(tx,r.id)))
  })
}
export async function readInvitationRecord(actor:Actor,id:string):Promise<Invitation|null> {
  return getDb().begin(async tx=>{
    const [owned]=await tx`SELECT i.id FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
      WHERE i.id=${id} AND w.owner_user_id=${actor.id}`
    if(owned)return projection(tx,id)
    await requireEmailProof(tx,actor,true)
    const [allowed]=await tx`SELECT i.id FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
      WHERE i.id=${id} AND i.invitee_email=${normalizedEmail(actor.email)}`
    return allowed?projection(tx,id):null
  })
}
export async function readInvitationPreview(id:string):Promise<InvitationPreview|null> {
  const [row]=await getDb()`SELECT i.id,i.expires_at,w.name AS workspace_name,p.username AS inviter_username
    FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
    JOIN profiles p ON p.id=i.inviter_user_id
    WHERE i.id=${id} AND i.token_hash IS NULL AND i.status='pending' AND i.expires_at>now() AND w.archived_at IS NULL`
  return row?{id:row.id,workspaceName:row.workspace_name,inviterUsername:row.inviter_username,status:"pending",expiresAt:iso(row.expires_at)}:null
}
export async function respondToInvitation(actor:Actor,id:string,action:"accepted"|"declined"|"revoked"):Promise<string> {
  return getDb().begin(async tx=>{
    if(action!=="revoked")await requireEmailProof(tx,actor,true)
    const [location]=await tx`SELECT workspace_id FROM workspace_invitations WHERE id=${id}`
    if(!location)throw new InvitationError("Invitation unavailable")
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${location.workspace_id} FOR UPDATE`
    const [i]=await tx`SELECT * FROM workspace_invitations WHERE id=${id} FOR UPDATE`
    if(!w || !i || w.archived_at)throw new InvitationError("Invitation unavailable")
    const ownerAction=action==="revoked"
    if(ownerAction?w.owner_user_id!==actor.id:i.invitee_email!==actor.email.toLowerCase())throw new InvitationError("This invitation is not available for your account")
    if(action==="accepted" && i.status==="accepted" && i.accepted_by_user_id===actor.id)return w.id as string
    if(action===i.status)return w.id as string
    if(i.status!=="pending")throw new InvitationError("Invitation is no longer pending")
    if(new Date(i.expires_at).getTime()<=Date.now())throw new InvitationError("Invitation has expired. Ask the owner for a new invitation.")
    await tx`UPDATE workspace_invitations SET status=${action},responded_at=now(),updated_at=now(),accepted_by_user_id=${action==="accepted"?actor.id:null} WHERE id=${id}`
    if(action==="accepted"){
      await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${w.id},${actor.id}) ON CONFLICT DO NOTHING`
      await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"member-added",entityType:"invitation",entityId:id})
    }else{
      await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:`invitation_${action}`}})
    }
    return w.id as string
  })
}

function invitationTokenHash(token:string):string|null {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest("hex") : null
}
export async function createInvitationLinkRecord(actor:Actor,workspaceId:string,beforeCreate?:()=>Promise<void>):Promise<{invitation:Invitation;token:string}> {
  if(!z.string().uuid().safeParse(workspaceId).success)throw new InvitationError("Invalid workspace identifier")
  return getDb().begin(async tx=>{
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${workspaceId} FOR UPDATE`
    if(!w || w.owner_user_id!==actor.id || w.archived_at)throw new InvitationError("Only an active workspace owner can create invitation links")
    await beforeCreate?.()
    const id=randomUUID(),token=randomBytes(32).toString("base64url"),hash=invitationTokenHash(token)!
    await tx`INSERT INTO workspace_invitations(id,workspace_id,inviter_user_id,token_hash,expires_at)
      VALUES(${id},${workspaceId},${actor.id},${hash},now()+interval '7 days')`
    await appendDomainEvent(tx,{workspaceId,actorUserId:actor.id,type:"invitation-updated",entityType:"invitation",entityId:id,metadata:{action:"invitation_link_created"}})
    return {invitation:await projection(tx,id),token}
  })
}
export async function readInvitationLinkPreview(token:string,actor?:Actor|null):Promise<InvitationLinkPreview|null> {
  const hash=invitationTokenHash(token)
  if(!hash)return null
  const [row]=await getDb()`SELECT i.id,i.expires_at,i.status,w.id AS workspace_id,w.name AS workspace_name,p.username AS inviter_username
    FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id JOIN profiles p ON p.id=i.inviter_user_id
    WHERE i.token_hash=${hash} AND w.archived_at IS NULL AND (
      (i.status='pending' AND i.expires_at>now()) OR
      (i.status='accepted' AND i.accepted_by_user_id=${actor?.id ?? null}
        AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=${actor?.id ?? null})))`
  return row?{id:row.id,workspaceName:row.workspace_name,inviterUsername:row.inviter_username,status:row.status,expiresAt:iso(row.expires_at),...(row.status==="accepted"?{workspaceId:row.workspace_id}:{})}:null
}
export async function acceptInvitationLinkRecord(actor:Actor,token:string):Promise<string> {
  const hash=invitationTokenHash(token)
  if(!hash)throw new InvitationError("Invitation unavailable")
  return getDb().begin(async tx=>{
    const [location]=await tx`SELECT workspace_id FROM workspace_invitations WHERE token_hash=${hash}`
    if(!location)throw new InvitationError("Invitation unavailable")
    // Same lock order as owner revocation and legacy acceptance serializes races.
    const [w]=await tx`SELECT * FROM workspaces WHERE id=${location.workspace_id} FOR UPDATE`
    const [i]=await tx`SELECT * FROM workspace_invitations WHERE token_hash=${hash} FOR UPDATE`
    if(!w || !i || w.archived_at)throw new InvitationError("Invitation unavailable")
    if(i.status==="accepted" && i.accepted_by_user_id===actor.id)return w.id as string
    if(i.status!=="pending")throw new InvitationError("Invitation is no longer pending")
    if(new Date(i.expires_at).getTime()<=Date.now())throw new InvitationError("Invitation has expired. Ask the owner for a new invitation.")
    const [member]=await tx`SELECT user_id FROM workspace_members WHERE workspace_id=${w.id} AND user_id=${actor.id}`
    if(member)throw new InvitationError("You are already a member of this workspace")
    await tx`UPDATE workspace_invitations SET status='accepted',accepted_by_user_id=${actor.id},responded_at=now(),updated_at=now() WHERE id=${i.id}`
    await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${w.id},${actor.id})`
    await appendDomainEvent(tx,{workspaceId:w.id,actorUserId:actor.id,type:"member-added",entityType:"invitation",entityId:i.id})
    return w.id as string
  })
}
