-- The landing page's live path, end to end, through the real functions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'you@example.com', '{"full_name":"You"}', 'authenticated', 'authenticated');
insert into app.workspaces (id, name, created_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'saathi', '11111111-1111-1111-1111-111111111111');
insert into app.members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table k (name text primary key, key text);
insert into k select n, public.create_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'key' from unnest(array['a','b','c']) n;

select is(public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Draft the claim API') ->> 'ref', 'SAA-1', 'first task is SAA-1');
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Write the tests');
select is(public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Build the export', p_waits_on => array['SAA-1','SAA-2']) ->> 'ref', 'SAA-3', 'created with two links');
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ship to customers', p_waits_on => array['SAA-3']);
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Migrate the schema');
select is((select status || ':' || waits_left from app.tasks where number = 3), 'waiting:2', 'SAA-3 waits on two tasks');

select is(public.link_tasks('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-4', 'SAA-1') ->> 'code', 'would_loop', 'a loop is refused');
select is(public.link_tasks('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-4', 'SAA-1') -> 'path', '["SAA-4","SAA-1","SAA-3","SAA-4"]', 'and the error shows the loop');

select is(public.agent_next_task((select key from k where name = 'a')) #>> '{task,ref}', 'SAA-1', 'agent a claims SAA-1');
select is(public.agent_next_task((select key from k where name = 'b')) #>> '{task,ref}', 'SAA-2', 'agent b claims SAA-2');
select is(public.agent_next_task((select key from k where name = 'c')) #>> '{task,ref}', 'SAA-5', 'agent c skips waiting work and claims SAA-5');

select is(public.agent_submit((select key from k where name = 'a'), 'SAA-1', 1, 'Drafted', '[{"name":"tests","result":"pass"}]') ->> 'ok', 'true', 'a submits proof');
select is(public.agent_submit((select key from k where name = 'b'), 'SAA-2', 1, 'Written', '[{"name":"tests","result":"pass"}]') ->> 'ok', 'true', 'b submits proof');
select is(public.approve_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-1') -> 'unlocked', '[]', 'approving SAA-1 unlocks nothing yet');
select is(public.approve_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-2') -> 'unlocked', '["SAA-3"]', 'approving SAA-2 unlocks SAA-3');
select is(public.agent_next_task((select key from k where name = 'a')) #>> '{task,ref}', 'SAA-3', 'agent a claims the export');

-- Agent c goes quiet and its lease runs out.
update app.tasks set lease_until = now() - interval '1 second', last_beat_at = now() - interval '20 minutes' where number = 5;
select is(public.agent_heartbeat((select key from k where name = 'c'), 'SAA-5', 1) ->> 'code', 'fenced', 'a heartbeat after the lease ended is fenced');
select app.sweep();
select is((select status from app.tasks where number = 5), 'ready', 'the sweep returns SAA-5 to Ready');
select is((select data ->> 'reason' from app.events where kind = 'task.released' order by id desc limit 1), 'lease', 'and logs that its lease ended');

select is(public.agent_next_task((select key from k where name = 'b')) ->> 'fence', '2', 'agent b takes over with fence 2');
select is(public.agent_submit((select key from k where name = 'c'), 'SAA-5', 1, 'Late', '[{"name":"tests","result":"pass"}]') ->> 'code', 'fenced', 'the stale fence-1 submit is refused');
select is(public.agent_submit((select key from k where name = 'b'), 'SAA-5', 2, 'Migrated', '[{"name":"tests","result":"pass"}]') ->> 'ok', 'true', 'b submits with fence 2');
select is(public.agent_submit((select key from k where name = 'a'), 'SAA-3', 1, 'Exported', '[{"name":"tests","result":"pass"}]') ->> 'ok', 'true', 'a submits the export');
select is(public.approve_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-3') -> 'unlocked', '["SAA-4"]', 'you approve, and Ship to customers unlocks');
select ok((select count(*) from realtime.messages where topic = 'ws:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') > 10, 'every step was broadcast to the workspace channel');

select * from finish();
rollback;
