-- Saathi core schema. Tables live in the private `app` schema, which the Data API never exposes.
-- The only way in is the SQL functions in `public` (see the following migrations).

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema app;
revoke all on schema app from public, anon, authenticated;

create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now()
);

create table app.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  prefix text not null default 'SAA' check (prefix ~ '^[A-Z]{2,5}$'),
  next_number integer not null default 1 check (next_number > 0),
  created_by uuid not null references app.profiles (id),
  created_at timestamptz not null default now()
);

create table app.members (
  workspace_id uuid not null references app.workspaces (id) on delete cascade,
  user_id uuid not null references app.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_visit_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index members_user_idx on app.members (user_id);

create table app.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces (id) on delete cascade,
  email extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash bytea not null unique,
  invited_by uuid not null references app.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references app.profiles (id),
  cancelled_at timestamptz
);
create unique index invites_pending_idx on app.invites (workspace_id, email)
  where accepted_at is null and cancelled_at is null;

create table app.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  auto_name boolean not null default true,
  client text not null default 'other' check (client in ('claude-code', 'cursor', 'codex', 'other', 'demo')),
  host text check (length(host) <= 80),
  max_at_once integer not null default 2 check (max_at_once between 1 and 10),
  paused_at timestamptz,
  last_seen_at timestamptz,
  listening_until timestamptz,
  rate_window timestamptz,
  rate_count integer not null default 0,
  created_by uuid references app.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (workspace_id, name),
  unique (workspace_id, id)
);

create table app.agent_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references app.agents (id) on delete cascade,
  hash bytea not null,
  last4 text not null check (length(last4) = 4),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index agent_keys_hash_idx on app.agent_keys (hash);
create unique index agent_keys_one_active_idx on app.agent_keys (agent_id) where revoked_at is null;

create table app.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references app.workspaces (id) on delete cascade,
  number integer not null check (number > 0),
  title text not null check (length(trim(title)) between 1 and 200),
  done_when text check (length(done_when) <= 1000),
  scope text check (length(scope) <= 200),
  priority smallint not null default 0 check (priority between 0 and 4), -- none, low, normal, high, urgent
  status text not null default 'ready'
    check (status in ('waiting', 'ready', 'working', 'review', 'question', 'done')),
  assignee_agent_id uuid,
  assignee_user_id uuid,
  waits_left integer not null default 0 check (waits_left >= 0),
  holder_agent_id uuid,
  fence bigint not null default 0 check (fence >= 0),
  lease_until timestamptz,
  last_beat_at timestamptz,
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 20),
  steps_done integer not null default 0 check (steps_done >= 0),
  step_now text check (length(step_now) <= 120),
  silent_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references app.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  unique (workspace_id, number),
  unique (workspace_id, id),
  foreign key (workspace_id, assignee_agent_id) references app.agents (workspace_id, id) on delete set null (assignee_agent_id),
  foreign key (workspace_id, holder_agent_id) references app.agents (workspace_id, id) on delete set null (holder_agent_id),
  foreign key (workspace_id, assignee_user_id) references app.members (workspace_id, user_id) on delete set null (assignee_user_id),
  check (not (assignee_agent_id is not null and assignee_user_id is not null)),
  check ((status = 'waiting') = (waits_left > 0)),
  check (status not in ('working', 'question') or (holder_agent_id is not null and lease_until is not null))
);
-- next_task: ready work and ended leases, best first.
create index tasks_claimable_idx on app.tasks (workspace_id, priority desc, number)
  where status in ('ready', 'working', 'question');
create index tasks_lease_idx on app.tasks (lease_until) where status in ('working', 'question');

create table app.task_links (
  workspace_id uuid not null,
  before_id uuid not null,
  after_id uuid not null,
  created_by uuid references app.profiles (id),
  created_at timestamptz not null default now(),
  primary key (before_id, after_id),
  check (before_id <> after_id),
  foreign key (workspace_id, before_id) references app.tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, after_id) references app.tasks (workspace_id, id) on delete cascade
);
create index task_links_after_idx on app.task_links (after_id);

create table app.submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references app.tasks (id) on delete cascade,
  agent_id uuid references app.agents (id) on delete set null,
  fence bigint not null,
  summary text not null check (length(trim(summary)) between 1 and 2000),
  checks jsonb not null check (jsonb_typeof(checks) = 'array' and jsonb_array_length(checks) between 1 and 20),
  changes jsonb check (changes is null or jsonb_typeof(changes) = 'object'),
  scope_ok boolean,
  created_at timestamptz not null default now(),
  unique (task_id, fence)
);

create table app.questions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references app.tasks (id) on delete cascade,
  agent_id uuid references app.agents (id) on delete set null,
  fence bigint not null,
  text text not null check (length(trim(text)) between 1 and 500),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 4),
  answer text check (length(answer) <= 1000),
  answered_by uuid references app.profiles (id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index questions_open_idx on app.questions (task_id) where answered_at is null;

create table app.events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references app.workspaces (id) on delete cascade,
  task_id uuid references app.tasks (id) on delete set null,
  agent_id uuid references app.agents (id) on delete set null,
  user_id uuid references app.profiles (id) on delete set null,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_workspace_idx on app.events (workspace_id, id desc);
create index events_task_idx on app.events (task_id, id desc) where task_id is not null;

create table app.receipts (
  agent_id uuid not null references app.agents (id) on delete cascade,
  request_id text not null check (length(request_id) between 1 and 100),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, request_id)
);

-- Defence in depth: RLS on, no policies, no grants. Only SECURITY DEFINER functions reach these rows.
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','members','invites','agents','agent_keys','tasks',
                           'task_links','submissions','questions','events','receipts'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on app.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Every new auth user gets a profile: name from GitHub metadata, else the email's local part.
create function app.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.profiles (id, name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(trim(new.raw_user_meta_data ->> 'user_name'), ''),
                  split_part(new.email, '@', 1), 'Member'), 80),
    case when new.raw_user_meta_data ->> 'avatar_url' ~ '^https://' then new.raw_user_meta_data ->> 'avatar_url' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.on_auth_user_created();
