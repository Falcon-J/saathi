-- First run: one workspace per person, with the demo agent and SAA-1 → SAA-2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
truncate app.workspaces cascade; -- local e2e runs leave workspaces behind

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('33333333-3333-3333-3333-333333333333', 'first-run@example.com', '{"user_name":"falcon-j"}', 'authenticated', 'authenticated');

set local role anon;
select throws_ok($$ select public.bootstrap_workspace() $$, '42501', null, 'signed-out callers cannot make a workspace');
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
create temp table r as select public.bootstrap_workspace() as first, null::jsonb as second;
update r set second = public.bootstrap_workspace();
select is((select first ->> 'created' from r), 'true', 'the first call makes a workspace');
select is((select second ->> 'created' from r), 'false', 'a second sign-in does not make another');
select is((select second ->> 'workspace_id' from r), (select first ->> 'workspace_id' from r), 'it returns the same workspace');
select is(jsonb_array_length(public.whoami() -> 'workspaces'), 1, 'whoami lists exactly one workspace');
select is(public.whoami() -> 'workspaces' -> 0 ->> 'name', 'falcon-j''s workspace', 'named after the person');
select is(public.whoami() -> 'workspaces' -> 0 ->> 'role', 'owner', 'and they own it');
reset role;

create temp table mine as select id from app.workspaces where created_by = '33333333-3333-3333-3333-333333333333';
select is((select count(*)::int from mine), 1, 'one workspace row');
select is((select name || '/' || client from app.agents where workspace_id in (select id from mine)), 'demo-agent/demo', 'with the demo agent');
select is((select count(*)::int from app.agent_keys k join app.agents a on a.id = k.agent_id where a.workspace_id in (select id from mine)),
          0, 'which has no key until the demo starts');
select results_eq(
  $$ select app.ref(id), title, status from app.tasks where workspace_id in (select id from mine) order by number $$,
  $$ values ('SAA-1', 'Fix the typo in README', 'ready'), ('SAA-2', 'Add a CHANGELOG entry', 'waiting') $$,
  'SAA-1 is ready and SAA-2 waits on it');
select is((select next_number from app.workspaces where id in (select id from mine)), 3, 'the next task is SAA-3');
select is(app.task_card((select id from app.tasks where number = 2 and workspace_id in (select id from mine))) -> 'waits_on', '["SAA-1"]', 'the link is in place');

select * from finish();
rollback;
