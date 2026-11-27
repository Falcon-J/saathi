-- Who can reach what: tables are closed, agents need a live key, people need membership.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'you@example.com', '{"full_name":"You"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'outsider@example.com', '{}', 'authenticated', 'authenticated');
insert into app.workspaces (id, name, created_by) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'saathi', '11111111-1111-1111-1111-111111111111');
insert into app.members (workspace_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

select is((select name from app.profiles where id = '11111111-1111-1111-1111-111111111111'), 'You', 'sign-up makes a profile from GitHub metadata');
select is((select name from app.profiles where id = '22222222-2222-2222-2222-222222222222'), 'outsider', 'or from the email');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table k as select public.create_agent('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ->> 'key' as key;
grant select on k to authenticated, anon;
select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Secret task');

select matches((select key from k), '^sk_live_[A-Za-z0-9]{32}$', 'keys look like sk_live_ plus 32 characters');
select is((select count(*)::int from app.agent_keys where hash = app.key_hash((select key from k))), 1, 'only the hash is stored');
select is(public.agent_next_task('sk_live_' || repeat('x', 32)) ->> 'code', 'unauthorized', 'a wrong key gets nothing');

set local role authenticated;
select throws_ok($$ select * from app.tasks $$, '42501', null, 'people cannot read tables directly');
select throws_ok($$ select public.agent_next_task((select key from k)) $$, '42501', null, 'people cannot call the agent API');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok($$ select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sneaky') $$, '42501', 'forbidden', 'an outsider cannot add tasks');
select throws_ok($$ select public.approve_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SAA-1') $$, '42501', 'forbidden', 'or approve them');
select is(public.can_join_channel('ws:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false, 'or join the live channel');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(public.can_join_channel('ws:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true, 'a member can join it');
reset role;
set local role anon;
select throws_ok($$ select public.create_task('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Anon') $$, '42501', null, 'anonymous callers get nothing');
reset role;

select * from finish();
rollback;
