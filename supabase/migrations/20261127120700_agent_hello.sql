-- Any MCP request that isn't a tool call (initialize, tools/list, ping) checks the key here, so a wrong or
-- revoked key gets a 401 at connect time. It counts towards the rate limit and names a new agent after its client.
create function public.agent_hello(p_key text, p_client text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
begin
  if gate is not null then return gate; end if;
  -- Two new agents from the same client can race for one name; the loser keeps its name until its next call.
  begin
    perform app.name_agent(a, p_client, null);
  exception when unique_violation then null;
  end;
  return app.ok();
end $$;

grant execute on function public.agent_hello(text, text) to service_role;
