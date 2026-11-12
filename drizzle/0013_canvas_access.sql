CREATE TABLE canvas_resources (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  parent_id uuid,
  kind text NOT NULL CHECK (kind IN ('organization','space','section','workspace')),
  name varchar(100),
  workspace_id uuid UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  policy_mode text NOT NULL CHECK (policy_mode IN ('inherit','restricted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  CHECK ((kind='organization' AND parent_id IS NULL AND organization_id=id AND policy_mode='restricted') OR (kind<>'organization' AND parent_id IS NOT NULL)),
  CHECK ((kind='workspace' AND workspace_id IS NOT NULL AND name IS NULL) OR (kind<>'workspace' AND workspace_id IS NULL AND name IS NOT NULL AND length(trim(name))>0)),
  FOREIGN KEY (organization_id,parent_id) REFERENCES canvas_resources(organization_id,id) DEFERRABLE INITIALLY IMMEDIATE
);
--> statement-breakpoint
CREATE TABLE canvas_organizations (
  id uuid PRIMARY KEY REFERENCES canvas_resources(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE canvas_resources ADD CONSTRAINT canvas_resource_organization_fk
  FOREIGN KEY (organization_id) REFERENCES canvas_organizations(id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX canvas_resources_parent_idx ON canvas_resources(organization_id,parent_id);
--> statement-breakpoint
CREATE TABLE canvas_organization_members (
  organization_id uuid NOT NULL REFERENCES canvas_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id)
);
CREATE INDEX canvas_organization_members_actor_idx ON canvas_organization_members(user_id,organization_id) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE canvas_groups (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES canvas_organizations(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL CHECK (length(trim(name))>0),
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  UNIQUE (organization_id,id)
);
CREATE TABLE canvas_group_members (
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (organization_id,group_id,user_id),
  FOREIGN KEY (organization_id,group_id) REFERENCES canvas_groups(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,user_id) REFERENCES canvas_organization_members(organization_id,user_id) ON DELETE CASCADE
);
CREATE INDEX canvas_group_members_actor_idx ON canvas_group_members(user_id,organization_id) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE canvas_resource_grants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  user_id uuid,
  group_id uuid,
  capabilities text[] NOT NULL CHECK (capabilities @> ARRAY['read']::text[] AND capabilities <@ ARRAY['read','create','edit','comment','manage','delete']::text[] AND cardinality(capabilities) BETWEEN 1 AND 6 AND array_position(capabilities,NULL) IS NULL),
  expires_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  CHECK (num_nonnulls(user_id,group_id)=1),
  FOREIGN KEY (organization_id,resource_id) REFERENCES canvas_resources(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,user_id) REFERENCES canvas_organization_members(organization_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,group_id) REFERENCES canvas_groups(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX canvas_grants_resource_idx ON canvas_resource_grants(resource_id) WHERE revoked_at IS NULL;
CREATE INDEX canvas_grants_user_idx ON canvas_resource_grants(user_id,organization_id) WHERE revoked_at IS NULL;
CREATE INDEX canvas_grants_group_idx ON canvas_resource_grants(group_id,organization_id) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE canvas_references (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  canvas_resource_id uuid NOT NULL,
  target_resource_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  FOREIGN KEY (organization_id,canvas_resource_id) REFERENCES canvas_resources(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,target_resource_id) REFERENCES canvas_resources(organization_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE canvas_access_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES canvas_organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  resource_id uuid REFERENCES canvas_resources(id) ON DELETE SET NULL,
  operation text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE canvas_access_commands (
  actor_user_id uuid NOT NULL REFERENCES profiles(id),
  command_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES canvas_organizations(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id,command_id)
);
--> statement-breakpoint
CREATE FUNCTION canvas_check_canonical_resource() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parent_kind text; parent_organization uuid; ancestor_count integer; reached_root boolean;
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.organization_id,NEW.parent_id,NEW.kind,NEW.workspace_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.parent_id,OLD.kind,OLD.workspace_id) THEN
    RAISE EXCEPTION 'Canonical containment is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='organization' THEN RETURN NEW; END IF;
  SELECT kind,organization_id INTO parent_kind,parent_organization FROM canvas_resources WHERE id=NEW.parent_id FOR KEY SHARE;
  IF parent_kind IS NULL OR parent_organization<>NEW.organization_id
    OR (NEW.kind='space' AND parent_kind<>'organization')
    OR (NEW.kind='section' AND parent_kind NOT IN ('organization','space','section'))
    OR (NEW.kind='workspace' AND parent_kind NOT IN ('space','section')) THEN
    RAISE EXCEPTION 'Invalid canonical parent' USING ERRCODE='23514';
  END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id,parent_id,ARRAY[id] AS path,0 AS depth FROM canvas_resources WHERE id=NEW.parent_id
    UNION ALL SELECT p.id,p.parent_id,a.path||p.id,a.depth+1 FROM ancestors a
      JOIN canvas_resources p ON p.id=a.parent_id WHERE a.depth<16 AND NOT p.id=ANY(a.path)
  ) SELECT max(depth)+1,bool_or(parent_id IS NULL) INTO ancestor_count,reached_root FROM ancestors;
  IF ancestor_count>16 OR NOT reached_root THEN RAISE EXCEPTION 'Canonical hierarchy exceeds supported depth' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION canvas_check_canonical_resource() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER canvas_resource_hierarchy BEFORE INSERT OR UPDATE ON canvas_resources FOR EACH ROW EXECUTE FUNCTION canvas_check_canonical_resource();
--> statement-breakpoint
ALTER TABLE canvas_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_resource_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_access_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON canvas_resources,canvas_organizations,canvas_organization_members,canvas_groups,canvas_group_members,
  canvas_resource_grants,canvas_references,canvas_access_events,canvas_access_commands FROM anon,authenticated;
