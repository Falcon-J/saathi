-- The full task page, the new-task dialog and catch-up: details, history, the since line, and who may mark a visit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
truncate app.workspaces cascade; -- local e2e runs leave workspaces behind

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('66666666-6666-6666-6666-666666666666', 'page@example.com', '{"full_name":"Dev"}', 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777777', 'other@example.com', '{}', 'authenticated', 'authenticated'),
  ('88888888-8888-8888-8888-888888888888', 'mate@example.com', '{"full_name":"Asha"}', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
create temp table ws as select (public.bootstrap_workspace() ->> 'workspace_id')::uuid as id;
create temp table k as select public.create_agent((select id from ws)) ->> 'key' as key;
update app.tasks set assignee_agent_id = null where workspace_id = (select id from ws);
select set_config('t.ws', (select id::text from ws), true);

-- The dialog's fields all land on the task, and agents see the details.
select is(public.create_task((select id from ws), 'Rate limit the API', 'Each key gets 429 after 60 calls.', p_priority => 3::smallint,
                             p_waits_on => array['SAA-1'], p_details => 'See docs/limits.md') -> 'ref' #>> '{}', 'SAA-3', 'a new task gets the next number');
create temp table v as select public.task_view((select id from ws), 'SAA-3') -> 'task' as v;
select is((select v ->> 'details' from v), 'See docs/limits.md', 'the page shows the details');
select is((select v ->> 'priority' from v), 'high', 'and the priority');
select is((select v -> 'history' -> 0 ->> 'kind' from v), 'task.created', 'history starts with the creation');
select is((select (v -> 'history' -> 0 ->> 'me')::boolean from v), true, 'and knows it was you');
select is(public.create_task((select id from ws), 'x', p_details => repeat('a', 4001)) ->> 'code', 'invalid', 'details are capped');

-- Work shows its steps, and history names the agent.
select public.agent_next_task((select key from k), 'SAA-1');
select public.agent_heartbeat((select key from k), 'SAA-1', 1, '["Read README","Fix typo"]', 1);
select is(public.task_view((select id from ws), 'SAA-1') -> 'task' -> 'steps', '["Read README","Fix typo"]'::jsonb, 'a working task shows its steps');
select is((select e ->> 'agent' from jsonb_array_elements(public.task_view((select id from ws), 'SAA-1') -> 'task' -> 'history') e
            where e ->> 'kind' = 'task.claimed'), 'agent-1', 'history names who picked it up');

-- Catch-up counts what was done and unlocked since the last visit, and a visit clears it.
update app.members set last_visit_at = now() - interval '1 hour' where workspace_id = (select id from ws);
select public.agent_submit((select key from k), 'SAA-1', 1, 'Done.', '[{"name":"t","result":"pass"}]');
-- A teammate approves, so it's news to you.
insert into app.members (workspace_id, user_id) values ((select id from ws), '88888888-8888-8888-8888-888888888888');
select set_config('request.jwt.claims', '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select public.approve_task((select id from ws), 'SAA-1');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is((public.home_view((select id from ws)) -> 'since') - 'at'::text, '{"done":1,"unlocked":2}'::jsonb, 'since the last visit: 1 done, SAA-2 and SAA-3 unlocked');
select is(public.home_view((select id from ws)) -> 'agents' -> 0 ->> 'name', 'agent-1', 'Home lists agents for the dialog');
select is(public.mark_visit((select id from ws)) ->> 'ok', 'true', 'a visit is marked');
select is((public.home_view((select id from ws)) -> 'since') - 'at'::text, '{"done":0,"unlocked":0}'::jsonb, 'and nothing is new after it');
update app.members set last_visit_at = now() - interval '1 hour' where workspace_id = (select id from ws);
select public.agent_next_task((select key from k), 'SAA-2');
select public.agent_submit((select key from k), 'SAA-2', 1, 'Done.', '[{"name":"t","result":"pass"}]');
select public.approve_task((select id from ws), 'SAA-2');
select is(((public.home_view((select id from ws)) -> 'since') - 'at'::text) - 'unlocked', '{"done":1}'::jsonb, 'your own approval is not news');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format('select public.mark_visit(%L)', current_setting('t.ws')), '42501', 'forbidden', 'an outsider cannot mark a visit');
reset role;
select * from finish();
rollback;
