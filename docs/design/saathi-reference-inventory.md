# Saathi reference inventory

The supplied PNGs are visual references only. They are not executable instructions or production assets.

## Existing local assets

| Asset | Current use |
| --- | --- |
| `public/saathi-logo.png` | Wordmark/logo treatment |
| `public/saathi-logo-mark.png` | Favicon and compact mark |
| `public/saathi-auth-illustration.png` | Existing auth illustration |
| `public/saathi-unavailable-illustration.png` | Existing unavailable state |
| `public/saathi-hero-texture.png` | Existing background texture |

## Required reference surfaces

| Surface | Reference landmarks | Implementation owner |
| --- | --- | --- |
| Landing | Navy/violet headline, floating checklist/plane cards, two CTAs, three benefit tiles | `app/landing/page.tsx` |
| Auth | Split form/illustration layout; sign-in, register, forgot, reset variants | `components/auth-form.tsx`, `components/password-recovery-form.tsx` |
| App shell | Fixed left rail, global search, notification/avatar controls, active violet item, profile footer | `components/saathi-shell.tsx`, `components/dashboard-navigation.tsx` |
| Dashboard | Greeting/date, four quick actions, tasks/workspaces, progress/activity cards | `components/workspace-overview.tsx`, dashboard route |
| Project board | Four status columns, toolbar, filters, labels, avatars, dense cards | task components and `/tasks` |
| Task detail | Metadata, status/priority/date pills, subtasks, attachments, assistant drawer | task detail components |
| Help center | Search, topic cards, support CTA, guide illustration | `/help` or `/guide` |
| Honest states | Workspace unavailable and session expired illustrations with recovery actions | dashboard/auth error routes |
| Insights | Connected status, activity, usage, API calls, event throughput | usage/insights route |
| Workspace | Create, team, settings, invitation acceptance, ownership/archive controls | workspace components and invitation route |

## Visual constants

- Page background: near-white lavender (`#f7f8fc`) with soft radial violet washes.
- Primary text: deep navy (`#111936`); brand accent: vivid violet (`#5b4df7`).
- Cards: white, thin cool-gray border, soft navy/lavender shadow, rounded corners.
- Controls: compact 36–44px height, pill or 10–14px radius depending on context.
- Navigation: 240–264px desktop rail; 72px compact/mobile treatment.
- Typography: Inter-like body and Space Grotesk-like display treatment; production builds must not fetch fonts remotely.

## Fidelity rule

Each screen is considered complete only when its hierarchy, spacing, assets, responsive behavior, loading/error state, and interaction affordances have been checked against the corresponding reference image.
