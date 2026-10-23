# Demo rehearsal — 2026-10-23

Status updated October 24: hosted collaboration and live AI rehearsal passed on `09ce3185e76901ce65a73e73b9e0306acdc9d338`. Email signup callback acceptance and performance acceptance remain separate gates.

## Demo environment

- Use the Saathi feature preview with the latest reviewed application code and the separate `preview-saathi` database. Production remains separate.
- Confirm deployed SHA, `/api/health/ready` HTTP 200, enabled AI and working provider configuration before presenting.
- Use two owned demo accounts with independent sessions. Do not share sessions or present real customer data.
- Vercel CLI authentication is restored. Stable preview: `https://saathi-git-feature-s-62bd50-omkarjawalikar04-gmailcoms-projects.vercel.app`.

## Recorded hosted rehearsal

- Owner used normal Google sign-in in Chrome. The independent member used normal application password sign-in and invitation acceptance through the deployed Server Actions, with its own native HTTP cookiejar. This proves independent application sessions; it is not a second-browser visual check.
- Created the owned `Pilot launch · release check` workspace and three tasks. Assigned `Review onboarding flow` to the member, who completed it. Owner saw the completion without refresh, then again after reload: two open, one done.
- Live AI correctly summarized the completed task and named the two remaining tasks without inventing deadlines. A prior temporal recheck also correctly described a saved September deadline as overdue in October.
- Drafted `Confirm pilot feedback`, medium priority, no deadline. Scoped read-only database verification before approval showed three tasks and zero tasks with the proposed title. One UI confirmation created one task. Reload and scoped verification showed four tasks, exactly one matching title, and four workspace command receipts in total.
- The retained owned fixture is presentation data, not customer data. Local screenshots and sanitized session evidence remain in ignored `.local-test/completion-20261021/`; no credentials or verification links belong in tracked evidence.
- Fresh account email verification reached the stable preview callback, but the delayed signup callback failed. The confirmed account subsequently signed in normally; a fresh recovery callback using its original PKCE cookiejar reached `/reset-password` with the correct authenticated identity. A password change was not performed.
- One prompt fresh signup attempt then hit Supabase HTTP 429 `over_email_send_rate_limit`, confirmed through scoped safe Auth log fields. No confirmation email arrived and no retries were made. Automatic signup acceptance remains open; successful recovery does not prove that separate journey.
- Invitation acceptance works through the copied invite link. Resend rejects delivery to arbitrary recipients while `EMAIL_FROM` uses `onboarding@resend.dev`: a verified sender domain is still required.
- CI for the rehearsed head passed type checking, lint, unit/database/browser checks and production build: https://github.com/Falcon-J/saathi/actions/runs/39997969370.

## Five-minute story

| Step | Action | Evidence to show |
| --- | --- | --- |
| 1 | Sign in as the owner. Create workspace `Pilot launch` with goal `Launch a small customer pilot with clear ownership and follow-through`. | Workspace exists after reload; its Overview and Board share the same context. |
| 2 | Add `Prepare pilot checklist`, `Review onboarding flow`, and `Publish pilot notes`. Assign the review to the member. | Named owner/assignee and saved task state. |
| 3 | Open a separate browser context as the member and complete `Review onboarding flow`. | Owner sees the update through realtime and still sees it after reload. |
| 4 | Open `Ask Saathi`, select `Summarize workspace`, and ask for completed work and remaining work using only supplied facts. | Summary agrees with the Board; no unsupported business outcomes are claimed. |
| 5 | Select `Draft a task`: `Draft a task titled Confirm pilot feedback, medium priority, no deadline. Do not save it.` | Draft is reviewable; task count has not changed. Click `Create task` once, then reload and show exactly one new task. |
| 6 | Open the recorded metrics report. Scrub the timeline, play/pause and show the provenance, latency, errors and delivery counts. | Real captured samples, visible run mode and verdict; failed targets remain visible. |

## Rehearsal acceptance

- Fresh owner/member sign-in works at the chosen URL.
- Workspace/task persistence and cross-user completion work without sharing cookies.
- Live AI summary is grounded; draft generation does not write; confirmation saves once.
- Record run ID, deployed SHA, provider/model, task and operation counts, timing outcomes and cleanup status without credentials or account details.
- Keep owned presentation fixtures only when needed for the scheduled demo; delete them using the verified ownership-scoped cleanup after use.
- Verify keyboard operation and the core flow at desktop and 360px before calling the hosted rehearsal passed.

## Metrics replay

From `implementation/`, generate a report for an exact existing run:

```powershell
npm run report:nfr:local -- .local-test/nfr-933eafba-70de-4176-a866-534c3083ffad
npm run report:nfr:local -- .local-test/nfr-63088c5a-8b69-4098-9b6a-3d1e752f9000
```

Open the generated `report.html` in each run directory. Reports work offline and display captured timing records with playback controls.

The 900-second run delivered all 1,000 writes and 25,000 notifications without request errors or duplicates, but failed duration and latency acceptance. It preceded the bounded Redis history fix. The subsequent short diagnostic after that fix delivered all 100 writes/2,500 notifications and passed delivery p95, but still failed the read target. Present these exact scopes; neither result proves hosted capacity or a passed sustained benchmark.

Current results: `2026-10-21-completion-execution.md` and [October 24 performance follow-up](2026-10-24-performance-follow-up.md). Hosted database recovery: `2026-10-23-hosted-recovery.md`.
