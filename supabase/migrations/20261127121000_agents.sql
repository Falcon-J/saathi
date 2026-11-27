-- The Agents page: one read for the list, and one function per action in its pane.

-- An agent in this workspace that hasn't been revoked, locked for the change.
create function app.agent_in(p_ws uuid, p_agent uuid) returns app.agents
language sql set search_path = '' as $$
  select * from app.agents where id = p_agent and workspace_id = p_ws and revoked_at is null for update
$$;

-- Every live agent with what it holds, when it was seen, its key's last four, what it did today and lately.
create function public.agents_view(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws);
begin
  return app.ok(jsonb_build_object('agents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'client', a.client, 'host', a.host, 'max_at_once', a.max_at_once,
      'paused', a.paused_at is not null, 'seen_at', a.last_seen_at, 'listening', a.listening_until > now(), 'created_at', a.created_at,
      'holding', coalesce((select jsonb_agg(jsonb_build_object('ref', app.ref(t.id), 'title', t.title, 'silent_at', t.silent_at,
                                                               'steps_done', t.steps_done, 'steps_total', jsonb_array_length(t.steps)) order by t.number)
                            from app.tasks t where t.holder_agent_id = a.id and t.status in ('working', 'question')), '[]'),
      'key', (select jsonb_build_object('last4', k.last4, 'created_at', k.created_at, 'used_at', k.last_used_at)
                from app.agent_keys k where k.agent_id = a.id and k.revoked_at is null order by k.created_at desc limit 1),
      'done_today', (select count(*) from app.events e where e.agent_id = a.id and e.kind = 'task.approved' and e.created_at > date_trunc('day', now())),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'kind', e.kind, 'data', e.data,
                                                              'task', app.ref(e.task_id), 'me', e.user_id = me) order by e.id)
                           from (select * from app.events where agent_id = a.id order by id desc limit 6) e), '[]'))
      order by a.created_at)
    from app.agents a where a.workspace_id = p_ws and a.revoked_at is null), '[]')));
end $$;

-- A new key for an agent. The old one stops at once; the new one is returned once.
create function public.rotate_key(p_ws uuid, p_agent uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); a app.agents := app.agent_in(p_ws, p_agent); k text := app.new_key();
begin
  if a.id is null then return app.err('not_found', 'No such agent.'); end if;
  update app.agent_keys set revoked_at = now() where agent_id = a.id and revoked_at is null;
  insert into app.agent_keys (agent_id, hash, last4) values (a.id, app.key_hash(k), right(k, 4));
  perform app.log(p_ws, null, a.id, me, 'key.created', jsonb_build_object('last4', right(k, 4)));
  return app.ok(jsonb_build_object('key', k));
end $$;

-- Revoke: the agent stops at once and what it held goes back to Ready.
create function public.revoke_key(p_ws uuid, p_agent uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); a app.agents := app.agent_in(p_ws, p_agent); t uuid; freed text[] := '{}';
begin
  if a.id is null then return app.err('not_found', 'No such agent.'); end if;
  update app.agents set revoked_at = now(), listening_until = null where id = a.id;
  update app.agent_keys set revoked_at = now() where agent_id = a.id and revoked_at is null;
  for t in select id from app.tasks where holder_agent_id = a.id and status in ('working', 'question') order by number for update loop
    perform app.release(t, 'revoked', a.id, me);
    freed := freed || app.ref(t);
  end loop;
  perform app.log(p_ws, null, a.id, me, 'key.revoked', jsonb_build_object('freed', freed));
  return app.ok(jsonb_build_object('freed', freed));
end $$;

-- Pause: it finishes what it holds but takes nothing new. Resume undoes it.
create function public.pause_agent(p_ws uuid, p_agent uuid, p_paused boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); a app.agents := app.agent_in(p_ws, p_agent);
begin
  if a.id is null then return app.err('not_found', 'No such agent.'); end if;
  if (a.paused_at is not null) = p_paused then return app.ok(); end if;
  update app.agents set paused_at = case when p_paused then now() end where id = a.id;
  perform app.log(p_ws, null, a.id, me, case when p_paused then 'agent.paused' else 'agent.resumed' end, '{}');
  return app.ok();
end $$;

-- How many tasks it may hold at once, 1 to 10.
create function public.set_agent_limit(p_ws uuid, p_agent uuid, p_max integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := app.require_member(p_ws); a app.agents := app.agent_in(p_ws, p_agent);
begin
  if a.id is null then return app.err('not_found', 'No such agent.'); end if;
  if p_max is null or p_max not between 1 and 10 then return app.err('invalid', 'An agent holds 1 to 10 tasks at a time.'); end if;
  update app.agents set max_at_once = p_max where id = a.id;
  perform app.log(p_ws, null, a.id, me, 'agent.limit', jsonb_build_object('max', p_max));
  return app.ok();
end $$;

-- whoami gains each workspace's count of agents that went silent holding work, for the nav.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name,
    'avatar_url', p.avatar_url,
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'prefix', w.prefix, 'role', m.role,
                                               'needs_you', (select count(*) from app.tasks t
                                                             where t.workspace_id = w.id and t.status in ('review', 'question')),
                                               'silent', (select count(distinct t.holder_agent_id) from app.tasks t
                                                          where t.workspace_id = w.id and t.silent_at is not null
                                                            and t.status in ('working', 'question')))
                                             order by m.joined_at)
                            from app.members m join app.workspaces w on w.id = m.workspace_id
                            where m.user_id = p.id), '[]'))
  from app.profiles p where p.id = auth.uid()
$$;

grant execute on function public.agents_view(uuid), public.rotate_key(uuid, uuid), public.revoke_key(uuid, uuid),
                          public.pause_agent(uuid, uuid, boolean), public.set_agent_limit(uuid, uuid, integer) to authenticated;
