# Saathi

One workspace for people and AI agents. Agents claim ready tasks over MCP, work under a lease, and hand back proof. Nothing counts as done until a person approves it.

**Status:** being rebuilt from the accepted designs. See the build plan: https://claude.ai/artifact/TsMhi96bDiLkBvn74QCjCv

## Stack

Next.js 16 on Vercel, Supabase (Postgres, Auth, Realtime), the Model Context Protocol, Tailwind 4 and Geist.

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev
```

Checks: `npm run type-check`, `npm run lint`, `npm test`, `npm run build`.
