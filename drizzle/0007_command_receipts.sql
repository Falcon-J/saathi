CREATE TABLE command_receipts (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  command_id uuid NOT NULL,
  command_type text NOT NULL CHECK (command_type IN ('task-create','comment-create')),
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, actor_user_id, command_id)
);
ALTER TABLE command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON command_receipts FROM anon, authenticated;
