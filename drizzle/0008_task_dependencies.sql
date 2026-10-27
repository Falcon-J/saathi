CREATE UNIQUE INDEX tasks_workspace_id_unique ON tasks (workspace_id, id);
--> statement-breakpoint
CREATE TABLE task_dependencies (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dependent_task_id uuid NOT NULL,
  prerequisite_task_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, dependent_task_id, prerequisite_task_id),
  CONSTRAINT task_dependencies_not_self CHECK (dependent_task_id <> prerequisite_task_id),
  FOREIGN KEY (workspace_id, dependent_task_id) REFERENCES tasks(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, prerequisite_task_id) REFERENCES tasks(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX task_dependencies_prerequisite_idx ON task_dependencies(workspace_id, prerequisite_task_id);
--> statement-breakpoint
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON task_dependencies FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE command_receipts DROP CONSTRAINT command_receipts_command_type_check;
ALTER TABLE command_receipts ADD CONSTRAINT command_receipts_command_type_check
  CHECK (command_type IN ('task-create','comment-create','dependency-add','dependency-remove'));
