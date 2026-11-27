-- First run: every new person gets a workspace with a demo agent and two linked tasks.

-- Called right after sign-in. Safe to call again: a person who already belongs to a workspace gets that one back.
create function public.bootstrap_workspace() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  who app.profiles;
  ws uuid;
  demo uuid;
  first uuid;
  second uuid;
begin
  -- Lock the profile so two tabs finishing sign-in at once can't make two workspaces.
  select * into who from app.profiles where id = me for update;
  if who.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select workspace_id into ws from app.members where user_id = me order by joined_at limit 1;
  if ws is not null then return app.ok(jsonb_build_object('workspace_id', ws, 'created', false)); end if;

  insert into app.workspaces (name, next_number, created_by)
  values (left(who.name, 48) || '''s workspace', 3, me) returning id into ws;
  insert into app.members (workspace_id, user_id, role) values (ws, me, 'owner');
  -- Its key is issued when the demo starts, so no secret exists until something uses it.
  insert into app.agents (workspace_id, name, auto_name, client, max_at_once, created_by)
  values (ws, 'demo-agent', false, 'demo', 1, me) returning id into demo;
  insert into app.tasks (workspace_id, number, title, done_when, assignee_agent_id, created_by)
  values (ws, 1, 'Fix the typo in README', 'README.md has no spelling mistakes.', demo, me) returning id into first;
  insert into app.tasks (workspace_id, number, title, done_when, assignee_agent_id, created_by)
  values (ws, 2, 'Add a CHANGELOG entry', 'CHANGELOG.md lists the README fix.', demo, me) returning id into second;
  perform app.log(ws, null, null, me, 'workspace.created', '{}');
  perform app.log(ws, first, null, me, 'task.created', '{}');
  perform app.log(ws, second, null, me, 'task.created', '{}');
  perform app.link(ws, first, second, me);
  return app.ok(jsonb_build_object('workspace_id', ws, 'created', true));
end $$;

-- Who is signed in, and the workspaces they belong to.
create function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name,
    'avatar_url', p.avatar_url,
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'prefix', w.prefix, 'role', m.role)
                                             order by m.joined_at)
                            from app.members m join app.workspaces w on w.id = m.workspace_id
                            where m.user_id = p.id), '[]'))
  from app.profiles p where p.id = auth.uid()
$$;

grant execute on function public.bootstrap_workspace() to authenticated;
grant execute on function public.whoami() to authenticated;
