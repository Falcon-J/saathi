-- Home and the task pane: one read for the list, one for the open task.

-- Which Home group a status belongs to: needs you, working, waiting or done.
create function app.group_of(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case when p_status in ('review', 'question') then 'you' when p_status = 'working' then 'work'
              when p_status in ('waiting', 'ready') then 'wait' else 'done' end
$$;

-- The first open task this one waits on, or the first task it unlocks.
create function app.neighbour(p_task uuid, p_before boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('ref', w.prefix || '-' || o.number, 'title', o.title, 'group', app.group_of(o.status))
    from app.task_links l
    join app.tasks o on o.id = case when p_before then l.before_id else l.after_id end
    join app.workspaces w on w.id = o.workspace_id
   where case when p_before then l.after_id = p_task and o.status <> 'done' else l.before_id = p_task end
   order by o.number limit 1
$$;

-- Every open task, plus what was done in the last 24 hours, in Home's order.
create function public.home_view(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws);
begin
  return (
    with t as (
      select t.*, w.prefix || '-' || t.number as ref, app.group_of(t.status) as grp, w.name as ws_name
        from app.tasks t join app.workspaces w on w.id = t.workspace_id
       where t.workspace_id = p_ws and (t.status <> 'done' or t.done_at > now() - interval '24 hours')
    )
    select jsonb_build_object(
      'workspace', (select jsonb_build_object('id', id, 'name', name) from app.workspaces where id = p_ws),
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

-- One task with what its pane shows: the proof to review, the open question, progress, and its neighbours.
create function public.task_view(p_ws uuid, p_task text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); t app.tasks;
begin
  select * into t from app.tasks where id = app.find_task(p_ws, p_task);
  if t.id is null then return app.err('not_found', 'No task ' || coalesce(p_task, '') || '.'); end if;
  return app.ok(jsonb_build_object('task', app.task_card(t.id) || jsonb_build_object(
    'group', app.group_of(t.status),
    'agent', (select name from app.agents a where a.id = coalesce(t.holder_agent_id, t.assignee_agent_id)),
    'steps_done', t.steps_done, 'steps_total', jsonb_array_length(t.steps), 'step_now', t.step_now,
    'updated_at', t.updated_at, 'done_at', t.done_at,
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
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at,
                       'text', case e.kind when 'task.claimed' then 'Started' else e.data ->> 'step' end) order by e.id)
                     from (select * from app.events where task_id = t.id and kind in ('task.claimed', 'task.progress')
                           order by id desc limit 6) e), '[]'),
    'before', app.neighbour(t.id, true),
    'after', app.neighbour(t.id, false))));
end $$;

-- whoami gains each workspace's "needs you" count for the nav.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name,
    'avatar_url', p.avatar_url,
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'prefix', w.prefix, 'role', m.role,
                                               'needs_you', (select count(*) from app.tasks t
                                                             where t.workspace_id = w.id and t.status in ('review', 'question')))
                                             order by m.joined_at)
                            from app.members m join app.workspaces w on w.id = m.workspace_id
                            where m.user_id = p.id), '[]'))
  from app.profiles p where p.id = auth.uid()
$$;

grant execute on function public.home_view(uuid), public.task_view(uuid, text) to authenticated;
