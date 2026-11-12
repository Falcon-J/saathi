-- Saathi coordinates external clients; it never starts or stops their processes.
CREATE TABLE agent_runs (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL,
 task_id uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES profiles(id),
 client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 200),
 grant_id uuid NOT NULL,
 state text NOT NULL CHECK (state IN ('queued','running','awaiting_review','succeeded','failed','cancelled')),
 fencing_token bigint NOT NULL CHECK (fencing_token > 0),
 lease_expires_at timestamptz NOT NULL,
 progress text CHECK (length(progress) <= 2000),
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) <= 10),
 reviewer_user_id uuid REFERENCES profiles(id),
 review_comment text CHECK (length(review_comment) <= 2000),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE CASCADE,
 UNIQUE (workspace_id,task_id,id)
);
CREATE INDEX agent_runs_workspace_page_idx ON agent_runs(workspace_id,id);
CREATE INDEX agent_runs_task_idx ON agent_runs(workspace_id,task_id,id);
CREATE TABLE task_agent_leases (
 workspace_id uuid NOT NULL,
 task_id uuid NOT NULL,
 holder_run_id uuid,
 fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
 lease_expires_at timestamptz,
 PRIMARY KEY (workspace_id,task_id),
 FOREIGN KEY (workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY (workspace_id,task_id,holder_run_id) REFERENCES agent_runs(workspace_id,task_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK ((holder_run_id IS NULL) = (lease_expires_at IS NULL))
);
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_agent_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE agent_runs,task_agent_leases FROM PUBLIC,anon,authenticated;
