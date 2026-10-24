# Saathi framework reuse and public Atlassian practices

Reviewed 2026-10-05. Research and recommendations only; no application changes, dependency installation, commit, or push. Current official documentation is evidence for supported patterns, not a certificate of production readiness or access to private Jira architecture.

## Verified repository baseline

`package.json` declares Next ^16.2.4, React 19.2.0, Tailwind ^4.1.9, Supabase JS ^2.115.0 / SSR ^0.12.6, Drizzle ^0.45.2, Postgres.js ^3.4.9, Zod 3.25.76, React Hook Form ^7.60.0, Radix primitives, and Zustand ^5.0.8. Upstash Redis and Vercel Analytics use `latest` ranges. These are manifest versions, not an installed-version or vulnerability audit.

`components.json` configures shadcn, CSS variables, and local `components/ui` composition. Task editing already uses the shared Radix Dialog wrapper. `components/ui/form.tsx` integrates React Hook Form, but the inspected task editor uses explicit draft state. `hooks/use-task-board.ts` implements paging, stale response suppression, concurrent-load guards and errors manually. `hooks/use-workspaces.ts` maintains another server-data lifecycle. Supabase `getUser()` is called in both Proxy and session resolution. Data access uses Postgres.js SQL; Drizzle defines schema. `lib/db/client.ts` keeps a reused client with `max: 1` and `prepare: false`. No Atlassian drag library is installed in the manifest.

## Ranked recommendations

| Rank | Decision | Evidence and intended benefit | Adoption cost and boundary |
| --- | --- | --- | --- |
| 1 | Keep one UI primitive system: current Radix/shadcn plus Saathi tokens | Radix supplies focus, keyboard and ARIA behavior; shadcn distributes editable component source. Reuse existing Dialog, Select, menus and buttons before adding custom equivalents. | Low. Local copied components still need maintenance and integration tests; labels and workflow accessibility remain our responsibility. |
| 2 | Pilot TanStack Query for Board server state | Official infinite-query and invalidation primitives overlap the custom lifecycle in `useTaskBoard`. A small pilot can measure whether it removes code without changing behavior. | Medium, one new runtime dependency. Do not migrate every hook at once or duplicate server state in Zustand. Preserve authorization-scoped keys, draft ownership, stable cursor scope, and truthful mutation outcomes. |
| 3 | Strengthen the existing Next data boundary | Next recommends a server-only DAL, authorization at each action, validated input and minimal DTOs. Existing domain SQL is valuable; framework boundaries should make ownership explicit. | Low to medium. Audit first; `server-only` markers require adapting direct Node test loading. A filename comment is not a bundler guard. No wholesale backend rewrite. |
| 4 | Use existing React Hook Form and Zod where forms justify them | Official shadcn form examples combine these tools for validation and errors. Full editing and invitation forms are candidates; simple title-plus-Add can remain native. | Medium for existing draft migrations. Preserve drafts during refresh, conflict handling, labels and server validation. Do not add a second form library. |
| 5 | Evaluate Supabase identity verification paths, not bespoke auth | Official SSR guidance differentiates JWT signature verification using `getClaims()` from a fresh remote user lookup using `getUser()`. | Medium, security-sensitive. Confirm signing mode and required account freshness. Do not replace fresh-user checks globally: disabled accounts, verified email and revocation semantics need evidence. Keep server workspace authorization. |
| 6 | Use Atlassian Pragmatic drag and drop if card movement is an approved requirement | Public core package is framework independent and separately Apache-2.0 licensed. Its accessibility guidance requires equivalent non-drag controls. | Medium. A library does not implement permissions, task transitions, persistence, version conflicts, mobile behavior or keyboard alternatives for us. Do not add dragging just to look like Jira. |
| 7 | Retain measured SQL and transport design, tune deployment deliberately | Current connection reuse and disabled prepared statements align with Supabase serverless transaction-pool guidance. Query batching addressed measured contention. | Low now. Choose direct/session/transaction connection mode from hosting constraints; increase client pool only with capacity and queue evidence. ORM adoption is not a correctness shortcut. |

## Documented practices and sources

### UI and accessibility

Radix follows WAI-ARIA patterns and handles common focus and keyboard mechanics. Consumers must still provide accessible names and appropriate composition. [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility).

shadcn distributes source intended for customization and composition; the application owns that source after adoption. Existing wrappers are useful leverage, but upstream fixes do not arrive simply by updating a single UI package. [shadcn introduction](https://ui.shadcn.com/docs).

Atlassian describes design tokens as a central store for design decisions. **Recommendation:** use this general approach with Saathi's own CSS variables and semantic surface, text, focus and status tokens; retain Overview → Board. This is our inference, not a recommendation to copy Atlassian values or branding. [Atlassian tokens](https://atlassian.design/foundations/tokens/).

### Atlassian reuse boundary

The general ADS website license limits its grant to software integrated with Atlassian products and identifies separate OSS terms as a possible source of additional rights. **Recommendation:** do not assume every ADS asset, icon, example, token package or Atlaskit component is reusable in a standalone Jira competitor. Inspect the exact package and version license before adoption. [ADS license](https://atlassian.design/license).

The Pragmatic drag and drop repository license and core package manifest expressly identify Apache-2.0. This is a concrete independently licensed candidate, rather than proof that all Atlassian materials have that license. [Repository license](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/LICENSE), [core manifest](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/core/package.json).

Its core does not automatically provide accessible movement controls. Offer visible move/status actions, announce outcomes, and restore useful focus alongside pointer dragging. Use our current UI primitives for these controls. [Library overview](https://atlassian.design/components/pragmatic-drag-and-drop/about), [accessibility guidance](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines).

### Client data and forms

TanStack Query supplies infinite paging and targeted invalidation. Its defaults include stale queries, automatic refetch behavior and retries; these need explicit tuning when SSE already signals changes. [Infinite queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries), [invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation), [defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

**Proposed pilot:** keys include authenticated user identity, workspace and normalized filters; keep aggregate and page queries separate; clear tenant data on logout/account switch; SSE invalidates affected workspace queries. Do not retry authorization errors or blindly retry non-idempotent mutations. Preserve create receipts, expected versions, draft state and unknown-outcome reconciliation. Adopt only if equivalent tests pass and substantial lifecycle code disappears.

React offers `useActionState` for state associated with actions. The existing installed React Hook Form and Zod combination is also supported by shadcn's official examples. Choose one mechanism per form according to complexity; neither removes server-side validation. [React useActionState](https://react.dev/reference/react/useActionState), [shadcn React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form).

### Server boundaries, authentication and SQL

Next treats exported actions as reachable endpoints and recommends a dedicated DAL with authorization and DTO filtering. **Recommendation:** inventory `lib/data` imports, mark server boundaries using supported tooling, and keep actions thin. Do not replace the application's workspace permissions with page-only guards. [Next data security](https://nextjs.org/docs/app/guides/data-security), [authentication](https://nextjs.org/docs/app/guides/authentication).

Supabase states that `getClaims()` validates token signatures, locally for asymmetric keys or through an auth call for symmetric keys; `getUser()` retrieves a current user record remotely. Cookies or `getSession()` alone are insufficient authorization evidence. **Recommendation:** separate identity validation from genuinely fresh account checks only after revocation and email-verification acceptance tests. Current `getUser()` use is safe evidence, not automatically a bug. [SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&queryGroups=framework).

Supabase's connection guidance recommends reused small client pools for serverless runtimes and disabling prepared statements for transaction pooling. It explicitly warns that transaction pooling loses session state. **Recommendation:** retain current SQL contracts and verify hosting/pool mode before changing pool size, connection settings or transport. [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres). Drizzle supports explicit transactions if adopting more ORM query APIs later, but converting tested SQL merely for uniformity has no demonstrated benefit. [Drizzle transactions](https://orm.drizzle.team/docs/transactions).

## Adoption acceptance gate

For every replacement, record the code removed, dependency and bundle cost, preserved contracts, supported license, upgrade owner and rollback. Re-run focused authorization, conflict, duplicate-create, cursor, account-switch and browser keyboard checks. Resolve the existing sustained load and hosted operational gates separately: borrowing primitives does not prove those NFRs.

Practical first slice: inventory duplicate UI/form/data mechanisms, remove confirmed unused dependencies, then compare a Board-only query pilot against the current tested hook. Do not install every recommended tool in one change. No universal "2026 standard" mandates a new framework or a Jira-sized architecture; current supported patterns and measured requirements determine the design.

Review coordination notes from the root repository audit: Activity currently has bounded reads without a next-page cursor, so Board paging does not close every paging requirement. CI executes type checking, lint, unit checks and build; automated database and browser acceptance remain separate gates. The latest diagnostic run measured profile resolution p95 around 2.229 seconds against about 255 milliseconds for the Supabase user lookup. Those measurements favor profiling/batching the application profile path before replacing safe identity validation. These are project evidence supplied by the concurrent audit, not claims about upstream frameworks.
