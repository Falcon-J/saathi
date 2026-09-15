ALTER TABLE outbox_events ADD COLUMN claimed_at timestamptz, ADD COLUMN claim_token uuid;
