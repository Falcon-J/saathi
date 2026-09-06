CREATE TABLE invitation_emails (
  id uuid PRIMARY KEY,
  invitation_id uuid NOT NULL REFERENCES workspace_invitations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','cancelled')),
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  error_category text
);
CREATE INDEX invitation_email_pending ON invitation_emails(next_attempt_at) WHERE status='queued';
ALTER TABLE invitation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_emails FROM anon, authenticated;
