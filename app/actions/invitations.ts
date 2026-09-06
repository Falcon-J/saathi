"use server"

import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { createInvitationRecord, listInvitationRecords, readInvitationRecord, respondToInvitation, InvitationError } from "@/lib/data/invitations"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { createHash } from "node:crypto"
import { flushInvitationEmails } from "@/lib/data/invitation-emails"
export type { Invitation } from "@/lib/data/invitations"
export type InvitationResult = {success?:true;error?:string}
async function actor(){const s=await getSession();if(!s)throw new InvitationError("Please sign in and try again.");return s}
function failure(e:unknown):InvitationResult{return {error:e instanceof InvitationError||e instanceof RateLimitExceeded?e.message:"Unable to process the invitation. Please try again."}}
export async function sendWorkspaceInvitation(workspaceId:string,email:string):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-owner:${s.id}`,10,3600000);await consumeDistributedRateLimit(`invite-workspace:${workspaceId}`,30,3600000);
    const hash=createHash("sha256").update(typeof email==="string"?email.trim().toLowerCase():"").digest("hex");await consumeDistributedRateLimit(`invite-recipient:${hash}`,5,3600000);
    await createInvitationRecord(s,workspaceId,email);await flushInvitationEmails();revalidatePath("/dashboard");return {success:true}
  }catch(e){return failure(e)}
}
export async function getUserInvitations(email:string){const s=await actor();if(email.toLowerCase()!==s.email.toLowerCase())throw new InvitationError("Access denied");return listInvitationRecords(s)}
export async function getWorkspaceInvitations(workspaceId:string){return listInvitationRecords(await actor(),workspaceId)}
export async function getInvitation(id:string){return readInvitationRecord(await actor(),id)}
async function respond(id:string,action:"accepted"|"declined"|"revoked"|"resend"):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-response:${s.id}`,30,60000);await respondToInvitation(s,id,action);if(action==="resend")await flushInvitationEmails();revalidatePath("/dashboard");return {success:true}}catch(e){return failure(e)}
}
export async function acceptInvitation(id:string){return respond(id,"accepted")}
export async function declineInvitation(id:string){return respond(id,"declined")}
export async function revokeInvitation(id:string){return respond(id,"revoked")}
export async function resendInvitation(id:string){return respond(id,"resend")}
