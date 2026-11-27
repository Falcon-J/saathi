# Saathi domain context

Saathi is one workspace where people hand tasks to AI agents and approve what comes back.

## Words we use

- **Workspace**: the boundary for people, agents, tasks and activity. People are members (owner or member).
- **Agent**: any MCP client with a key for one workspace. Each agent has one active key. Saathi never runs agents; it coordinates them.
- **Task**: one outcome, numbered per workspace (`SAA-14`). It has a "Done when" line and an optional scope.
- **Link**: "B waits on A". A task is **Ready** when everything it waits on is done.
- **Claim**: an agent takes a ready task under a **lease**. Each claim raises the task's **fence**. A write with an old fence is refused.
- **Heartbeat**: an agent's check-in. It renews the lease and returns answers or a stop.
- **Silent**: no heartbeat for 3 minutes. **Lease ended**: the task goes back to Ready.
- **Proof**: what an agent submits: a summary, checks (pass, fail, skip), changes and scope.
- **Needs you**: a task in review or with an open question. Only a person can approve.

## Task states

`waiting → ready → working → review → done`, plus `question` (from working, back to working on an answer). Send back, release, stop, revoke and lease end all return a task to `ready`.

## Where truth lives

PostgreSQL (Supabase) owns all state. Each change is one SQL function and one transaction, and it writes an event that is broadcast over Supabase Realtime. Realtime only nudges clients to re-read.
