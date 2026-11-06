# Immediate signup and shareable invitations

Goal: Allow email/password signup without verification, remove Google from the UI, and let an owner share a private invitation link that an existing or new user can explicitly accept.

- [ ] Preserve existing memberships and fail closed for legacy email-based invitations; automatic email confirmation does not prove mailbox ownership.
- [ ] Generate high-entropy single-use bearer links, store only token hashes, enforce owner authorization, expiry and revocation, and make redemption atomic.
- [ ] Keep tokens out of server URLs, logs and analytics. Preserve the token across same-tab signup/sign-in and require explicit acceptance.
- [ ] Test signup, existing-user and new-user redemption, concurrent use, expiration, revocation, legacy impersonation and cleanup with isolated services.
- [ ] Run unit tests, lint, type checking, build and relevant browser checks; review migration and production rollout ordering.
- [ ] Prepare and merge the PR after checks pass; apply the protective migration and deploy before disabling email confirmation.
