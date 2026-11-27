-- The Agents page: the list, new key, pause, limit, revoke (which frees held work), and who may do it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
truncate app.workspaces cascade; -- local e2e runs leave workspaces behind

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('99999999-9999-9999-9999-999999999999', 'agents@example.com', '{"full_name":"Ria"}', 'authenticated', 'authenticated'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'outsider@example.com', '{}', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
create temp table ws as select (public.bootstrap_workspace() ->> 'workspace_id')::uuid as id;
create temp table k as select (r ->> 'agent_id')::uuid as id, r ->> 'key' as key from (select public.create_agent((select id from ws)) as r) x;
update app.tasks set assignee_agent_id = null where workspace_id = (select id from ws);
select set_config('t.ws', (select id::text from ws), true);
select set_config('t.agent', (select id::text from k), true);

select public.agent_next_task((select key from k), 'SAA-1', p_client => 'Claude Code', p_host => 'dev-laptop');
create temp table v as select e as a from jsonb_array_elements(public.agents_view((select id from ws)) -> 'agents') e;
select is((select count(*)::int from v), 2, 'the list shows the demo agent and the new one');
select is((select a ->> 'name' from v where a ->> 'id' = (select id::text from k)), 'claude-code', 'a connected agent is named after its client');
select is((select a -> 'holding' -> 0 ->> 'ref' from v where a ->> 'id' = (select id::text from k)), 'SAA-1', 'and shows what it holds');
select is((select a -> 'key' ->> 'last4' from v where a ->> 'id' = (select id::text from k)), right((select key from k), 4), 'and its key''s last four');

-- New key: the old one stops working.
create temp table nk as select public.rotate_key((select id from ws), (select id from k)) ->> 'key' as key;
select ok((select key from nk) ~ '^sk_live_[A-Za-z0-9]{32}$', 'a new key is returned once');
select is(public.agent_get_task((select key from k), 'SAA-1') ->> 'code', 'unauthorized', 'the old key stops at once');
select is(public.agent_get_task((select key from nk), 'SAA-1') ->> 'ok', 'true', 'the new key works');

-- Pause and the limit.
select public.pause_agent((select id from ws), (select id from k), true);
select is(public.agent_next_task((select key from nk)) ->> 'code', 'paused', 'a paused agent takes nothing new');
select public.pause_agent((select id from ws), (select id from k), false);
select is(public.set_agent_limit((select id from ws), (select id from k), 11) ->> 'code', 'invalid', 'the limit is 1 to 10');
select is(public.set_agent_limit((select id from ws), (select id from k), 3) ->> 'ok', 'true', 'a limit in range is saved');

-- Revoke frees what it held and drops it from the list.
select is(public.revoke_key((select id from ws), (select id from k)) -> 'freed', '["SAA-1"]'::jsonb, 'revoke frees its task');
select is((select status from app.tasks where workspace_id = (select id from ws) and number = 1), 'ready', 'which is Ready again');
select is(jsonb_array_length(public.agents_view((select id from ws)) -> 'agents'), 1, 'a revoked agent leaves the list');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format('select public.rotate_key(%L, %L)', current_setting('t.ws'), current_setting('t.agent')), '42501', 'forbidden',
                 'an outsider cannot make keys');
reset role;
select * from finish();
rollback;
