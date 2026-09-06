-- A date-only deadline and an instant are different facts, never duplicate values.
ALTER TABLE tasks ADD COLUMN due_date date;
ALTER TABLE tasks ADD CONSTRAINT task_deadline_exclusive CHECK(due_date IS NULL OR due_at IS NULL);
ALTER TABLE invitation_emails ADD COLUMN delivery_status text CHECK(delivery_status IN ('delivered','bounced','complained','failed'));
CREATE TABLE email_suppressions (
  email text PRIMARY KEY CHECK(email=lower(trim(email))),
  reason text NOT NULL CHECK(reason IN ('bounced','complained')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE email_webhook_events (
  id text PRIMARY KEY, provider_id text NOT NULL, event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_suppressions,email_webhook_events FROM anon,authenticated;
