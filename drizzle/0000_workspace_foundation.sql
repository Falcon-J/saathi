CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  username varchar(80) NOT NULL CHECK (length(trim(username)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1), 'Member'), 80));
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
  summary varchar(240), target_at timestamptz, timezone text NOT NULL DEFAULT 'UTC',
  owner_user_id uuid NOT NULL REFERENCES profiles(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id), joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
ALTER TABLE workspaces ADD CONSTRAINT workspace_owner_membership
  FOREIGN KEY (id, owner_user_id) REFERENCES workspace_members(workspace_id, user_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);

CREATE TABLE workspace_invitations (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES profiles(id), invitee_email text NOT NULL CHECK (invitee_email = lower(trim(invitee_email))),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz NOT NULL, responded_at timestamptz, accepted_by_user_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitation_pending_unique ON workspace_invitations(workspace_id, invitee_email) WHERE status = 'pending';
CREATE INDEX invitation_recipient_idx ON workspace_invitations(invitee_email, status);

CREATE TABLE tasks (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL CHECK (length(trim(title)) > 0), description varchar(1000),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  bucket text CHECK (bucket IN ('today','next')), due_at timestamptz,
  estimated_minutes integer CHECK (estimated_minutes BETWEEN 1 AND 1440), assignee_user_id uuid,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, assignee_user_id) REFERENCES workspace_members(workspace_id, user_id)
);
CREATE INDEX tasks_workspace_idx ON tasks(workspace_id, created_at);

-- No workspace FK: deletion must retain the audit fact and its delivery obligation.
CREATE TABLE activity_events (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, actor_user_id uuid NOT NULL REFERENCES profiles(id),
  event_type text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_workspace_idx ON activity_events(workspace_id, created_at DESC);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0, last_error_category text
);
CREATE INDEX outbox_pending_idx ON outbox_events(created_at) WHERE published_at IS NULL;

-- Domain tables are accessed by server transactions, never the browser Data API.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profiles, workspaces, workspace_members, workspace_invitations, tasks, activity_events, outbox_events FROM anon, authenticated;
