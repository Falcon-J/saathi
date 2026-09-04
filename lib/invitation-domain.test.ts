import test from "node:test"
import assert from "node:assert/strict"
import {
  canTransitionInvitation,
  getInvitationExpiry,
  transitionInvitation,
} from "./invitation-domain.ts"

test("invitation expiry is seven days after creation", () => {
  const createdAt = new Date("2026-09-04T00:00:00.000Z")

  assert.equal(
    getInvitationExpiry(createdAt).toISOString(),
    "2026-09-11T00:00:00.000Z",
  )
})

test("only pending invitations can transition to a terminal state", () => {
  assert.equal(canTransitionInvitation("pending", "accepted"), true)
  assert.equal(canTransitionInvitation("pending", "declined"), true)
  assert.equal(canTransitionInvitation("pending", "revoked"), true)
  assert.equal(canTransitionInvitation("accepted", "declined"), false)
  assert.equal(canTransitionInvitation("declined", "accepted"), false)
})

test("transitionInvitation rejects terminal-state overwrite", () => {
  assert.throws(
    () => transitionInvitation({ status: "accepted" }, "declined"),
    /Invitation is no longer pending/,
  )
})
