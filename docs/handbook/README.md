# Saathi engineering handbook

**Source snapshot: 2026-10-04. Audience: an engineer learning, maintaining, or reviewing Saathi.**

This is a guided explanation of the implemented system, not a declaration that every release requirement is complete. One reading gives you the map; the worked traces and exercises let you prove that you understand it. Read the numbered chapters in order, then explain the capstone without looking at the answers.

## The reading path

| Chapter | Question you should be able to answer afterward |
| --- | --- |
| [1. Architecture and data](01-architecture-and-data.md) | Who owns each fact, and which invariants survive application bugs? |
| [2. Commands and correctness](02-commands-and-correctness.md) | What commits together, what prevents stale writes, and what makes retry safe? |
| [3. Realtime and client state](03-realtime-and-client-state.md) | How do disconnected or racing clients converge without trusting notifications? |
| [4. Contracts and AI boundaries](04-contracts-and-ai.md) | Which interface should I call, and where is untrusted input rejected? |
| [5. Requirements, evidence, and operations](05-requirements-and-operations.md) | What has evidence, what remains a gate, and how do I diagnose failure? |
| [6. Mastery lab and answer key](06-mastery-lab.md) | Can I predict failures, explain tradeoffs, and safely design an enhancement? |

## Learn through one running example

Alice owns workspace W. Bob is a member assigned to task T. Cara is an outsider. Alice and Bob both open version 7 of T. Alice saves a change; Bob's browser disconnects and later saves his old draft. During recovery, Bob retries a create whose acknowledgement was lost. Alice then removes Bob while his SSE connection remains open.

Each chapter follows a part of this example. Always ask: **identity → permission → contract → transaction → response → delivery → reconciliation**. Do not skip directly from a button to a database row.

## Documentation ownership

| Material | Owner and purpose |
| --- | --- |
| Vocabulary and invariants | [CONTEXT.md](../../CONTEXT.md) |
| Product intent and existing FRS | [Product requirements](../product/saathi-v1-product-requirements.md); retain its original FR identifiers |
| Architecture reference | [Technical architecture](../architecture/saathi-v1-technical-architecture.md) |
| Product/capability map | [Project map](../architecture/saathi-v1-project-map.md); older status rows are historical |
| Accepted architectural decisions | [ADRs](../adr/0001-postgres-source-of-truth.md); do not turn teaching examples into new accepted decisions |
| Current behavior and symbols | Linked implementation files in each chapter |
| Dated execution evidence | [Core fixes](../release/2026-10-04-core-audit-fix-evidence.md), [closeout](../release/2026-10-04-core-closeout-evidence.md), [startup follow-up](../release/2026-10-04-startup-performance-evidence.md) |
| Known growth limits | [Pagination and retention](../architecture/2026-10-04-pagination-retention.md) |

When sources disagree, inspect the current implementation for behavior, the latest applicable evidence for verification, and the ADR for decision intent. Record discrepancies instead of silently upgrading a requirement into a passing feature. Earlier documents keep their dates and original evidence.

## Definition of mastery

You can redraw the architecture and transaction boundary, trace a command through real symbols, predict a lost-acknowledgement outcome, explain authorization versus authentication, and identify the tests and deployment gates for a proposed change. Reading alone does not prove this: use the lab to demonstrate it.

## Keeping the handbook useful

When a change alters a contract, permission, data invariant, failure outcome, or infrastructure assumption, update the relevant chapter in the same review. Add a dated evidence link instead of copying changing test totals into every page. Preserve relative source links and symbol names rather than fragile line numbers. Never include secrets, cookies, private connection strings, or copied provider payloads.

**Next:** [Architecture and data](01-architecture-and-data.md).
