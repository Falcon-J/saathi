"use server"

import { getSession } from "@/lib/auth-simple"
import { afterDomainCommit } from "@/lib/post-commit"
import { createInvitationLinkRecord, readInvitationLinkPreview, acceptInvitationLinkRecord, createInvitationRecord, listInvitationRecords, readInvitationPreview, readInvitationRecord, respondToInvitation, hasInvitationEmailProof, recordInvitationEmailProof, InvitationError } from "@/lib/data/invitations"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseConfig } from "@/lib/supabase/config"
import { createHash } from "node:crypto"
export type { Invitation, InvitationPreview } from "@/lib/data/invitations"
import type { Invitation } from "@/lib/data/invitations"
export type InvitationResult = {success?:true;invitation?:Invitation;error?:string}
async function actor(){const s=await getSession();if(!s)throw new InvitationError("Please sign in and try again.");return s}
function failure(e:unknown):InvitationResult{return {error:e instanceof InvitationError||e instanceof RateLimitExceeded?e.message:"Unable to process the invitation. Please try again."}}
export async function sendWorkspaceInvitation(workspaceId:string,email:string):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-owner:${s.id}`,10,3600000);
    const invitation=await createInvitationRecord(s,workspaceId,email,async recipient=>{
      await consumeDistributedRateLimit(`invite-workspace:${workspaceId}`,30,3600000)
      const hash=createHash("sha256").update(recipient).digest("hex")
      await consumeDistributedRateLimit(`invite-recipient:${hash}`,5,3600000)
    });afterDomainCommit(invitation.workspaceId);return {success:true,invitation}
  }catch(e){return failure(e)}
}
export async function getUserInvitations(email:string){const s=await actor();if(email.toLowerCase()!==s.email.toLowerCase())throw new InvitationError("Access denied");return listInvitationRecords(s)}
export async function getWorkspaceInvitations(workspaceId:string){return listInvitationRecords(await actor(),workspaceId)}
export async function getInvitation(id:string){return readInvitationRecord(await actor(),id)}
export async function getInvitationPreview(id:string){return readInvitationPreview(id)}
async function respond(id:string,action:"accepted"|"declined"|"revoked"):Promise<InvitationResult>{
  try{const s=await actor();await consumeDistributedRateLimit(`invite-response:${s.id}`,30,60000);const workspaceId=await respondToInvitation(s,id,action);afterDomainCommit(workspaceId);return {success:true}}catch(e){return failure(e)}
}
export async function acceptInvitation(id:string){return respond(id,"accepted")}
export async function declineInvitation(id:string){return respond(id,"declined")}
export async function revokeInvitation(id:string){return respond(id,"revoked")}

export async function getInvitationVerificationStatus():Promise<{verified:boolean;error?:string}> {
  try{return {verified:await hasInvitationEmailProof(await actor())}}
  catch(e){return {verified:false,...failure(e)}}
}
function verificationClient(){
  const {url,key}=getSupabaseConfig()
  // No cookie adapter, storage, URL detection, or session refresh: OTP must never replace the interactive session.
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
export async function requestInvitationVerification():Promise<InvitationResult> {
  try {
    const s=await actor()
    await consumeDistributedRateLimit(`invite-verify-send:${s.id}`,3,3600000)
    if(await hasInvitationEmailProof(s))return {success:true}
    const email=s.email.trim().toLowerCase()
    const {error}=await verificationClient().auth.signInWithOtp({email,options:{shouldCreateUser:false}})
    if(error)throw new InvitationError("Unable to send a verification code. Please try again later.")
    return {success:true}
  }catch(e){return failure(e)}
}
export async function confirmInvitationVerification(code:string):Promise<InvitationResult> {
  try {
    const s=await actor()
    await consumeDistributedRateLimit(`invite-verify-code:${s.id}`,10,600000)
    if(typeof code!=="string" || !/^\d{6,8}$/.test(code.trim()))throw new InvitationError("Enter the verification code from your email.")
    const email=s.email.trim().toLowerCase()
    const {data,error}=await verificationClient().auth.verifyOtp({email,token:code.trim(),type:"email"})
    if(error || data.user?.id!==s.id || data.user?.email?.trim().toLowerCase()!==email)
      throw new InvitationError("The verification code is invalid or expired. Request a new code and try again.")
    await recordInvitationEmailProof(s)
    return {success:true}
  }catch(e){return failure(e)}
}

export async function createWorkspaceInvitationLink(workspaceId:string):Promise<InvitationResult & {token?:string}> {
  try {
    const s=await actor()
    await consumeDistributedRateLimit(`invite-owner:${s.id}`,10,3600000)
    const result=await createInvitationLinkRecord(s,workspaceId,()=>consumeDistributedRateLimit(`invite-workspace:${workspaceId}`,30,3600000))
    afterDomainCommit(result.invitation.workspaceId)
    return {success:true,...result}
  }catch(e){return failure(e)}
}
export async function getInvitationLinkPreview(token:string):Promise<import("@/lib/data/invitations").InvitationPreview|null> {
  return readInvitationLinkPreview(token)
}
export async function acceptInvitationLink(token:string):Promise<InvitationResult & {workspaceId?:string}> {
  try {
    const s=await actor()
    await consumeDistributedRateLimit(`invite-response:${s.id}`,30,60000)
    const workspaceId=await acceptInvitationLinkRecord(s,token)
    afterDomainCommit(workspaceId)
    return {success:true,workspaceId}
  }catch(e){return failure(e)}
}
