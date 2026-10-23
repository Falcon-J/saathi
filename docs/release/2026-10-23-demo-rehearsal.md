# Demo rehearsal — 2026-10-23

Status: preparation complete; hosted rehearsal pending Vercel login and preview AI configuration. This document is not hosted acceptance evidence.

## Demo environment

- Use the Saathi feature preview with the latest reviewed application code and the separate `preview-saathi` database. Production remains separate.
- Confirm deployed SHA, `/api/health/ready` HTTP 200, enabled AI and working provider configuration before presenting.
- Use two owned demo accounts in separate browser contexts. Do not share sessions or present real customer data.
- Vercel CLI currently reports `not_authorized` for its saved login. The owner must complete `npx vercel@59.19.0 login` before preview access/configuration can continue.

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

Current results: `2026-10-21-completion-execution.md`. Hosted database recovery: `2026-10-23-hosted-recovery.md`.
