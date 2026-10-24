"use server"

import { getSession } from "@/lib/auth-simple"
import { revalidatePath } from "next/cache"
import { createInvitationRecord, listInvitationRecords, readInvitationPreview, readInvitationRecord, respondToInvitation, InvitationError } from "@/lib/data/invitations"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { createHash } from "node:crypto"
export type { Invitation } from "@/lib/data/invitations"
import type { Invitation } from "@/lib/data/invitations"
export type InvitationResult = {success?:true;invitation?:Invitation;error?:string}
async function actor(){const s=await getSession();if(!s)throw new InvitationError("Please sign in and try again.");return s}
function failure(e:unknown):InvitationResult{return {error:e instanceof InvitationError||e instanceof RateLimitExceeded?e.message:"Unable to process the invitation. Please try again."}}
export async function sendWorkspaceInvitation(workspaceId:string,email:string):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-owner:${s.id}`,10,3600000);await consumeDistributedRateLimit(`invite-workspace:${workspaceId}`,30,3600000);
    const hash=createHash("sha256").update(typeof email==="string"?email.trim().toLowerCase():"").digest("hex");await consumeDistributedRateLimit(`invite-recipient:${hash}`,5,3600000);
    const invitation=await createInvitationRecord(s,workspaceId,email);revalidatePath("/dashboard");return {success:true,invitation}
  }catch(e){return failure(e)}
}
export async function getUserInvitations(email:string){const s=await actor();if(email.toLowerCase()!==s.email.toLowerCase())throw new InvitationError("Access denied");return listInvitationRecords(s)}
export async function getWorkspaceInvitations(workspaceId:string){return listInvitationRecords(await actor(),workspaceId)}
export async function getInvitation(id:string){return readInvitationRecord(await actor(),id)}
export async function getInvitationPreview(id:string){return readInvitationPreview(id)}
async function respond(id:string,action:"accepted"|"declined"|"revoked"):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-response:${s.id}`,30,60000);await respondToInvitation(s,id,action);revalidatePath("/dashboard");return {success:true}}catch(e){return failure(e)}
}
export async function acceptInvitation(id:string){return respond(id,"accepted")}
export async function declineInvitation(id:string){return respond(id,"declined")}
export async function revokeInvitation(id:string){return respond(id,"revoked")}
