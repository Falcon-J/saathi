CREATE TABLE platform_delegations (
  id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  client_id text NOT NULL,
  capabilities jsonb NOT NULL,
  workspace_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT platform_delegations_client_check CHECK (length(client_id) BETWEEN 1 AND 200),
  CONSTRAINT platform_delegations_capabilities_check CHECK (jsonb_typeof(capabilities) = 'array'),
  CONSTRAINT platform_delegations_workspaces_check CHECK (workspace_ids IS NULL OR jsonb_typeof(workspace_ids) = 'array')
);
CREATE UNIQUE INDEX platform_delegations_actor_client_unique ON platform_delegations(actor_user_id, client_id);
ALTER TABLE platform_delegations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform_delegations FROM PUBLIC, anon, authenticated;

-- Workspace and actor UUIDs are historical receipt identity, not cascading references.
CREATE TABLE platform_command_receipts (
  actor_user_id uuid NOT NULL,
  client_id text NOT NULL,
  command_id uuid NOT NULL,
  command_type text NOT NULL,
  request_hash text NOT NULL,
  workspace_id uuid,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, client_id, command_id),
  CONSTRAINT platform_command_receipts_client_check CHECK (length(client_id) BETWEEN 1 AND 200),
  CONSTRAINT platform_command_receipts_type_check CHECK (length(command_type) BETWEEN 1 AND 200),
  CONSTRAINT platform_command_receipts_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE platform_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform_command_receipts FROM PUBLIC, anon, authenticated;
