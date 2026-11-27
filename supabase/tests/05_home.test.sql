-- Home and the task pane: groups, order, the review proof, the open question, and who may read them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
truncate app.workspaces cascade; -- local e2e runs leave workspaces behind

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('44444444-4444-4444-4444-444444444444', 'home@example.com', '{"full_name":"Asha"}', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'stranger@example.com', '{}', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
create temp table ws as select (public.bootstrap_workspace() ->> 'workspace_id')::uuid as id;
create temp table k as select public.create_agent((select id from ws)) ->> 'key' as key;
select public.create_task((select id from ws), 'Ask about Redis');
update app.tasks set assignee_agent_id = null where workspace_id = (select id from ws); -- free the demo agent's tasks
select set_config('t.ws', (select id::text from ws), true);

-- The agent takes SAA-1 and hands back proof, then takes SAA-3 and asks a question.
select public.agent_next_task((select key from k), 'SAA-1');
select public.agent_heartbeat((select key from k), 'SAA-1', 1, '["Read README","Fix typo"]', 1);
select public.agent_submit((select key from k), 'SAA-1', 1, 'Fixed two typos.',
  '[{"name":"spellcheck","result":"pass"},{"name":"links","result":"skip"}]', '{"files":1,"added":2,"removed":2}', true);
select public.agent_next_task((select key from k), 'SAA-3');
select public.agent_ask((select key from k), 'SAA-3', 1, 'Which region?', '["eu-west-1","us-east-1"]');

update app.tasks set updated_at = now() - interval '5 minutes' where workspace_id = (select id from ws) and number = 1; -- asked earlier
create temp table h as select public.home_view((select id from ws)) as v;
select is((select v -> 'workspace' ->> 'name' from h), 'Asha''s workspace', 'Home knows the workspace');
select is((select string_agg(e ->> 'ref' || ':' || (e ->> 'group'), ' ') from h, jsonb_array_elements(v -> 'tasks') e),
          'SAA-3:you SAA-1:you SAA-2:wait', 'needs-you first, newest first, then waiting');
select is((select e ->> 'waits_on' from h, jsonb_array_elements(v -> 'tasks') e where e ->> 'ref' = 'SAA-2'), 'SAA-1', 'a waiting task says what it waits on');
select is((select e ->> 'agent' from h, jsonb_array_elements(v -> 'tasks') e where e ->> 'ref' = 'SAA-1'), 'agent-1', 'each row names its agent');
select is((public.whoami() -> 'workspaces' -> 0 ->> 'needs_you')::int, 2, 'the nav count is the needs-you total');

create temp table p as select public.task_view((select id from ws), 'SAA-1') -> 'task' as v;
select is((select v -> 'review' ->> 'summary' from p), 'Fixed two typos.', 'the pane shows the summary');
select is((select (v -> 'review' ->> 'passed') || '/' || (v -> 'review' ->> 'total') from p), '1/2', 'and checks passed out of total');
select is((select v -> 'after' ->> 'ref' from p), 'SAA-2', 'and what approving unlocks');
select is((select jsonb_array_length(v -> 'log') from p), 2, 'and the progress log');
select is(public.task_view((select id from ws), 'SAA-3') -> 'task' -> 'question' ->> 'text', 'Which region?', 'a question shows its text');
select is(public.task_view((select id from ws), 'SAA-2') -> 'task' -> 'before' ->> 'ref', 'SAA-1', 'a waiting task shows what it waits on');
select is(public.task_view((select id from ws), 'SAA-99') ->> 'code', 'not_found', 'an unknown task says so');

select public.approve_task((select id from ws), 'SAA-1');
select is((select string_agg(e ->> 'ref' || ':' || (e ->> 'group'), ' ') from jsonb_array_elements(public.home_view((select id from ws)) -> 'tasks') e),
          'SAA-3:you SAA-2:wait SAA-1:done', 'approved work moves to done');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(format('select public.home_view(%L)', current_setting('t.ws')), '42501', 'forbidden', 'an outsider cannot read Home');
reset role;
select * from finish();
rollback;
