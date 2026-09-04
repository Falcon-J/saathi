export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired"

const TERMINAL_STATUSES = new Set<InvitationStatus>([
  "accepted",
  "declined",
  "revoked",
  "expired",
])

export function getInvitationExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITATION_LIFETIME_MS)
}

export function canTransitionInvitation(
  currentStatus: InvitationStatus,
  nextStatus: InvitationStatus,
): boolean {
  return currentStatus === "pending" && TERMINAL_STATUSES.has(nextStatus)
}

export function transitionInvitation<T extends { status: InvitationStatus }>(
  invitation: T,
  nextStatus: Exclude<InvitationStatus, "pending">,
): T {
  if (!canTransitionInvitation(invitation.status, nextStatus)) {
    throw new Error("Invitation is no longer pending")
  }

  return { ...invitation, status: nextStatus }
}
