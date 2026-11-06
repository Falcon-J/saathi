# Immediate signup and shareable invitations

Email and password signup can provide immediate access to a person's own workspace. The interface no longer offers Google sign-in. Workspace owners can create a private, expiring, single-use link to share directly. Anyone with that link can join, so share it only with the intended person and revoke it if exposed. Joining requires signing in and explicitly accepting the invitation.

Email-address invitations created by an earlier version must never be accepted solely because a newly registered account claims the same email. Owners can revoke an old invitation and create a shareable link instead. Existing memberships remain valid.

## Safe rollout order

1. Ensure users who previously relied on Google can set and use a password. The authenticated password setup page is `/reset-password`; do not collect passwords in support channels.
2. Apply the reviewed database migrations in order using the target environment's migration mechanism. Production has previously tracked migrations in `supabase_migrations.schema_migrations`, while local CI uses the Drizzle journal; do not fabricate or blindly reconcile a missing journal. Verify the migration state and permissions after application.
3. Deploy the application and verify the running revision. With email confirmation still enabled, verify that email-address invitations remain protected and that shareable links can only be redeemed once, before expiry, by a signed-in user who explicitly accepts. Test revocation and access by an unintended account without exposing tokens.
4. Only after the protected application is live, disable email confirmation in the target Auth project. Test a fresh signup and the complete link flow, including sign-in or signup followed by explicit acceptance. Confirm that existing members retain access.

Do not disable confirmation while an older application authorizes invitations based only on a claimed email address. Unverified signup can also allow someone to reserve another person's email address; account recovery and squatting controls remain separate concerns. Supabase's default mail service may restrict password recovery delivery to project team addresses, so public recovery still requires a suitable email provider even though invitation links do not.

## Verification boundaries

Local tests use disposable accounts and isolated services. Production migration state, Auth configuration, the deployed revision, and the hosted signup and link journeys each require their own evidence. Keep bearer links, provider credentials, account addresses and one-time codes out of logs and reports.

The application no longer loads the global Vercel Analytics client: a third-party script running before the join page clears its URL fragment could read a bearer link. Restore analytics only with an architecture that prevents scripts from observing invitation tokens.
