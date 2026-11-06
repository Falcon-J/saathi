ALTER TABLE workspace_invitations ALTER COLUMN invitee_email DROP NOT NULL;
ALTER TABLE workspace_invitations ADD COLUMN token_hash text;
ALTER TABLE workspace_invitations ADD CONSTRAINT invitation_address_or_token_check
  CHECK (num_nonnulls(invitee_email,token_hash)=1);
ALTER TABLE workspace_invitations ADD CONSTRAINT invitation_token_hash_check
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX invitation_token_hash_unique ON workspace_invitations(token_hash);
