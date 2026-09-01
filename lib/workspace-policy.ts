import { normalizeEmail } from "./identity.ts"

export type WorkspaceAccessAuthorization =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; message: string }

export function authorizeWorkspaceMember(
  workspaceData: unknown,
  userEmail: string,
): WorkspaceAccessAuthorization {
  if (!workspaceData || typeof workspaceData !== "object") {
    return { allowed: false, status: 404, message: "Workspace not found" }
  }

  const members = (workspaceData as { members?: unknown }).members
  const isMember = Array.isArray(members) && members.some((member) => (
    member !== null
    && typeof member === "object"
    && typeof (member as { email?: unknown }).email === "string"
    && normalizeEmail((member as { email: string }).email) === normalizeEmail(userEmail)
  ))

  return isMember
    ? { allowed: true }
    : { allowed: false, status: 403, message: "Forbidden" }
}
