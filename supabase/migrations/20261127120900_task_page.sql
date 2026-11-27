-- The full task page, the new-task dialog and catch-up.

-- Details: links, files or context the agent should read. Agents get them on the task card.
alter table app.tasks add column details text check (length(details) <= 4000);

create or replace function app.task_card(p_task_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ref', w.prefix || '-' || t.number,
    'title', t.title,
    'done_when', t.done_when,
    'details', t.details,
    'scope', t.scope,
    'priority', (array['none','low','normal','high','urgent'])[t.priority + 1],
    'status', t.status,
    'waits_on', coalesce((select jsonb_agg(w.prefix || '-' || b.number order by b.number)
                          from app.task_links l join app.tasks b on b.id = l.before_id
                          where l.after_id = t.id and b.status <> 'done'), '[]'),
    'unlocks', coalesce((select jsonb_agg(w.prefix || '-' || a.number order by a.number)
                         from app.task_links l join app.tasks a on a.id = l.after_id
                         where l.before_id = t.id), '[]'),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.data ->> 'note', 'at', e.created_at) order by e.id)
                          from (select * from app.events
                                where task_id = t.id and kind in ('task.sent_back', 'task.released') and data ? 'note'
                                order by id desc limit 5) e), '[]'),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('question', q.text, 'answer', q.answer) order by q.created_at)
                         from (select * from app.questions where task_id = t.id and answer is not null
                               order by created_at desc limit 5) q), '[]')
  )
  from app.tasks t join app.workspaces w on w.id = t.workspace_id
  where t.id = p_task_id
$$;

-- create_task gains p_details, so the old signature goes.
drop function public.create_task(uuid, text, text, text, smallint, uuid, boolean, text[]);
create function public.create_task(
  p_ws uuid, p_title text, p_done_when text default null, p_scope text default null, p_priority smallint default 0,
  p_assignee_agent uuid default null, p_assign_me boolean default false, p_waits_on text[] default '{}', p_details text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); num int; tid uuid; ref text; before_id uuid; r jsonb;
begin
  if length(trim(coalesce(p_title, ''))) not between 1 and 200 then
    return app.err('invalid', 'A title is 1 to 200 characters.');
  end if;
  if length(p_details) > 4000 then return app.err('invalid', 'Details are at most 4000 characters.'); end if;
  if p_assignee_agent is not null and not exists (select 1 from app.agents where id = p_assignee_agent and workspace_id = p_ws) then
    return app.err('not_found', 'No such agent in this workspace.');
  end if;
  foreach ref in array coalesce(p_waits_on, '{}') loop
    if app.find_task(p_ws, ref) is null then return app.err('not_found', 'No task ' || ref || ' in this workspace.'); end if;
  end loop;
  update app.workspaces set next_number = next_number + 1 where id = p_ws returning next_number - 1 into num;
  insert into app.tasks (workspace_id, number, title, done_when, details, scope, priority, assignee_agent_id, assignee_user_id, created_by)
  values (p_ws, num, trim(p_title), nullif(trim(p_done_when), ''), nullif(trim(p_details), ''), nullif(trim(p_scope), ''),
          coalesce(p_priority, 0), p_assignee_agent, case when p_assign_me then me end, me)
  returning id into tid;
  perform app.log(p_ws, tid, null, me, 'task.created', '{}');
  foreach ref in array coalesce(p_waits_on, '{}') loop
    before_id := app.find_task(p_ws, ref);
    r := app.link(p_ws, before_id, tid, me);
    if not (r ->> 'ok')::boolean then raise exception '%', r ->> 'message' using errcode = 'P0001'; end if;
  end loop;
  return app.ok(jsonb_build_object('ref', app.ref(tid)));
end $$;

-- The pane and the full page: everything Home's pane had, plus details, steps, history and when it was made.
create or replace function public.task_view(p_ws uuid, p_task text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks;
begin
  select * into t from app.tasks where id = app.find_task(p_ws, p_task);
  if t.id is null then return app.err('not_found', 'No task ' || coalesce(p_task, '') || '.'); end if;
  return app.ok(jsonb_build_object('task', app.task_card(t.id) || jsonb_build_object(
    'group', app.group_of(t.status),
    'agent', (select name from app.agents a where a.id = coalesce(t.holder_agent_id, t.assignee_agent_id)),
    'steps', t.steps, 'steps_done', t.steps_done, 'steps_total', jsonb_array_length(t.steps), 'step_now', t.step_now,
    'created_at', t.created_at, 'updated_at', t.updated_at, 'done_at', t.done_at,
    'approved_by', (select p.name from app.events e join app.profiles p on p.id = e.user_id
                     where e.task_id = t.id and e.kind = 'task.approved' order by e.id desc limit 1),
    'review', case when t.status = 'review' then (
      select jsonb_build_object('summary', s.summary, 'at', s.created_at, 'scope_ok', s.scope_ok,
               'passed', (select count(*) from jsonb_array_elements(s.checks) c where c ->> 'result' = 'pass'),
               'total', jsonb_array_length(s.checks), 'changes', s.changes)
        from app.submissions s where s.task_id = t.id order by s.created_at desc limit 1) end,
    'question', case when t.status = 'question' then (
      select jsonb_build_object('text', q.text, 'options', q.options, 'at', q.created_at)
        from app.questions q where q.task_id = t.id and q.answered_at is null) end,
    -- The last 30 events, oldest first. Progress is shown as steps instead.
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'kind', e.kind, 'data', e.data,
                           'agent', (select name from app.agents a where a.id = e.agent_id),
                           'by', (select name from app.profiles p where p.id = e.user_id), 'me', e.user_id = me) order by e.id)
                         from (select * from app.events where task_id = t.id and kind <> 'task.progress'
                               order by id desc limit 30) e), '[]'),
    'before', app.neighbour(t.id, true),
    'after', app.neighbour(t.id, false))));
end $$;

-- Home gains the catch-up line (done and unlocked since your last visit) and the agents for the new-task dialog.
create or replace function public.home_view(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); seen timestamptz;
begin
  select last_visit_at into seen from app.members where workspace_id = p_ws and user_id = me;
  return (
    with t as (
      select t.*, w.prefix || '-' || t.number as ref, app.group_of(t.status) as grp
        from app.tasks t join app.workspaces w on w.id = t.workspace_id
       where t.workspace_id = p_ws and (t.status <> 'done' or t.done_at > now() - interval '24 hours')
    )
    select jsonb_build_object(
      'workspace', (select jsonb_build_object('id', id, 'name', name) from app.workspaces where id = p_ws),
      'since', jsonb_build_object('at', seen,
        'done', (select count(*) from app.tasks where workspace_id = p_ws and done_at > seen),
        'unlocked', (select count(*) from app.events where workspace_id = p_ws and kind = 'task.unlocked' and created_at > seen)),
      'agents', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name)
                          from app.agents a where a.workspace_id = p_ws), '[]'),
      'tasks', coalesce(jsonb_agg(jsonb_build_object(
        'ref', t.ref, 'title', t.title, 'group', t.grp, 'status', t.status,
        'agent', (select name from app.agents a where a.id = coalesce(t.holder_agent_id, t.assignee_agent_id)),
        'steps_done', t.steps_done, 'steps_total', jsonb_array_length(t.steps),
        'waits_on', case when t.status = 'waiting' then app.neighbour(t.id, true) ->> 'ref' end,
        'done_at', t.done_at, 'updated_at', t.updated_at)
        order by array_position(array['you', 'work', 'wait', 'done'], t.grp),
                 case when t.grp in ('you', 'done') then coalesce(t.done_at, t.updated_at) end desc nulls last, t.number), '[]'))
    from t
  );
end $$;

-- Catch up or dismiss: what happened so far counts as seen.
create function public.mark_visit(p_ws uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws);
begin
  update app.members set last_visit_at = now() where workspace_id = p_ws and user_id = me;
  return app.ok();
end $$;

grant execute on function public.create_task(uuid, text, text, text, smallint, uuid, boolean, text[], text),
                          public.mark_visit(uuid) to authenticated;
