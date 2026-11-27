# Working on Saathi

Read `AGENTS.md` and `CONTEXT.md` first. The build plan is the spec: https://claude.ai/artifact/TsMhi96bDiLkBvn74QCjCv

## How to work (Karpathy rules)

1. **Think before coding.** Restate the goal, name the files you will touch, and say how you will prove it works.
2. **Simplicity first.** Write the least code that meets the acceptance list. No speculative options, layers or helpers.
3. **Surgical changes.** Touch only what the task needs. No drive-by refactors or reformatting.
4. **Goal-driven execution.** Write the failing test first, make it pass, then stop.

## Rules for this repo

- Every state change is one Postgres function. The UI and `/mcp` call the same functions through `supabase.rpc()`. Never write to tables from TypeScript.
- MCP stays generic: nothing in tool names, descriptions or behaviour may assume a specific agent or vendor.
- Match the design sheets in `plan/` (project files): their copy, states and tokens. Components use `app/tokens.css` names only.
- Keep validation, security and accessibility even when cutting code: labels, focus, error recovery, destructive-action consequences.
- Read the bundled Next.js docs in `node_modules/next/dist/docs/` before using a Next API.
- One PR is at most about 600 changed lines, excluding generated files and seed data.
- Before opening a PR: `npm run type-check && npm run lint && npm test && npm run build`, then a code review.
