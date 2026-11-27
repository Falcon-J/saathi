-- The agent API: one function per MCP tool. Called by /mcp with the secret key only (service_role).
-- Every function checks the key itself, so a leaked service URL alone gets nothing.

create function app.agent_auth(p_key text) returns app.agents
language plpgsql set search_path = '' as $$
declare a app.agents;
begin
  if p_key is null or p_key !~ '^sk_live_[A-Za-z0-9]{32}$' then return null; end if;
  update app.agents g
     set last_seen_at = now(),
         rate_window = case when g.rate_window is null or g.rate_window <= now() - interval '1 minute' then now() else g.rate_window end,
         rate_count  = case when g.rate_window is null or g.rate_window <= now() - interval '1 minute' then 1 else g.rate_count + 1 end
    from app.agent_keys k
   where k.hash = app.key_hash(p_key) and k.revoked_at is null and k.agent_id = g.id and g.revoked_at is null
  returning g.* into a;
  if a.id is not null then
    update app.agent_keys set last_used_at = now() where agent_id = a.id and revoked_at is null;
  end if;
  return a;
end $$;

-- null when the agent may go on; otherwise the error to return.
create function app.agent_gate(a app.agents) returns jsonb
language sql stable set search_path = '' as $$
  select case
    when a.id is null then app.err('unauthorized', 'The key is missing, wrong or revoked.', 'Ask a person in the workspace for a new key.')
    when a.rate_count > 120 then app.err('rate_limited', 'Too many calls in the last minute.', 'Wait and try again.',
      jsonb_build_object('retry_after', greatest(1, ceil(60 - extract(epoch from now() - a.rate_window)))::int))
  end
$$;

-- Lock a task the agent says it holds, and check that it still does.
create function app.lock_held(a app.agents, p_ref text, p_fence bigint, out t app.tasks, out error jsonb)
language plpgsql set search_path = '' as $$
begin
  select * into t from app.tasks where workspace_id = a.workspace_id and number = app.parse_ref(p_ref) for update;
  if not found then
    error := app.err('not_found', 'No task ' || coalesce(p_ref, '') || ' in this workspace.');
  elsif t.holder_agent_id = a.id and t.fence = p_fence and t.status in ('working', 'question') and t.lease_until >= now() then
    error := null;
  elsif exists (select 1 from app.events e where e.task_id = t.id and e.kind = 'task.released'
                and (e.data ->> 'fence')::bigint = p_fence and e.data ->> 'reason' in ('stopped', 'revoked')) then
    error := app.err('stopped', 'A person stopped your work on this task.', 'Stop work on it and call next_task.');
  else
    error := app.err('fenced', 'This task is no longer yours: your lease ended or another agent holds it.',
                     'Stop work on it. Do not submit. Call next_task for new work.');
  end if;
end $$;

create function app.client_kind(p_client text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_client ilike '%claude%' then 'claude-code'
    when p_client ilike '%cursor%' then 'cursor'
    when p_client ilike '%codex%' then 'codex'
    else 'other' end
$$;

-- First call from a new key: name the agent after its client (claude-code, cursor, claude-code-2, …).
create function app.name_agent(a app.agents, p_client text, p_host text) returns void
language plpgsql set search_path = '' as $$
declare base text; candidate text; n int := 1;
begin
  if p_host is not null and p_host is distinct from a.host then
    update app.agents set host = left(p_host, 80) where id = a.id;
  end if;
  if not a.auto_name or p_client is null or a.client = 'demo' then return; end if;
  base := app.client_kind(p_client);
  if base = 'other' then
    base := coalesce(nullif(left(trim(both '-' from regexp_replace(lower(p_client), '[^a-z0-9]+', '-', 'g')), 30), ''), 'agent');
  end if;
  candidate := base;
  while exists (select 1 from app.agents where workspace_id = a.workspace_id and name = candidate and id <> a.id) loop
    n := n + 1; candidate := base || '-' || n;
  end loop;
  update app.agents set name = candidate, client = app.client_kind(p_client), auto_name = false where id = a.id;
  perform app.log(a.workspace_id, null, a.id, null, 'agent.connected', jsonb_build_object('name', candidate, 'client', p_client));
end $$;

create function public.agent_next_task(
  p_key text, p_task text default null, p_lease integer default 900, p_request_id text default null,
  p_client text default null, p_host text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  t app.tasks;
  result jsonb;
  holding jsonb;
  lease integer := least(greatest(coalesce(p_lease, 900), 60), 3600);
begin
  if gate is not null then return gate; end if;
  if p_request_id is not null then
    select r.result into result from app.receipts r where r.agent_id = a.id and r.request_id = p_request_id;
    if found then return result; end if;
  end if;
  perform app.name_agent(a, p_client, p_host);
  if a.paused_at is not null then
    return app.err('paused', 'A person paused this agent.', 'Wait, then call next_task again.', '{"retry_after":60}');
  end if;

  if p_task is not null then
    select * into t from app.tasks where workspace_id = a.workspace_id and number = app.parse_ref(p_task) for update;
    if not found then
      return app.err('not_found', 'No task ' || p_task || ' in this workspace.');
    elsif t.holder_agent_id = a.id and t.status in ('working', 'question') and t.lease_until >= now() then
      return app.ok(jsonb_build_object('task', app.task_card(t.id), 'fence', t.fence::text,
                                       'lease_until', t.lease_until, 'heartbeat_every', 60));
    elsif t.status = 'waiting' then
      return app.err('blocked', app.ref(t.id) || ' waits on other tasks.', 'Pick a ready task instead.',
                     jsonb_build_object('waits_on', app.task_card(t.id) -> 'waits_on'));
    elsif t.status in ('review', 'done') or (t.status in ('working', 'question') and t.lease_until >= now()) then
      return app.err('taken', app.ref(t.id) || ' is ' || case t.status when 'done' then 'done' when 'review' then 'waiting for review' else 'held by another agent' end || '.',
                     'Call next_task without a task to get other work.');
    elsif t.assignee_user_id is not null or (t.assignee_agent_id is not null and t.assignee_agent_id <> a.id) then
      return app.err('taken', app.ref(t.id) || ' is assigned to someone else.', 'Call next_task without a task to get other work.');
    end if;
  end if;

  select coalesce(jsonb_agg(app.ref(id)), '[]') into holding from app.tasks
   where holder_agent_id = a.id and status in ('working', 'question') and lease_until >= now();
  if jsonb_array_length(holding) >= a.max_at_once then
    return app.err('at_limit', 'This agent already holds ' || a.max_at_once || ' tasks.', 'Finish or release one first.',
                   jsonb_build_object('holding', holding));
  end if;

  if p_task is null then
    select * into t from app.tasks
     where workspace_id = a.workspace_id
       and (status = 'ready' or (status in ('working', 'question') and lease_until < now()))
       and assignee_user_id is null
       and (assignee_agent_id is null or assignee_agent_id = a.id)
     order by coalesce(assignee_agent_id = a.id, false) desc, priority desc, number
     for update skip locked
     limit 1;
    if not found then
      update app.agents set listening_until = now() + interval '2 minutes' where id = a.id;
      return app.ok('{"task":null,"retry_after":30}');
    end if;
  end if;

  if t.status in ('working', 'question') then
    perform app.release(t.id, 'lease', t.holder_agent_id, null);
  end if;
  update app.tasks
     set status = 'working', holder_agent_id = a.id, fence = fence + 1,
         lease_until = now() + make_interval(secs => lease), last_beat_at = now(), silent_at = null,
         steps = '[]', steps_done = 0, step_now = null, updated_at = now()
   where id = t.id
  returning * into t;
  update app.agents set listening_until = null where id = a.id;
  perform app.log(t.workspace_id, t.id, a.id, null, 'task.claimed', jsonb_build_object('fence', t.fence));

  result := app.ok(jsonb_build_object('task', app.task_card(t.id), 'fence', t.fence::text,
                                      'lease_until', t.lease_until, 'heartbeat_every', 60));
  if p_request_id is not null then
    insert into app.receipts (agent_id, request_id, result) values (a.id, p_request_id, result);
  end if;
  return result;
end $$;

create function public.agent_heartbeat(
  p_key text, p_task text, p_fence bigint, p_steps jsonb default null, p_done integer default null,
  p_now text default null, p_lease integer default 900
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  h record;
  t app.tasks;
  ans jsonb;
begin
  if gate is not null then return gate; end if;
  select * into h from app.lock_held(a, p_task, p_fence);
  if h.error is not null then return h.error; end if;
  t := h.t;
  if p_steps is not null and (jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 20) then
    return app.err('invalid', 'steps must be a list of at most 20 short strings.');
  end if;
  update app.tasks
     set lease_until = now() + make_interval(secs => least(greatest(coalesce(p_lease, 900), 60), 3600)),
         last_beat_at = now(), silent_at = null,
         steps = coalesce(p_steps, steps),
         steps_done = least(coalesce(p_done, steps_done), jsonb_array_length(coalesce(p_steps, steps))),
         step_now = coalesce(left(p_now, 120), step_now)
   where id = t.id
  returning * into t;
  if t.steps_done <> (h.t).steps_done then
    perform app.log(t.workspace_id, t.id, a.id, null, 'task.progress',
      jsonb_build_object('done', t.steps_done, 'total', jsonb_array_length(t.steps), 'step', t.steps ->> (t.steps_done - 1)));
  end if;
  select jsonb_build_object('question', q.text, 'text', q.answer, 'by', p.name) into ans
    from app.questions q left join app.profiles p on p.id = q.answered_by
   where q.task_id = t.id and q.fence = p_fence and q.answer is not null
   order by q.answered_at desc limit 1;
  return app.ok(jsonb_strip_nulls(jsonb_build_object('lease_until', t.lease_until, 'answer', ans, 'stop', false)));
end $$;

create function public.agent_ask(p_key text, p_task text, p_fence bigint, p_question text, p_options jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  h record;
begin
  if gate is not null then return gate; end if;
  select * into h from app.lock_held(a, p_task, p_fence);
  if h.error is not null then return h.error; end if;
  if (h.t).status = 'question' then
    return app.err('already_asked', 'This task already has an open question.', 'Keep calling heartbeat; the answer arrives there.');
  end if;
  if length(trim(coalesce(p_question, ''))) not between 1 and 500
     or jsonb_typeof(coalesce(p_options, '[]')) <> 'array' or jsonb_array_length(coalesce(p_options, '[]')) > 4 then
    return app.err('invalid', 'A question is 1 to 500 characters, with at most 4 options.');
  end if;
  insert into app.questions (task_id, agent_id, fence, text, options)
  values ((h.t).id, a.id, p_fence, trim(p_question), coalesce(p_options, '[]'));
  update app.tasks set status = 'question', updated_at = now() where id = (h.t).id;
  perform app.log((h.t).workspace_id, (h.t).id, a.id, null, 'task.question',
                  jsonb_build_object('question', trim(p_question), 'options', coalesce(p_options, '[]')));
  return app.ok('{"status":"question"}');
end $$;

create function public.agent_submit(
  p_key text, p_task text, p_fence bigint, p_summary text, p_checks jsonb,
  p_changes jsonb default null, p_scope_ok boolean default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  h record;
begin
  if gate is not null then return gate; end if;
  -- A repeated submit with the same fence returns the first result.
  if exists (select 1 from app.submissions s join app.tasks t on t.id = s.task_id
             where t.workspace_id = a.workspace_id and t.number = app.parse_ref(p_task)
               and s.fence = p_fence and s.agent_id = a.id) then
    return app.ok('{"status":"review"}');
  end if;
  select * into h from app.lock_held(a, p_task, p_fence);
  if h.error is not null then return h.error; end if;
  if (h.t).status <> 'working' then
    return app.err('invalid', 'Wait for the answer to your question before you submit.');
  end if;
  if length(trim(coalesce(p_summary, ''))) not between 1 and 2000
     or jsonb_typeof(p_checks) is distinct from 'array'
     or jsonb_array_length(p_checks) not between 1 and 20
     or exists (select 1 from jsonb_array_elements(p_checks) c
                where jsonb_typeof(c) <> 'object' or c ->> 'result' is null or c ->> 'result' not in ('pass', 'fail', 'skip')
                   or length(coalesce(c ->> 'name', '')) not between 1 and 80 or length(coalesce(c ->> 'detail', '')) > 200)
     or (p_changes is not null and jsonb_typeof(p_changes) <> 'object') then
    return app.err('invalid', 'A submit needs a summary and 1 to 20 checks, each with a name and a result of pass, fail or skip.');
  end if;
  insert into app.submissions (task_id, agent_id, fence, summary, checks, changes, scope_ok)
  values ((h.t).id, a.id, p_fence, trim(p_summary), p_checks, p_changes, p_scope_ok);
  update app.tasks set status = 'review', lease_until = null, last_beat_at = null, silent_at = null,
                       step_now = null, updated_at = now()
   where id = (h.t).id;
  perform app.log((h.t).workspace_id, (h.t).id, a.id, null, 'task.submitted', jsonb_build_object(
    'fence', p_fence,
    'passed', (select count(*) from jsonb_array_elements(p_checks) c where c ->> 'result' = 'pass'),
    'total', jsonb_array_length(p_checks)));
  return app.ok('{"status":"review"}');
end $$;

create function public.agent_release(p_key text, p_task text, p_fence bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  h record;
begin
  if gate is not null then return gate; end if;
  if length(trim(coalesce(p_note, ''))) not between 1 and 1000 then
    return app.err('invalid', 'Say where you stopped and what is next, in 1 to 1000 characters.');
  end if;
  select * into h from app.lock_held(a, p_task, p_fence);
  if h.error is not null then return h.error; end if;
  perform app.release((h.t).id, 'agent', a.id, null, trim(p_note));
  return app.ok('{"status":"ready"}');
end $$;

create function public.agent_get_task(p_key text, p_task text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a app.agents := app.agent_auth(p_key);
  gate jsonb := app.agent_gate(a);
  t app.tasks;
begin
  if gate is not null then return gate; end if;
  select * into t from app.tasks where workspace_id = a.workspace_id and number = app.parse_ref(p_task);
  if not found then return app.err('not_found', 'No task ' || coalesce(p_task, '') || ' in this workspace.'); end if;
  return app.ok(jsonb_build_object('task', app.task_card(t.id) || jsonb_build_object(
    'holder', (select name from app.agents where id = t.holder_agent_id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at,
                                  'by', coalesce(g.name, p.name, 'Saathi'), 'data', e.data) order by e.id)
                         from (select * from app.events where task_id = t.id order by id desc limit 20) e
                         left join app.agents g on g.id = e.agent_id left join app.profiles p on p.id = e.user_id), '[]'))));
end $$;
