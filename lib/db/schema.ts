import { sql } from "drizzle-orm"
import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, primaryKey, foreignKey, uniqueIndex, check, index, date } from "drizzle-orm/pg-core"

const times = () => ({ createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() })
// auth.users linkage, signup trigger, deferred owner FK and RLS are maintained in SQL migrations.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), username: varchar("username", { length: 80 }).notNull(), ...times(),
}, t => [check("profiles_username_check", sql`length(trim(${t.username})) > 0`)])

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
  inviterUserId: uuid("inviter_user_id").notNull().references(() => profiles.id), inviteeEmail: text("invitee_email").notNull(),
  status: text("status").notNull().default("pending"), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }), acceptedByUserId: uuid("accepted_by_user_id").references(() => profiles.id), ...times(),
}, t => [
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
])

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), actorUserId: uuid("actor_user_id").notNull().references(() => profiles.id),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("activity_workspace_idx").on(t.workspaceId, t.createdAt.desc())])

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), eventType: text("event_type").notNull(), payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), publishedAt: timestamp("published_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0), lastErrorCategory: text("last_error_category"),
}, t => [index("outbox_pending_idx").on(t.createdAt).where(sql`${t.publishedAt} IS NULL`)])
