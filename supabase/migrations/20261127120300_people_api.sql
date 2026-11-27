-- The people API: what buttons in the app call, as the signed-in user (role authenticated).
-- Page reads come with each page's PR; this migration is the task state machine.

-- Add "before → after" (after waits on before). Caller holds no locks yet.
create function app.link(p_ws uuid, p_before uuid, p_after uuid, p_user uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare b app.tasks; f app.tasks; path text[]; n int;
begin
  -- Lock both rows in a fixed order so two people linking the same pair can't deadlock.
  perform 1 from app.tasks where id in (p_before, p_after) order by id for update;
  select * into b from app.tasks where id = p_before and workspace_id = p_ws;
  select * into f from app.tasks where id = p_after and workspace_id = p_ws;
  if b.id is null or f.id is null then return app.err('not_found', 'Both tasks must be in this workspace.'); end if;
  if b.id = f.id then return app.err('would_loop', 'A task can''t wait on itself.'); end if;
  if f.status not in ('waiting', 'ready') then
    return app.err('started', app.ref(f.id) || ' has already started, so it can''t wait on more work.');
  end if;
  -- Loop check: can we already walk from `after` to `before`?
  with recursive walk(id, trail) as (
    select f.id, array[f.id]
    union all
    select l.after_id, w.trail || l.after_id
      from app.task_links l join walk w on l.before_id = w.id
     where not l.after_id = any (w.trail)
  )
  select array(select app.ref(x) from unnest(b.id || walk.trail) with ordinality as u(x, ord) order by ord)
    into path from walk where walk.id = b.id limit 1;
  if path is not null then
    return app.err('would_loop', 'That link would make a loop: ' || array_to_string(path, ' → ') || '.',
                   'Remove one of the links in the loop first.', jsonb_build_object('path', to_jsonb(path)));
  end if;
  select count(*) into n from app.task_links where after_id = f.id or before_id = f.id;
  if n >= 50 then
    return app.err('too_many_links', app.ref(f.id) || ' already has 50 links, the most a task can have.',
                   'Split the work into smaller tasks.');
  end if;
  insert into app.task_links (workspace_id, before_id, after_id, created_by)
  values (p_ws, b.id, f.id, p_user) on conflict do nothing;
  if found and b.status <> 'done' then
    update app.tasks set waits_left = waits_left + 1, status = 'waiting', updated_at = now() where id = f.id;
  end if;
  if found then
    perform app.log(p_ws, f.id, null, p_user, 'task.linked', jsonb_build_object('waits_on', app.ref(b.id)));
  end if;
  return app.ok();
end $$;

create function public.create_task(
  p_ws uuid, p_title text, p_done_when text default null, p_scope text default null, p_priority smallint default 0,
  p_assignee_agent uuid default null, p_assign_me boolean default false, p_waits_on text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); num int; tid uuid; ref text; before_id uuid; r jsonb;
begin
  if length(trim(coalesce(p_title, ''))) not between 1 and 200 then
    return app.err('invalid', 'A title is 1 to 200 characters.');
  end if;
  foreach ref in array coalesce(p_waits_on, '{}') loop
    if app.find_task(p_ws, ref) is null then return app.err('not_found', 'No task ' || ref || ' in this workspace.'); end if;
  end loop;
  update app.workspaces set next_number = next_number + 1 where id = p_ws returning next_number - 1 into num;
  insert into app.tasks (workspace_id, number, title, done_when, scope, priority, assignee_agent_id, assignee_user_id, created_by)
  values (p_ws, num, trim(p_title), nullif(trim(p_done_when), ''), nullif(trim(p_scope), ''), coalesce(p_priority, 0),
          p_assignee_agent, case when p_assign_me then me end, me)
  returning id into tid;
  perform app.log(p_ws, tid, null, me, 'task.created', '{}');
  foreach ref in array coalesce(p_waits_on, '{}') loop
    before_id := app.find_task(p_ws, ref);
    r := app.link(p_ws, before_id, tid, me);
    if not (r ->> 'ok')::boolean then raise exception '%', r ->> 'message' using errcode = 'P0001'; end if;
  end loop;
  return app.ok(jsonb_build_object('ref', app.ref(tid)));
end $$;

create function public.link_tasks(p_ws uuid, p_before text, p_after text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws);
begin
  return app.link(p_ws, app.find_task(p_ws, p_before), app.find_task(p_ws, p_after), me);
end $$;

create function public.unlink_tasks(p_ws uuid, p_before text, p_after text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); b app.tasks; f app.tasks;
begin
  perform 1 from app.tasks where id in (app.find_task(p_ws, p_before), app.find_task(p_ws, p_after)) order by id for update;
  select * into b from app.tasks where id = app.find_task(p_ws, p_before);
  select * into f from app.tasks where id = app.find_task(p_ws, p_after);
  delete from app.task_links where before_id = b.id and after_id = f.id;
  if not found then return app.err('not_found', 'Those tasks aren''t linked.'); end if;
  if b.status <> 'done' then
    update app.tasks set waits_left = waits_left - 1,
                         status = case when waits_left = 1 then 'ready' else status end, updated_at = now()
     where id = f.id;
  end if;
  perform app.log(p_ws, f.id, null, me, 'task.unlinked', jsonb_build_object('waits_on', app.ref(b.id)));
  return app.ok();
end $$;

create function public.approve_task(p_ws uuid, p_task text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks; unlocked jsonb;
begin
  select * into t from app.tasks where id = app.find_task(p_ws, p_task) for update;
  if t.id is null then return app.err('not_found', 'No task ' || p_task || '.'); end if;
  if t.status <> 'review' then return app.err('not_in_review', app.ref(t.id) || ' isn''t waiting for review.'); end if;
  update app.tasks set status = 'done', done_at = now(), version = version + 1, updated_at = now() where id = t.id;
  perform app.log(p_ws, t.id, t.holder_agent_id, me, 'task.approved', '{}');
  with u as (
    update app.tasks c
       set waits_left = c.waits_left - 1,
           status = case when c.waits_left = 1 then 'ready' else c.status end,
           updated_at = now()
      from app.task_links l
     where l.before_id = t.id and c.id = l.after_id and c.waits_left > 0
    returning c.id, c.status
  )
  select coalesce(jsonb_agg(app.ref(id)), '[]') into unlocked from u where status = 'ready';
  insert into app.events (workspace_id, task_id, user_id, kind, data)
  select p_ws, app.find_task(p_ws, r), null, 'task.unlocked', jsonb_build_object('by', app.ref(t.id))
    from jsonb_array_elements_text(unlocked) r;
  return app.ok(jsonb_build_object('unlocked', unlocked));
end $$;

create function public.send_back_task(p_ws uuid, p_task text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks;
begin
  if length(trim(coalesce(p_note, ''))) not between 1 and 1000 then
    return app.err('invalid', 'Tell the agent what to change, in 1 to 1000 characters.');
  end if;
  select * into t from app.tasks where id = app.find_task(p_ws, p_task) for update;
  if t.id is null then return app.err('not_found', 'No task ' || p_task || '.'); end if;
  if t.status <> 'review' then return app.err('not_in_review', app.ref(t.id) || ' isn''t waiting for review.'); end if;
  update app.tasks set status = 'ready', assignee_agent_id = coalesce(t.holder_agent_id, t.assignee_agent_id),
                       holder_agent_id = null, version = version + 1, updated_at = now()
   where id = t.id;
  perform app.log(p_ws, t.id, t.holder_agent_id, me, 'task.sent_back', jsonb_build_object('note', trim(p_note)));
  return app.ok();
end $$;

create function public.answer_question(p_ws uuid, p_task text, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks;
begin
  if length(trim(coalesce(p_answer, ''))) not between 1 and 1000 then
    return app.err('invalid', 'An answer is 1 to 1000 characters.');
  end if;
  select * into t from app.tasks where id = app.find_task(p_ws, p_task) for update;
  if t.id is null then return app.err('not_found', 'No task ' || p_task || '.'); end if;
  if t.status <> 'question' then return app.err('no_question', app.ref(t.id) || ' has no open question.'); end if;
  update app.questions set answer = trim(p_answer), answered_by = me, answered_at = now()
   where task_id = t.id and answered_at is null;
  update app.tasks set status = 'working', updated_at = now() where id = t.id;
  perform app.log(p_ws, t.id, t.holder_agent_id, me, 'task.answered', jsonb_build_object('answer', trim(p_answer)));
  return app.ok();
end $$;

-- "Stop agent" on a working task and "Release now" on a silent one.
create function public.release_task(p_ws uuid, p_task text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks;
begin
  select * into t from app.tasks where id = app.find_task(p_ws, p_task) for update;
  if t.id is null then return app.err('not_found', 'No task ' || p_task || '.'); end if;
  if t.status not in ('working', 'question') then return app.err('not_held', app.ref(t.id) || ' isn''t held by an agent.'); end if;
  perform app.release(t.id, 'stopped', t.holder_agent_id, me);
  return app.ok();
end $$;

-- Make an agent and its key. The key is returned once and only its hash is kept.
create function public.create_agent(p_ws uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); k text := app.new_key(); aid uuid; nm text; n int := 1;
begin
  loop
    nm := 'agent-' || n;
    exit when not exists (select 1 from app.agents where workspace_id = p_ws and name = nm);
    n := n + 1;
  end loop;
  insert into app.agents (workspace_id, name, created_by) values (p_ws, nm, me) returning id into aid;
  insert into app.agent_keys (agent_id, hash, last4) values (aid, app.key_hash(k), right(k, 4));
  perform app.log(p_ws, null, aid, me, 'key.created', jsonb_build_object('last4', right(k, 4)));
  return app.ok(jsonb_build_object('agent_id', aid, 'name', nm, 'key', k));
end $$;
