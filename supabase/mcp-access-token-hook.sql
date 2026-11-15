-- REVIEW AND CONFIGURE BEFORE DEPLOYMENT. This artifact is not part of db:migrate.
-- Replace both placeholders. Keep the audience identical to MCP_RESOURCE_URL.
-- Add only preregistered MCP OAuth client UUIDs that appear in MCP_OAUTH_CLIENT_IDS.
-- Do not enable this hook until asymmetric signing and the MCP resource are verified.
CREATE SCHEMA IF NOT EXISTS saathi_auth;
REVOKE ALL ON SCHEMA saathi_auth FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA saathi_auth TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION saathi_auth.mcp_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  oauth_client_id text := event->'claims'->>'client_id';
  mcp_clients text[] := ARRAY['REPLACE_WITH_REGISTERED_MCP_CLIENT_UUID'];
  mcp_audience text := 'https://REPLACE_WITH_CANONICAL_APP_HOST/mcp';
BEGIN
  -- client_id is a provider-issued OAuth claim, never user_metadata.
  -- Refreshes of OAuth tokens retain this client claim and receive the same audience.
  IF oauth_client_id IS NOT NULL AND oauth_client_id = ANY(mcp_clients) THEN
    IF mcp_audience LIKE '%REPLACE_%' THEN
      RAISE EXCEPTION 'MCP audience has not been configured';
    END IF;
    claims := jsonb_set(claims, '{aud}', to_jsonb(mcp_audience));
    event := jsonb_set(event, '{claims}', claims);
  END IF;
  -- Ordinary browser authentication and unrelated OAuth clients are unchanged.
  RETURN event;
END;
$$;
REVOKE ALL ON FUNCTION saathi_auth.mcp_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION saathi_auth.mcp_access_token_hook(jsonb) TO supabase_auth_admin;
