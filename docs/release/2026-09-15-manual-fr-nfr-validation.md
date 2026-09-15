# Saathi v1 manual FR/NFR validation

**Status:** Ready to execute against the clean beta integration environment
**Date:** 2026-09-15
**Related map:** `docs/architecture/saathi-v1-project-map.md`

## Purpose

This runbook validates the implemented product contract before UI/UX refinement or external deployment cleanup. It is intentionally manual-first. Automated tests remain regression protection; they are not a substitute for real authentication, PostgreSQL, Redis, email, provider, or two-user evidence.

## Environment gate

Run this checklist only when the environment has:

- one disposable Supabase Auth/PostgreSQL project;
- real Redis credentials;
- a test email provider or inbox;
- a beta app origin with matching server configuration;
- optional AI credentials, if AI validation is being executed.

Do not use production data or production credentials for this run. Record the deployment and configuration reference before changing any external setting.

## Evidence format

For each case, record:

```text
Case:
Requirement:
Actor(s):
Expected:
Observed:
Result: PASS / FAIL / BLOCKED
Evidence:
Follow-up commit or issue:
```

## Validation sequence

### A. Identity and workspace entry

- Register a new user and confirm the email.
- Log in, refresh, log out, and log back in.
- Request a password reset and complete it through the email link.
- Verify invalid credentials and expired/invalid links show recoverable errors.
- Create a workspace, reload it, and verify the zero-workspace state for a new account.

### B. Core task execution

- Create, edit, assign, complete, reopen, and delete a task.
- Verify an assignee can complete a task but cannot perform owner/editor-only changes.
- Exercise filtering, CSV import, empty state, loading state, and error recovery.
- Verify a stale edit returns a conflict and does not overwrite the newer task.

### C. Date and timezone correctness

- Create date-only tasks in the current year and confirm the displayed year is current.
- Test a workspace in at least two timezones, including one where the calendar date differs from UTC.
- Verify Today, Next, overdue, and completed grouping.
- Create a precise deadline and confirm the displayed local date/time.
- Inspect existing seeded data for invalid historical dates before accepting the UI result.

### D. Membership, ownership, and invitations

- Invite a second user and verify delivery/status tracking.
- Accept as the intended user; reject a wrong recipient.
- Test duplicate acceptance, expiry, revoke, decline, and removed-member access.
- Transfer ownership, then verify old-owner and new-owner permissions.
- Archive a workspace and verify it leaves active selection and rejects new mutations.
- Delete a workspace only in disposable test data and verify the expected retention/deletion behavior.

### E. Two-user collaboration and history

- Open the same workspace in two browsers with different users.
- Create/edit/complete a task in browser A and verify browser B refreshes or reconciles it.
- Add a comment and verify it is visible to the other member.
- Open Activity/History and verify server-side mutations appear with the correct actor and time.
- Perform concurrent edits and verify the stale actor receives a conflict rather than silent loss.

### F. Realtime recovery and operations

- Disconnect one browser, perform a mutation from the other, reconnect, and verify resync from PostgreSQL.
- Verify missed events do not cause data loss.
- Check liveness with dependencies unavailable and readiness with dependencies available/unavailable.
- Run the outbox worker and verify delivered, deferred, failed, and retryable outcomes.
- Verify email retry and terminal provider failure are visible without exposing secrets.

### G. AI boundary

- Run the advisor with AI enabled and verify output is limited to the authorized workspace projection.
- Confirm AI cannot create, edit, complete, delete, authorize, or bypass membership without an explicit reviewed deterministic action.
- Confirm reviewed drafts use normal task validation and persistence.
- Test disabled AI, provider timeout, invalid provider output, rate limit, and missing credentials.
- Verify logs and operational metadata do not contain raw prompts, responses, tokens, or secrets.

### H. Accessibility and recovery review

- Navigate the core flow using keyboard only.
- Verify focus is visible and dialogs can be dismissed without a mouse.
- Review mobile and desktop layouts.
- Verify loading, empty, permission, conflict, offline, and error states are understandable and recoverable.

## Acceptance gate

The beta is ready for deployment cleanup only when:

1. A through G have no unresolved correctness or authorization failures.
2. All blocked cases have an explicitly documented external dependency and owner.
3. Database migration, outbox, email, realtime, and readiness evidence is captured.
4. No test used production data or credentials.
5. Any UI-only mismatch is separated from an FR/NFR failure.

UI/UX refinement starts after this gate, not before it.
