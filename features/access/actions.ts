"use server"

import { getVerifiedActor } from "../../lib/auth-simple"
import { afterDomainCommit } from "../../lib/post-commit"
import { consumeDistributedRateLimit, RateLimitExceeded } from "../../lib/rate-limit"
import { getRateLimits } from "../../lib/env"
import { AccessPolicyError, getAuthorizedCanvasView, createCompany, createCanvasContainer, attachWorkspace,
  addOrganizationMember, createCanvasGroup, setCanvasGroupMembership, grantCanvasAccess, revokeCanvasGrant,
  setCanvasResourcePolicy, createCanvasReference,
  getCanvasAccessDetails, getWorkspaceAccess, filterVisibleAccessMutationResult, type WorkspaceAccess, type CanvasAccessDetails, type AccessMutationResult, type AuthorizedCanvasView } from "./service"

export type CanvasAccessCommand =
  | { operation: "company.create"; input: Parameters<typeof createCompany>[1] }
  | { operation: "container.create"; input: Parameters<typeof createCanvasContainer>[1] }
  | { operation: "workspace.attach"; input: Parameters<typeof attachWorkspace>[1] }
  | { operation: "member.add"; input: Parameters<typeof addOrganizationMember>[1] }
  | { operation: "group.create"; input: Parameters<typeof createCanvasGroup>[1] }
  | { operation: "group.member"; input: Parameters<typeof setCanvasGroupMembership>[1] }
  | { operation: "access.grant"; input: Parameters<typeof grantCanvasAccess>[1] }
  | { operation: "access.revoke"; input: Parameters<typeof revokeCanvasGrant>[1] }
  | { operation: "policy.set"; input: Parameters<typeof setCanvasResourcePolicy>[1] }
  | { operation: "reference.create"; input: Parameters<typeof createCanvasReference>[1] }
type Failure = { success: false; error: string; code: string; unknownOutcome?: boolean; retryAfterSeconds?: number }

export async function getCanvasResources(): Promise<({ success: true } & AuthorizedCanvasView) | Failure> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) return { success: false, error: "Authentication required", code: "unauthenticated" }
    return { success: true, ...await getAuthorizedCanvasView(actor.id) }
  } catch (error) {
    return { success: false, error: error instanceof AccessPolicyError ? error.message : "Company canvas is unavailable. Try again.", code: error instanceof AccessPolicyError ? error.code : "unavailable" }
  }
}

export async function getCanvasResourceAccess(resourceId: string): Promise<{ success: true; details: CanvasAccessDetails } | Failure> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) return { success: false, error: "Authentication required", code: "unauthenticated" }
    return { success: true, details: await getCanvasAccessDetails(actor.id, resourceId) }
  } catch (error) {
    return { success: false, error: error instanceof AccessPolicyError ? error.message : "Access settings are unavailable. Try again.", code: error instanceof AccessPolicyError ? error.code : "unavailable" }
  }
}

export async function getCanvasWorkspaceAccess(workspaceId: string): Promise<{ success: true; access: WorkspaceAccess } | Failure> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) return { success: false, error: "Authentication required", code: "unauthenticated" }
    return { success: true, access: await getWorkspaceAccess(actor.id, workspaceId) }
  } catch (error) {
    return { success: false, error: error instanceof AccessPolicyError ? error.message : "Workspace access is unavailable. Try again.", code: error instanceof AccessPolicyError ? error.code : "unavailable" }
  }
}

export async function runCanvasAccessCommand(command: CanvasAccessCommand): Promise<{ success: true; result: AccessMutationResult } | Failure> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) return { success: false, error: "Authentication required", code: "unauthenticated" }
    const limit = getRateLimits().tasks
    await consumeDistributedRateLimit(`tasks:${actor.id}`, limit.maxRequests, limit.windowMs)
    let result: AccessMutationResult
    switch (command?.operation) {
      case "company.create": result = await createCompany(actor.id, command.input); break
      case "container.create": result = await createCanvasContainer(actor.id, command.input); break
      case "workspace.attach": result = await attachWorkspace(actor.id, command.input); break
      case "member.add": result = await addOrganizationMember(actor.id, command.input); break
      case "group.create": result = await createCanvasGroup(actor.id, command.input); break
      case "group.member": result = await setCanvasGroupMembership(actor.id, command.input); break
      case "access.grant": result = await grantCanvasAccess(actor.id, command.input); break
      case "access.revoke": result = await revokeCanvasGrant(actor.id, command.input); break
      case "policy.set": result = await setCanvasResourcePolicy(actor.id, command.input); break
      case "reference.create": result = await createCanvasReference(actor.id, command.input); break
      default: return { success: false, error: "Invalid canvas access command", code: "validation" }
    }
    for (const workspaceId of result.affectedWorkspaceIds) afterDomainCommit(workspaceId)
    try { return { success: true, result: await filterVisibleAccessMutationResult(actor.id, result) } }
    catch { return { success: true, result: { ...result, affectedWorkspaceIds: [] } } }
  } catch (error) {
    if (error instanceof RateLimitExceeded) return { success: false, error: error.message, code: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }
    if (error instanceof AccessPolicyError) return { success: false, error: error.message, code: error.code }
    return { success: false, error: "Unable to confirm the access change. Retry the same command to recover its result.", code: "unavailable", unknownOutcome: true }
  }
}
