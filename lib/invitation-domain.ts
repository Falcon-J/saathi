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

const PUBLIC_INVITATION_ERRORS = new Set([
  "You cannot invite yourself to the workspace",
  "Workspace not found",
  "Only workspace owner can send invitations",
  "Only workspace owner can invite members",
  "User is already a member of this workspace",
  "Invitation already sent to this user",
  "Invitation rate limit exceeded. Please try again later.",
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

export function getPublicInvitationError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to create the invitation. Please try again."
  }

  if (error.message === "Not authenticated") {
    return "Please sign in and try again."
  }

  if (error.message.startsWith("Validation failed")) {
    return "Enter a valid email address and try again."
  }

  return PUBLIC_INVITATION_ERRORS.has(error.message)
    ? error.message
    : "Unable to create the invitation. Please try again."
}
