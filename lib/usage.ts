import { getDb } from "./db/client"
export interface WorkspaceUsage {taskCreated:number;taskCompleted:number;memberAdded:number;contributors:number}
export async function getWorkspaceUsage(workspaceId:string):Promise<WorkspaceUsage>{
  const [r]=await getDb()`SELECT count(*) FILTER(WHERE event_type='task-created')::int AS created,
    count(*) FILTER(WHERE event_type IN ('task-toggled','task-updated') AND metadata->>'completed'='true')::int AS completed,
    count(*) FILTER(WHERE event_type='member-added')::int AS members,count(DISTINCT actor_user_id)::int AS contributors
    FROM activity_events WHERE workspace_id=${workspaceId}`;
  return {taskCreated:r.created,taskCompleted:r.completed,memberAdded:r.members,contributors:r.contributors}
}
