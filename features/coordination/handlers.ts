import { coordinationToolSchemas } from './contracts.ts';
import type { CoordinationToolName, HumanReviewInput } from './contracts.ts';
import { createCoordinationService } from './service.ts';
import type { CoordinationStore } from './service.ts';
import { postgresCoordinationStore } from './postgres.ts';
import type { HandlerContext, PlatformHandler } from '../platform/executor.ts';
import { executeWithReceipt } from '../platform/receipts.ts';
export type CoordinationHandlers = Record<CoordinationToolName, PlatformHandler>;
/** Compose with the platform registry/executor; the executor owns receipts for agent mutations. */
export function createCoordinationHandlers(store: CoordinationStore = postgresCoordinationStore): CoordinationHandlers {
    const service = createCoordinationService(store);
    return Object.fromEntries((Object.keys(coordinationToolSchemas) as CoordinationToolName[]).map(name => [name, async (context: HandlerContext) => {
            const data = await service.call(name, context);
            return { data, version: 'version' in data ? data.version : null };
        }])) as CoordinationHandlers;
}
/** Called only by a server-authenticated human session action. No MCP tool exposes approval. */
export async function reviewCoordinationRun(args: {
    reviewerUserId: string;
    input: HumanReviewInput;
}) {
    const service = createCoordinationService(postgresCoordinationStore);
    return executeWithReceipt({ actorId: args.reviewerUserId, clientId: 'saathi-human-review', commandId: args.input.commandId, commandType: 'agent_runs.human_review', input: args.input, workspaceId: args.input.workspaceId,
        authorize: () => postgresCoordinationStore.transaction(session => session.authorizeHuman(args.reviewerUserId, args.input.workspaceId)),
        async authorizeReplay() { await postgresCoordinationStore.transaction(async (session) => { await session.authorizeHuman(args.reviewerUserId, args.input.workspaceId); const taskRun = await session.run(args.input.runId); if (!taskRun || taskRun.workspaceId !== args.input.workspaceId)
            throw Object.assign(new Error('not_found'), { code: 'not_found' }); }); },
        execute: () => service.review(args),
    });
}
export { listCoordinationRunsForHuman } from './postgres.ts';
export type { HumanCoordinationRun } from './postgres.ts';
