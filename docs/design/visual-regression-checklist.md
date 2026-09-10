# Saathi visual regression checklist

Review at desktop (1440px), laptop (1280px), tablet (768px), and mobile (390px).

- [ ] Landing: headline wraps as reference; hero cards stay inside the wash; CTA hierarchy and benefit tiles align.
- [ ] Sign in/register: split form and illustration remain balanced; labels, errors, and recovery links remain visible.
- [ ] Forgot/reset: recovery copy, illustration, status panel, and actions remain centered and recoverable.
- [ ] Dashboard: sidebar, global search, greeting, quick actions, tasks, workspaces, and activity cards retain hierarchy.
- [ ] Workspace board: columns, filters, task cards, labels, dates, avatars, and empty/loading states remain readable.
- [ ] Task detail/edit: metadata, subtasks, attachments, and assistant affordances do not obscure primary actions.
- [ ] Help center: search, topic cards, support CTA, and navigation match the reference density.
- [ ] Workspace/team/settings/invitation: forms, role/status rows, owner actions, and invitation actions remain clear.
- [ ] Insights: connection state and usage metrics show only authoritative values and have explicit failure states.
- [ ] Honest states: unavailable, expired, and invalid-link screens explain what happened and offer safe recovery.

Required automated gate:

```text
npm test
npm run lint
npm run type-check
npm run build
git diff --check
```
