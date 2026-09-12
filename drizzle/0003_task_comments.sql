CREATE TABLE task_comments (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES profiles(id),
  body varchar(2000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_created_idx ON task_comments(task_id, created_at);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON task_comments FROM anon, authenticated;
