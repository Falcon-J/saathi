-- Postgres grants EXECUTE on every new function to PUBLIC by default, and a per-schema
-- "alter default privileges" can't take that back. Revoke it globally, and from the two
-- functions that were created with it.
alter default privileges revoke execute on functions from public;
revoke execute on function public.bootstrap_workspace(), public.whoami() from public;
