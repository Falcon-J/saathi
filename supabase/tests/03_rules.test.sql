-- The rules agents and people rely on: limits, pauses, questions, stops, retries and the sweep.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
truncate app.workspaces cascade; -- local e2e runs leave workspaces behind

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'you@example.com', '{"full_name":"You"}', 'authenticated', 'authenticated');
insert into app.workspaces (id, name, created_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'saathi', '11111111-1111-1111-1111-111111111111');
insert into app.members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table k (name text primary key, key text);
insert into k select n, public.create_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'key' from unnest(array['a','b']) n;
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'One', p_priority => 3::smallint);
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Two');
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Three', p_waits_on => array['SAA-1']);
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Four');

-- Naming and claiming
select is(public.agent_next_task((select key from k where name = 'a'), p_client => 'claude-code', p_request_id => 'r1') #>> '{task,ref}', 'SAA-1', 'higher priority first');
select is((select name from app.agents where name like 'claude%'), 'claude-code', 'the agent takes its client''s name');
select is(public.agent_next_task((select key from k where name = 'a'), p_request_id => 'r1') #>> '{task,ref}', 'SAA-1', 'a retried request returns the first result');
select is(public.agent_next_task((select key from k where name = 'b'), p_task => 'SAA-3') ->> 'code', 'blocked', 'claiming waiting work is refused');
select is(public.agent_next_task((select key from k where name = 'b'), p_task => 'SAA-3') -> 'waits_on', '["SAA-1"]', 'with what it waits on');
select is(public.agent_next_task((select key from k where name = 'b'), p_task => 'SAA-1') ->> 'code', 'taken', 'held work is taken');
select is(public.agent_next_task((select key from k where name = 'a'), p_task => 'SAA-1') ->> 'fence', '1', 're-claiming your own task keeps the fence');
select public.agent_next_task((select key from k where name = 'a'));
select is(public.agent_next_task((select key from k where name = 'a')) ->> 'code', 'at_limit', 'two at a time by default');

-- Questions travel back in the heartbeat
select is(public.agent_ask((select key from k where name = 'a'), 'SAA-1', 1, 'Which region?', '["eu-west-1","us-east-1"]') ->> 'ok', 'true', 'an agent can ask');
select is((select status from app.tasks where number = 1), 'question', 'the task now needs you');
select is(public.agent_submit((select key from k where name = 'a'), 'SAA-1', 1, 'x', '[{"name":"t","result":"pass"}]') ->> 'code', 'invalid', 'no submit while a question is open');
select is(public.answer_question('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-1', 'eu-west-1') ->> 'ok', 'true', 'you answer');
select is(public.agent_heartbeat((select key from k where name = 'a'), 'SAA-1', 1, '["Read","Write","Test"]', 1, 'Writing') #>> '{answer,text}', 'eu-west-1', 'the answer arrives in the next heartbeat');

-- Proof, retries and send back
select is(public.agent_submit((select key from k where name = 'a'), 'SAA-1', 1, 'Done', '[{"name":"t","result":"maybe"}]') ->> 'code', 'invalid', 'checks must pass, fail or skip');
select public.agent_submit((select key from k where name = 'a'), 'SAA-1', 1, 'Done', '[{"name":"t","result":"pass"}]');
select is(public.agent_submit((select key from k where name = 'a'), 'SAA-1', 1, 'Done', '[{"name":"t","result":"pass"}]') ->> 'ok', 'true', 'a repeated submit returns the first result');
select is(public.send_back_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-1', 'Add tests') ->> 'ok', 'true', 'you send it back');
select is(public.agent_next_task((select key from k where name = 'b'), p_task => 'SAA-1') ->> 'code', 'taken', 'sent-back work stays with the same agent');

-- Stop, pause, silent
select is(public.release_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-2') ->> 'ok', 'true', 'you stop the agent on SAA-2');
select is(public.agent_heartbeat((select key from k where name = 'a'), 'SAA-2', 1) ->> 'code', 'stopped', 'its next heartbeat says stopped, not fenced');
update app.agents set paused_at = now() where name = 'agent-2';
select is(public.agent_next_task((select key from k where name = 'b')) ->> 'code', 'paused', 'a paused agent gets no work');

-- The sweep marks silence before the lease ends
update app.agents set paused_at = null where name = 'agent-2';
select public.agent_next_task((select key from k where name = 'b'), p_task => 'SAA-4');
update app.tasks set last_beat_at = now() - interval '4 minutes' where number = 4;
select app.sweep();
select isnt((select silent_at from app.tasks where number = 4), null, 'no heartbeat for 3 minutes marks the agent silent');
select is((select status from app.tasks where number = 4), 'working', 'but the task stays with it until the lease ends');

-- Rate limit and the link cap
update app.agents set rate_count = 120, rate_window = now() where name = 'agent-2';
select is(public.agent_get_task((select key from k where name = 'b'), 'SAA-4') ->> 'code', 'rate_limited', 'call 121 in a minute is refused');
insert into app.tasks (workspace_id, number, title, created_by)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100 + g, 'Filler ' || g, '11111111-1111-1111-1111-111111111111' from generate_series(1, 51) g;
insert into app.tasks (workspace_id, number, title, created_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 201, 'Big', '11111111-1111-1111-1111-111111111111');
select public.link_tasks('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-' || (100 + g), 'SAA-201') from generate_series(1, 49) g;
select is(public.link_tasks('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-150', 'SAA-201') ->> 'ok', 'true', 'link 50 is fine');
select is(public.link_tasks('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-151', 'SAA-201') ->> 'code', 'too_many_links', 'link 51 is refused, with the reason');
select is((select waits_left from app.tasks where number = 201), 50, 'and the ready counter matches the links');
select * from finish();
rollback;
