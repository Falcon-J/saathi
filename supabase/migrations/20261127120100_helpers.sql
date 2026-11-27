-- Shared helpers. Private: they live in `app` and nobody but the owner can call them.

create function app.ok(extra jsonb default '{}') returns jsonb
language sql immutable set search_path = '' as $$ select jsonb_build_object('ok', true) || extra $$;

create function app.err(code text, message text, hint text default null, extra jsonb default '{}') returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'code', code, 'message', message)
         || case when hint is null then '{}'::jsonb else jsonb_build_object('hint', hint) end || extra
$$;

create function app.log(p_ws uuid, p_task uuid, p_agent uuid, p_user uuid, p_kind text, p_data jsonb default '{}')
returns void language sql set search_path = '' as $$
  insert into app.events (workspace_id, task_id, agent_id, user_id, kind, data)
  values (p_ws, p_task, p_agent, p_user, p_kind, p_data)
$$;

-- "SAA-14", "saa-14" or "14" → 14. Anything else → null.
create function app.parse_ref(p_ref text) returns integer
language sql immutable set search_path = '' as $$
  select case when p_ref ~ '^\s*([A-Za-z]{2,5}-)?[0-9]{1,9}\s*$'
              then regexp_replace(p_ref, '[^0-9]', '', 'g')::integer end
$$;

create function app.ref(p_task_id uuid) returns text
language sql stable set search_path = '' as $$
  select w.prefix || '-' || t.number from app.tasks t join app.workspaces w on w.id = t.workspace_id where t.id = p_task_id
$$;

create function app.new_key() returns text
language plpgsql volatile set search_path = '' as $$
declare k text := '';
begin
  while length(k) < 32 loop
    k := k || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '');
  end loop;
  return 'sk_live_' || left(k, 32);
end $$;

create function app.key_hash(p_key text) returns bytea
language sql immutable set search_path = '' as $$ select extensions.digest(p_key, 'sha256') $$;

-- What any reader (agent or person) needs to work on a task.
create function app.task_card(p_task_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'ref', w.prefix || '-' || t.number,
    'title', t.title,
    'done_when', t.done_when,
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

-- Give a held task back to Ready. Reasons: agent, lease, stopped, revoked.
create function app.release(p_task_id uuid, p_reason text, p_agent uuid, p_user uuid, p_note text default null)
returns void language plpgsql set search_path = '' as $$
declare t app.tasks;
begin
  update app.tasks
     set status = 'ready', holder_agent_id = null, lease_until = null, last_beat_at = null,
         silent_at = null, step_now = null, updated_at = now()
   where id = p_task_id and status in ('working', 'question')
  returning * into t;
  if not found then return; end if;
  update app.questions set answered_at = now() where task_id = t.id and answered_at is null;
  perform app.log(t.workspace_id, t.id, p_agent, p_user, 'task.released',
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'fence', t.fence, 'note', p_note)));
end $$;

-- Membership check for people. Raises so that nothing half-done can commit.
create function app.require_member(p_ws uuid, p_owner boolean default false) returns uuid
language plpgsql stable set search_path = '' as $$
declare r text;
begin
  select role into r from app.members where workspace_id = p_ws and user_id = auth.uid();
  if r is null or (p_owner and r <> 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create function app.find_task(p_ws uuid, p_ref text) returns uuid
language sql stable set search_path = '' as $$
  select id from app.tasks where workspace_id = p_ws and number = app.parse_ref(p_ref)
$$;
