import { sql } from "drizzle-orm"
import { pgTable, uuid, varchar, text, integer, bigint, timestamp, jsonb, primaryKey, foreignKey, uniqueIndex, check, index, date } from "drizzle-orm/pg-core"
import { unique } from "drizzle-orm/pg-core"

const times = () => ({ createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() })
// auth.users linkage, signup trigger, deferred owner FK and RLS are maintained in SQL migrations.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), username: varchar("username", { length: 80 }).notNull(), ...times(),
}, t => [check("profiles_username_check", sql`length(trim(${t.username})) > 0`)])

// FK to auth.users and email-change invalidation are maintained in SQL migrations.
export const invitationEmailVerifications = pgTable("invitation_email_verifications", {
  userId: uuid("user_id").primaryKey(),
  email: text("email").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("invitation_email_verifications_email_check", sql`${t.email} = lower(trim(${t.email})) AND length(${t.email}) > 0`)])

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(), name: varchar("name", { length: 100 }).notNull(), summary: varchar("summary", { length: 240 }),
  targetAt: timestamp("target_at", { withTimezone: true }), timezone: text("timezone").notNull().default("UTC"),
  ownerUserId: uuid("owner_user_id").notNull().references(() => profiles.id), version: integer("version").notNull().default(1),
  ...times(), archivedAt: timestamp("archived_at", { withTimezone: true }),
}, t => [check("workspaces_name_check", sql`length(trim(${t.name})) > 0`), check("workspaces_version_check", sql`${t.version} > 0`)])

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id), joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)])

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  inviterUserId: uuid("inviter_user_id").notNull().references(() => profiles.id), inviteeEmail: text("invitee_email"), tokenHash: text("token_hash"),
  status: text("status").notNull().default("pending"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }), acceptedByUserId: uuid("accepted_by_user_id").references(() => profiles.id), ...times(),
}, t => [
  check("invitation_address_or_token_check", sql`num_nonnulls(${t.inviteeEmail},${t.tokenHash}) = 1`),
  check("invitation_token_hash_check", sql`${t.tokenHash} IS NULL OR ${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  uniqueIndex("invitation_token_hash_unique").on(t.tokenHash),
  check("workspace_invitations_invitee_email_check", sql`${t.inviteeEmail} = lower(trim(${t.inviteeEmail}))`),
  check("workspace_invitations_status_check", sql`${t.status} IN ('pending','accepted','declined','revoked','expired')`),
  uniqueIndex("invitation_pending_unique").on(t.workspaceId, t.inviteeEmail).where(sql`${t.status} = 'pending'`),
  index("invitation_recipient_idx").on(t.inviteeEmail, t.status),
])

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(), description: varchar("description", { length: 1000 }),
  status: text("status").notNull().default("todo"), priority: text("priority").notNull().default("medium"), bucket: text("bucket"),
  dueDate: date("due_date"), dueAt: timestamp("due_at", { withTimezone: true }), estimatedMinutes: integer("estimated_minutes"), assigneeUserId: uuid("assignee_user_id"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id), version: integer("version").notNull().default(1), ...times(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.assigneeUserId], foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId] }),
  check("tasks_title_check", sql`length(trim(${t.title})) > 0`), check("tasks_status_check", sql`${t.status} IN ('todo','in_progress','done')`),
  check("tasks_priority_check", sql`${t.priority} IN ('low','medium','high')`), check("tasks_bucket_check", sql`${t.bucket} IN ('today','next')`),
  check("tasks_estimated_minutes_check", sql`${t.estimatedMinutes} BETWEEN 1 AND 1440`), check("tasks_version_check", sql`${t.version} > 0`),
  check("task_deadline_exclusive", sql`${t.dueDate} IS NULL OR ${t.dueAt} IS NULL`),
  index("tasks_workspace_idx").on(t.workspaceId, t.createdAt),
  uniqueIndex("tasks_workspace_id_unique").on(t.workspaceId, t.id),
])

export const taskDependencies = pgTable("task_dependencies", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  dependentTaskId: uuid("dependent_task_id").notNull(),
  prerequisiteTaskId: uuid("prerequisite_task_id").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.workspaceId, t.dependentTaskId, t.prerequisiteTaskId] }),
  foreignKey({ columns: [t.workspaceId, t.dependentTaskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.workspaceId, t.prerequisiteTaskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete("cascade"),
  check("task_dependencies_not_self", sql`${t.dependentTaskId} <> ${t.prerequisiteTaskId}`),
  index("task_dependencies_prerequisite_idx").on(t.workspaceId, t.prerequisiteTaskId),
])

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => profiles.id),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("task_comments_body_check", sql`length(trim(${t.body})) > 0`),
  index("task_comments_task_created_idx").on(t.taskId, t.createdAt),
])

export const aiOperationLogs = pgTable("ai_operation_logs", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  requestingUserId: uuid("requesting_user_id").notNull().references(() => profiles.id),
  capability: text("capability").notNull(),
  outcome: text("outcome").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("ai_operation_logs_capability_check", sql`${t.capability} IN ('summarize_workspace','identify_attention','draft_task')`),
  check("ai_operation_logs_outcome_check", sql`${t.outcome} IN ('success','provider_unavailable','rate_limited','invalid_response','disabled','unauthorized')`),
  check("ai_operation_logs_latency_check", sql`${t.latencyMs} >= 0`),
  check("ai_operation_logs_cost_check", sql`${t.estimatedCostMicros} >= 0`),
  index("ai_operation_logs_created_idx").on(t.createdAt),
])

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("activity_workspace_idx").on(t.workspaceId, t.createdAt.desc())])

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), eventType: text("event_type").notNull(), payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), publishedAt: timestamp("published_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }), claimToken: uuid("claim_token"),
  attemptCount: integer("attempt_count").notNull().default(0), lastErrorCategory: text("last_error_category"),
}, t => [index("outbox_pending_idx").on(t.createdAt).where(sql`${t.publishedAt} IS NULL`)])

export const commandReceipts = pgTable("command_receipts", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id),
  commandId: uuid("command_id").notNull(), commandType: text("command_type").notNull(),
  requestHash: text("request_hash").notNull(), result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.actorUserId, t.commandId] }),
  check("command_receipts_command_type_check", sql`${t.commandType} IN ('task-create','comment-create','dependency-add','dependency-remove')`)])

// Server-only access and RLS denial for browser roles are maintained in SQL migrations.
export const platformDelegations = pgTable("platform_delegations", {
  id: uuid("id").primaryKey(), actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id),
  clientId: text("client_id").notNull(), capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  workspaceIds: jsonb("workspace_ids").$type<string[]>(), ...times(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [uniqueIndex("platform_delegations_actor_client_unique").on(t.actorUserId, t.clientId),
  check("platform_delegations_client_check", sql`length(${t.clientId}) BETWEEN 1 AND 200`),
  check("platform_delegations_capabilities_check", sql`jsonb_typeof(${t.capabilities}) = 'array'`),
  check("platform_delegations_workspaces_check", sql`${t.workspaceIds} IS NULL OR jsonb_typeof(${t.workspaceIds}) = 'array'`)])

// Historical identity survives resource deletion: intentionally no cascading foreign keys.
export const platformCommandReceipts = pgTable("platform_command_receipts", {
  actorUserId: uuid("actor_user_id").notNull(), clientId: text("client_id").notNull(), commandId: uuid("command_id").notNull(),
  commandType: text("command_type").notNull(), requestHash: text("request_hash").notNull(), workspaceId: uuid("workspace_id"),
  result: jsonb("result").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.actorUserId, t.clientId, t.commandId] }),
  check("platform_command_receipts_client_check", sql`length(${t.clientId}) BETWEEN 1 AND 200`),
  check("platform_command_receipts_type_check", sql`length(${t.commandType}) BETWEEN 1 AND 200`),
  check("platform_command_receipts_hash_check", sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`)])

// The SQL migrations own RLS, role grants and every DEFERRABLE relationship below.
// bigint mode preserves fencing tokens without JavaScript number precision loss.
export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id), clientId: text("client_id").notNull(),
  grantId: uuid("grant_id").notNull(), state: text("state").notNull(), fencingToken: bigint("fencing_token", { mode: "bigint" }).notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(), progress: text("progress"),
  evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`), reviewerUserId: uuid("reviewer_user_id").references(() => profiles.id),
  reviewComment: text("review_comment"), version: integer("version").notNull().default(1), ...times(),
}, t => [
  foreignKey({ columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete("cascade"),
  unique("agent_runs_workspace_id_task_id_id_key").on(t.workspaceId, t.taskId, t.id),
  index("agent_runs_workspace_page_idx").on(t.workspaceId, t.id), index("agent_runs_task_idx").on(t.workspaceId, t.taskId, t.id),
  check("agent_runs_client_id_check", sql`length(${t.clientId}) BETWEEN 1 AND 200`),
  check("agent_runs_state_check", sql`${t.state} IN ('queued','running','awaiting_review','succeeded','failed','cancelled')`),
  check("agent_runs_fencing_token_check", sql`${t.fencingToken} > 0`),
  check("agent_runs_progress_check", sql`length(${t.progress}) <= 2000`),
  check("agent_runs_evidence_check", sql`jsonb_typeof(${t.evidence}) = 'array' AND jsonb_array_length(${t.evidence}) <= 10`),
  check("agent_runs_review_comment_check", sql`length(${t.reviewComment}) <= 2000`),
  check("agent_runs_version_check", sql`${t.version} > 0`),
])

export const taskAgentLeases = pgTable("task_agent_leases", {
  workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), holderRunId: uuid("holder_run_id"),
  fencingToken: bigint("fencing_token", { mode: "bigint" }).notNull().default(sql`0`),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.workspaceId, t.taskId] }),
  foreignKey({ columns: [t.workspaceId, t.taskId], foreignColumns: [tasks.workspaceId, tasks.id] }).onDelete("cascade"),
  check("task_agent_leases_fencing_token_check", sql`${t.fencingToken} >= 0`),
  check("task_agent_leases_check", sql`(${t.holderRunId} IS NULL) = (${t.leaseExpiresAt} IS NULL)`),
  // SQL-owned: (workspace_id,task_id,holder_run_id) -> agent_runs(workspace_id,task_id,id)
  // DEFERRABLE INITIALLY DEFERRED. An immediate Drizzle FK would break transaction ordering.
])

export const canvasResources = pgTable("canvas_resources", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull(), parentId: uuid("parent_id"),
  kind: text("kind").notNull(), name: varchar("name", { length: 100 }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  policyMode: text("policy_mode").notNull(), version: integer("version").notNull().default(1),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id), ...times(),
}, t => [
  unique("canvas_resources_workspace_id_key").on(t.workspaceId),
  unique("canvas_resources_organization_id_id_key").on(t.organizationId, t.id),
  index("canvas_resources_parent_idx").on(t.organizationId, t.parentId),
  check("canvas_resources_kind_check", sql`${t.kind} IN ('organization','space','section','workspace')`),
  check("canvas_resources_policy_mode_check", sql`${t.policyMode} IN ('inherit','restricted')`),
  check("canvas_resources_version_check", sql`${t.version} > 0`),
  check("canvas_resources_check", sql`(${t.kind}='organization' AND ${t.parentId} IS NULL AND ${t.organizationId}=${t.id} AND ${t.policyMode}='restricted') OR (${t.kind}<>'organization' AND ${t.parentId} IS NOT NULL)`),
  check("canvas_resources_check1", sql`(${t.kind}='workspace' AND ${t.workspaceId} IS NOT NULL AND ${t.name} IS NULL) OR (${t.kind}<>'workspace' AND ${t.workspaceId} IS NULL AND ${t.name} IS NOT NULL AND length(trim(${t.name}))>0)`),
  // SQL-owned: (organization_id,parent_id) -> canvas_resources(organization_id,id)
  // DEFERRABLE INITIALLY IMMEDIATE; organization_id -> canvas_organizations(id)
  // DEFERRABLE INITIALLY DEFERRED. Preserve both deferral modes in migration 0013.
  // SQL-owned canvas_resource_hierarchy trigger enforces immutable canonical containment,
  // supported parent kinds, same-organization ancestry and a maximum depth of 16.
])

export const canvasOrganizations = pgTable("canvas_organizations", {
  id: uuid("id").primaryKey().references(() => canvasResources.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const canvasOrganizationMembers = pgTable("canvas_organization_members", {
  organizationId: uuid("organization_id").notNull().references(() => canvasOrganizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id), revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.organizationId, t.userId] }),
  index("canvas_organization_members_actor_idx").on(t.userId, t.organizationId).where(sql`${t.revokedAt} IS NULL`)])

export const canvasGroups = pgTable("canvas_groups", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => canvasOrganizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(), createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id),
  version: integer("version").notNull().default(1),
}, t => [unique("canvas_groups_organization_id_id_key").on(t.organizationId, t.id),
  check("canvas_groups_name_check", sql`length(trim(${t.name}))>0`), check("canvas_groups_version_check", sql`${t.version}>0`)])

export const canvasGroupMembers = pgTable("canvas_group_members", {
  organizationId: uuid("organization_id").notNull(), groupId: uuid("group_id").notNull(), userId: uuid("user_id").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.organizationId, t.groupId, t.userId] }),
  foreignKey({ columns: [t.organizationId, t.groupId], foreignColumns: [canvasGroups.organizationId, canvasGroups.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.userId], foreignColumns: [canvasOrganizationMembers.organizationId, canvasOrganizationMembers.userId] }).onDelete("cascade"),
  index("canvas_group_members_actor_idx").on(t.userId, t.organizationId).where(sql`${t.revokedAt} IS NULL`)])

const canvasCapabilitiesCheck = (capabilities: import("drizzle-orm").SQLWrapper) => sql`${capabilities} @> ARRAY['read']::text[] AND ${capabilities} <@ ARRAY['read','create','edit','comment','manage','delete']::text[] AND cardinality(${capabilities}) BETWEEN 1 AND 6 AND array_position(${capabilities},NULL) IS NULL`

export const canvasResourceGrants = pgTable("canvas_resource_grants", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull(), resourceId: uuid("resource_id").notNull(),
  userId: uuid("user_id"), groupId: uuid("group_id"), capabilities: text("capabilities").array().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }),
  version: integer("version").notNull().default(1), createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id),
}, t => [
  foreignKey({ columns: [t.organizationId, t.resourceId], foreignColumns: [canvasResources.organizationId, canvasResources.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.userId], foreignColumns: [canvasOrganizationMembers.organizationId, canvasOrganizationMembers.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.groupId], foreignColumns: [canvasGroups.organizationId, canvasGroups.id] }).onDelete("cascade"),
  check("canvas_resource_grants_check", sql`num_nonnulls(${t.userId},${t.groupId})=1`),
  check("canvas_resource_grants_capabilities_check", canvasCapabilitiesCheck(t.capabilities)),
  check("canvas_resource_grants_version_check", sql`${t.version}>0`),
  index("canvas_grants_resource_idx").on(t.resourceId).where(sql`${t.revokedAt} IS NULL`),
  index("canvas_grants_user_idx").on(t.userId, t.organizationId).where(sql`${t.revokedAt} IS NULL`),
  index("canvas_grants_group_idx").on(t.groupId, t.organizationId).where(sql`${t.revokedAt} IS NULL`),
])

export const canvasReferences = pgTable("canvas_references", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull(), canvasResourceId: uuid("canvas_resource_id").notNull(),
  targetResourceId: uuid("target_resource_id").notNull(), createdByUserId: uuid("created_by_user_id").notNull().references(() => profiles.id),
}, t => [
  foreignKey({ columns: [t.organizationId, t.canvasResourceId], foreignColumns: [canvasResources.organizationId, canvasResources.id] }).onDelete("cascade"),
  foreignKey({ columns: [t.organizationId, t.targetResourceId], foreignColumns: [canvasResources.organizationId, canvasResources.id] }).onDelete("cascade"),
])

export const canvasAccessEvents = pgTable("canvas_access_events", {
  id: uuid("id").primaryKey(), organizationId: uuid("organization_id").notNull().references(() => canvasOrganizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id), resourceId: uuid("resource_id").references(() => canvasResources.id, { onDelete: "set null" }),
  operation: text("operation").notNull(), metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const canvasAccessCommands = pgTable("canvas_access_commands", {
  actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id), commandId: uuid("command_id").notNull(),
  organizationId: uuid("organization_id").notNull().references(() => canvasOrganizations.id, { onDelete: "cascade" }),
  requestHash: text("request_hash").notNull(), result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.actorUserId, t.commandId] })])
