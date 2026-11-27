-- Live updates, the background sweep, and who may call what.

-- Every event is broadcast to its workspace's private channel in the same transaction.
-- Clients treat it as a nudge and re-read; the database stays the only source of truth.
create function app.broadcast_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'kind', new.kind, 'task_id', new.task_id),
    new.kind, 'ws:' || new.workspace_id::text, true);
  return null;
end $$;
create trigger events_broadcast after insert on app.events
  for each row execute function app.broadcast_event();

-- Only members may join "ws:<workspace id>". Nobody may send on it from a client.
create function public.can_join_channel(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.members m
                  where m.user_id = auth.uid() and 'ws:' || m.workspace_id::text = p_topic)
$$;
create policy "members receive their workspace channel" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_join_channel((select realtime.topic())));

-- The sweep makes "Silent" and "its lease ended" show up on time.
-- Correctness never depends on it: next_task treats an ended lease as free, and fences stop stale writes.
create function app.sweep() returns void
language plpgsql set search_path = '' as $$
declare t app.tasks;
begin
  for t in select * from app.tasks
            where status in ('working', 'question') and silent_at is null
              and last_beat_at < now() - interval '3 minutes' and lease_until >= now()
            for update skip locked loop
    update app.tasks set silent_at = now() where id = t.id;
    perform app.log(t.workspace_id, t.id, t.holder_agent_id, null, 'task.silent', jsonb_build_object('fence', t.fence));
  end loop;
  for t in select * from app.tasks
            where status in ('working', 'question') and lease_until < now()
            for update skip locked loop
    perform app.release(t.id, 'lease', t.holder_agent_id, null);
  end loop;
  delete from app.receipts where created_at < now() - interval '24 hours';
end $$;

create extension if not exists pg_cron;
select cron.schedule('saathi-sweep', '30 seconds', 'select app.sweep()');

-- Access. Supabase grants execute on new public functions to anon and authenticated by default; take that back.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname like 'agent\_%' loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname in
              ('create_task', 'link_tasks', 'unlink_tasks', 'approve_task', 'send_back_task',
               'answer_question', 'release_task', 'create_agent', 'can_join_channel') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Functions added by later migrations start closed too; each one is granted on purpose.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
