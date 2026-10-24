# Product review and design direction

Date: 2026-10-23. Scope: read-only product review, current preview authentication, production visual inspection, and current branch source. No application fixes or production data changes were made.

## Evidence boundaries

- Production inspected at `https://saathi-ten.vercel.app/dashboard`: older navigation, Assistant/Workspace switch, large add-task block, repeated counts and task metadata.
- Current preview inspected at `https://saathi-lh3o2nsdq-omkarjawalikar04-gmailcoms-projects.vercel.app`: landing and login rendered. Authenticated preview screens were not reached.
- Current branch already removes the mode switch, compacts the header, and opens Ask Saathi in a contextual dialog. Do not propose these as new work.
- Preview Google authentication was started with the user's explicit authorization. It returned to the production root with an authorization code, rather than a callback route. No authorization code or credentials are retained in this report.
- Public preview Auth settings: Google enabled, email enabled, registration enabled, email confirmation required.
- A dedicated preview review account was registered through the normal Auth API. The user opened the verification email and reported a redirect to the production root. A subsequent normal password sign-in against preview confirmed the email is verified. Its password is confined to ignored local scratch storage.
- The user pasted the resulting session-bearing URL. Review-account sessions were globally signed out through the normal preview Auth API; refresh sessions were revoked. Already issued access tokens can remain valid until expiry. No session token is retained in this report.

## Findings, in priority order

### 1. Google login does not complete on the preview — browser reproduced

Starting from the preview login returned to `https://saathi-ten.vercel.app/?code=[redacted]`. The app exchanges codes only in `app/auth/callback/route.ts`; the landing route cannot complete this flow.

The preview's configured `NEXT_PUBLIC_APP_URL` is the branch alias, while production uses the production origin. Google is enabled. Supabase redirect allowlist or Site URL fallback is the leading explanation, but the dashboard Auth configuration was not inspected, so that exact cause is not yet confirmed.

Next proof: inspect Site URL and allowed redirects on the preview Supabase project. Use a stable preview origin consistently for login, PKCE cookies and `/auth/callback`. Check production separately. Do not broaden redirects unnecessarily, disable confirmation, or reuse an authorization code on another origin.

Acceptance: Google sign in begins and finishes on the intended environment, exchanges the code once, reaches an authenticated dashboard, and retains a safe invitation destination. Repeat from a fresh session. Check registration and password recovery redirects too.

Email verification now has matching user-reported evidence: preview verification opened production with session material in the URL fragment. The email was verified, but the return journey was wrong. The signup probe used the SDK's default implicit flow; its token fragment is not proof that the application's SSR signup uses that same flow. Treat the wrong destination as confirmed and inspect the real app signup separately.

Desired verification UX: submit registration, show a clear Check your email state, open the same environment's callback, then reach the authenticated dashboard. If the callback cannot finish, show Verification complete with Sign in, or a recoverable expired-link state as appropriate. Preserve a safe invitation destination and never leave session material visible in a shareable URL after processing.

### 2. A previous AI proposal stays actionable during a new request — source verified

`components/workspace-advisor.tsx:42` leaves the previous response visible when starting a new request. The old Create task control at line 137 is disabled only while creating, not while generating the next answer. A failed request also leaves the old proposal next to the new error.

Recommendation: make the current proposal/request relationship explicit. Disable previous proposal confirmation during generation; clear or clearly mark the old response for a replacement request. Preserve the idempotency key when retrying an uncertain confirmation outcome.

Acceptance: generate proposal A, request B, then fail B. A must never appear to be B or become an ambiguous confirmation action. Retry of an uncertain create still recovers exactly one task.

### 3. Undated work is counted as due today — browser and source verified

The production Overview showed two undated tasks under Due today. Current `lib/task-overview.ts:50` also places undated tasks outside the next bucket into today, and `components/workspace-overview.tsx:101` labels the whole count due today.

Recommendation: preserve existing task grouping unless a separate scheduling decision is approved; label that count Today rather than asserting a deadline. Do not manufacture dates.

### 4. Global shortcuts intercept text editing — source verified, impact not browser reproduced

`app/dashboard/page.tsx:270` handles Ctrl/Command K and B without checking editable targets. Navigation can interrupt a quick-add interaction; native editing shortcuts can be intercepted.

Recommendation: respect editable targets and active dialogs. Verify quick-add and advisor text survive normal keyboard use. This finding does not establish that all drafts are lost.

### 5. Activity and Settings lack persistent navigation context — source verified

`components/dashboard-navigation.tsx:7` defines Overview, Board and Team. Activity and Settings open from the workspace menu; neither has a selected rail item.

Recommendation: show the active contextual destination in the workspace heading/menu trigger, or select a clearly defined parent destination. Do not add navigation items merely to fill the rail.

### 6. Sustained performance acceptance remains open — existing evidence inspected

The saved execution ledger records the post-fix short diagnostic at read p95 1,077 ms against a 750 ms target. Delivery p95 was 1,140 ms; all 2,500 deliveries arrived with no recorded errors or duplicates. This is a short local diagnostic, not hosted or sustained capacity proof. No benchmark was rerun for this review.

## Recommended design direction: a calm working room

Keep the established warm paper background, charcoal text, teal action color, existing logo, typography and components. Distinctiveness should come from consistent hierarchy and a clear working rhythm.

| Surface | Decision | Boundary |
| --- | --- | --- |
| Workspace header | Put the workspace name first, its real goal beneath, then the target date and connection state. | Avoid repeated workspace names and decorative greeting copy. Preserve real goal content. |
| Overview | Make overdue work and the next useful action easy to scan. Use compact rows with deadline and owner where relevant. | No invented AI urgency or productivity score. |
| Board | Keep title and status primary; show owner/deadline next; move created date and estimates into details when they are not needed for scanning. | Keep status/assignment actions accessible, including touch and keyboard. |
| Task details | One consistent editing surface with comments/history in context. | Preserve conflict recovery, permissions and unsaved input. |
| Ask Saathi | One workspace tool with grounded answers and a distinct reviewable proposal. | Preserve review before write, exact-once recovery and uncertainty handling. |
| Navigation | Overview, Board and Team remain stable; contextual screens visibly identify themselves. | No separate Assistant mode or competing shell. Already implemented in current branch. |
| Visual rhythm | Prefer whitespace and dividers within one surface over nested cards. Use teal for the primary action and meaningful selection. | Keep accessible text labels; never rely on color alone. |
| Landing | Let an actual product view demonstrate the promise. The current illustration can support it. | No invented customer proof, growth numbers or performance claims. |
| Demo evidence | Present recorded metrics with run scope, environment and pass/fail verdict visible. | Engineering latency is not proof of customer value or revenue. |

## Smallest implementation sequence

1. **Repair the entry path:** confirm Auth redirect configuration, complete preview account verification, reproduce Google login and recovery from fresh sessions.
2. **Correct misleading interaction states:** AI proposal/request separation, truthful Today label, editable-target shortcut behavior and contextual navigation state. Focused regression checks at these seams.
3. **Apply one visual pass to the active shell:** workspace heading, overview rows, board density and advisor hierarchy. Review desktop and 360px, keyboard/focus, loading, empty, error and permission states. Reuse existing tokens and components.
4. **Rehearse the product story:** owner creates work, member updates it, owner sees persistence, AI summarizes facts, draft stays unsaved until confirmation, recorded metrics replay retains failed gates.

## Implementation follow-up

The approved implementation pass now:

- Corrected preview Supabase Site URL to the stable branch origin and added that origin's `/auth/callback` and `/auth/callback?next=**` redirect entries. Browser inspection confirmed the previous Site URL was production and no preview callback existed. The user explicitly approved these preview-only changes. Production Auth configuration was not changed.
- Verified Google sign in reaches the authenticated stable preview dashboard. The Google account chooser and code exchange completed through the normal browser flow. This proves the repaired Google journey on the existing preview revision; latest application changes still need their own deployment check.
- Added canonical login/register/recovery entry before PKCE state is issued. Callback codes and sessions are never transferred between origins. API and action authorization remain unchanged.
- Preserved safe return destinations through login/register and callback error recovery; removed the misleading Recovery link label and redundant login helper.
- Prevented stale AI proposal confirmation during replacement generation. An uncertain creation retains its proposal and command key, blocking replacement/dismissal until retry resolves it.
- Kept global shortcuts out of editing controls, active dialogs and IME composition.
- Made the saved goal lead Overview, removed duplicate summary counts and the false due-today label, and reduced Board nesting while retaining controls and accessible names.
- Made the Workspace menu identify Activity or Settings when those contextual views are active; removed the nested advisor heading and promotional helper text inside Ask Saathi.

Validation: full suite initially 366 passed, zero failed, two optional skips; final focused checks cover the later uncertain-confirmation repair. TypeScript and scoped ESLint passed. Local Turbopack hit a process startup failure; webpack initially hit sandbox EPERM, then completed successfully with required filesystem access. These are build-environment observations, not passed Turbopack proof.

Actual app email signup/recovery, desktop/mobile visual acceptance on the new deployment, hosted collaboration rehearsal and sustained capacity remain open until separately recorded. No revenue or product-market-fit conclusion follows from this work.

### Hosted and CI follow-up

- Google sign in and authenticated reload succeeded on the stable preview origin. Immutable deployment login returned HTTP 307 to that origin. Deployed readiness returned HTTP 200.
- Desktop and 360px Board screens were inspected; at 360px document width was 345px, with no horizontal overflow. Removed the remaining nested composer/filter surfaces and excess Board Card spacing. Mobile review also led to giving the workspace selector a full row.
- The live hosted summary responded, but incorrectly called a September deadline imminent in October. The authorized AI projection omitted workspace timezone and the request omitted current time. Added server-derived currentTime/currentDate and timezone, with explicit overdue/completed/undated instructions. Deterministic tests cover the reported date and local-day rollover; live prose needs rechecking after deployment and remains probabilistic.
- CI on `a51528c` passed type checking, lint, unit tests and database checks, then timed out starting the browser test server. Reproduction found Next.js normalizes loopback URL hostnames, causing canonical login to redirect to itself. Comparison now uses the incoming Host plus protocol against the configured origin; redirect destinations remain configuration-owned. No callback codes or sessions cross origins. Added regression coverage and a real local HTTP probe.
- Final combined unit suite: 372 tests, 370 passed, zero failed, two optional skips. The final origin/proxy checks passed 24 tests. Existing desktop/mobile browser suite passed all 14 tests after the loop repair, including keyboard, protected-route redirects, overflow and serious/critical accessibility checks. Hosted AI temporal recheck and remote CI completion remain separate evidence gates.
