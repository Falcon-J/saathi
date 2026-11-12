import { z } from "zod"

export class AccessPolicyError extends Error {
  code: "forbidden" | "validation" | "conflict" | "unavailable"
  constructor(message: string, code: "forbidden" | "validation" | "conflict" | "unavailable" = "forbidden") { super(message); this.name = "AccessPolicyError"; this.code = code }
}
const uuid = z.string().uuid()
export function requireAccessIdentifier(id: string): void {
  if (!uuid.safeParse(id).success) throw new AccessPolicyError("Invalid canvas access identifier", "validation")
}
