# Walkthrough fixes

The user requested fixes to the observed production walkthrough, starting with History, agent connection recovery, Ask Saathi and canvas framing. Continue in the existing isolated review branch, retaining its disabled Vercel deployment. No merge, hosted preview or deployment before user review. Earlier instruction to proceed without more design questions applies.

Reuse the existing Next/React components and domain contracts. Alternatives considered: a separate management application would duplicate navigation and authorization; cosmetic copy alone would leave missing history context and recovery unresolved. Use targeted changes in the current UI.

History identifies the task and useful changed fields, preserves title case, and links available tasks. Persist task title and changed-field snapshots for new events; old events use current authorized task titles where available and honest fallbacks for deleted records. No historical changes are invented. Filter loaded history by task/member/action without interfering with pagination or recovery.

Connections provides a visible setup/reconnect path with the configured MCP endpoint, clear expired/revoked states and grouped exact permissions. Reconnection starts from the external client and requires fresh provider and workspace consent; never fabricate an authorization URL or silently expand access. Retained provider consent must be disconnected before reconnecting. Preserve existing local-first revocation and provider cleanup retry.

Ask Saathi has an accurately named panel and a stable Send button. Suggestions remain explicit requests using the existing capability contracts, drafts and confirmation recovery. Automatic focus/Fit View is bounded to 100%; manual zoom and saved user navigation remain available.

Also remove duplicate new-task entry while quick-add is open, hide terminal invitation clutter under history, simplify settings decoration and give management panels more room, make company setup naming honest, remove duplicate location entries, add contextual workspace creation to overview commands, and replace promotional/outdated help with practical current instructions. Preserve essential labels, permission limits, AI disclosure, validation, destructive consequences and draft recovery. No features or data are deleted. Workspace-creation planning remains an optional existing feature until a safe transition can be verified; its disclosure stays visible.

Verification: meaningful regression checks before behavior changes, full CI plus disposable real Auth/Postgres/Redis canvas, MCP and recovery acceptance, independent final review and actual desktop/mobile browser captures. Public authentication/marketing redesign is outside this signed-in walkthrough fix.
