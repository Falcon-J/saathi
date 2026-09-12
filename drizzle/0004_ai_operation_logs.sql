CREATE TABLE ai_operation_logs (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requesting_user_id uuid NOT NULL REFERENCES profiles(id),
  capability text NOT NULL CHECK (capability IN ('summarize_workspace','identify_attention','draft_task')),
  outcome text NOT NULL CHECK (outcome IN ('success','provider_unavailable','rate_limited','invalid_response','disabled','unauthorized')),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  estimated_cost_micros bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_operation_logs_created_idx ON ai_operation_logs(created_at);

ALTER TABLE ai_operation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_operation_logs FROM anon, authenticated;
