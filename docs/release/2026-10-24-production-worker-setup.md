# Production worker setup: synchronous HTTP proposal

## Current purpose

Invitation delivery has moved to Saathi's inbox and copyable recipient-bound links. It does not need this scheduler, Resend, or a mail domain. The proposed worker below remains relevant only to realtime outbox retries and bounded retention; the user has not approved the `http` replacement and no production scheduler changes have occurred.

## Verified boundary

The user approved enabling `pg_cron` and `pg_net`, privately provisioning a Vault bearer, and scheduling the existing worker's POST every minute. Security review rejected the queued-header boundary of `pg_net`. The replacement below uses `pg_cron` and synchronous `http`; **replacement approval is required before installing extensions or provisioning the bearer**. This does not authorize business fixtures, a billing upgrade, or public domain reassignment in this setup step.

- Production Supabase project: `uccncldirwhlyrhxwbwt`; database system identifier: `7678069749886157684`.
- Fixed worker URL: `https://saathi-ten.vercel.app/api/internal/outbox`.
- Vercel project: `prj_yhdUeTdqNXCLtwVcbSnjVUZmgl5u`; team: `omkarjawalikar04-gmailcoms-projects`.
- `pg_cron` 1.6.4 and `http` 1.6 are available but not installed. Vault 0.3.1 is installed. Browser roles lack Vault schema usage and decrypted-secret SELECT privileges.

Database authentication stays with the authorized, project-bound Supabase connector. No production database password needs to be configured locally. Generate the new bearer inside Vault, then transfer only that exact approved secret internally to the authenticated Vercel CLI through stdin. Do not retrieve credentials from CLI token storage, bypass Vercel Secret readback restrictions, or return secret-bearing tool results to chat or diagnostics. This document records the setup procedure, not proof that activation has occurred.

## Security review hold

**Do not use `pg_net` for this bearer.** Supabase documents that database roles able to connect can read plaintext headers in `pg_net`'s queued requests, and that persistently changing those grants is not supported. Vault protects the stored secret but does not protect the Authorization header after a request is queued.

Reference: [Queued request header visibility](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357).

### Synchronous HTTP alternative: approval pending

The available, uninstalled `http` extension is version 1.6. Its synchronous request avoids the `pg_net` header queue, but the exact version has two relevant constraints:

- It logs complete optional request headers at `DEBUG2`. Production currently has `log_min_messages=warning`, `client_min_messages=notice`, `log_statement=ddl`, and `pgaudit.log=none`, so those header messages are suppressed under the inspected settings. The job sets `client_min_messages=warning` and verifies the server setting before reading Vault. It never attempts to modify the privileged server logging setting. Never enable DEBUG2 for this job.
- It follows up to five redirects for POST and does not expose `CURLOPT_FOLLOWLOCATION` or `CURLOPT_UNRESTRICTED_AUTH` through its supported SQL setters. Libcurl has withheld custom Authorization headers from other hosts by default since 7.58.0, but its runtime version is not verified here. The architect accepted the current fixed, verified HTTPS endpoint as an already trusted bearer recipient. Redirect suppression is not claimed. Re-review this trust decision if the endpoint or redirect behavior changes.

Version 1.6 supports `http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000')`, `http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '5')` (seconds), `CURLOPT_SSL_VERIFYPEER=1`, and `CURLOPT_SSL_VERIFYHOST=2`. Use those native functions, not the newer unsupported `CURLOPT_CONNECTTIMEOUT_MS`. A synchronous timeout can leave the remote worker processing after the database call ends; it does not establish zero downstream overlap.

No replacement provisioning SQL or production configuration has been applied. After replacement approval, install the extensions, inspect their actual signatures and effective privileges, and stop before provisioning if the checks below fail. The cron command executes as `postgres`; it adds no `SECURITY DEFINER` wrapper or new application authentication protocol.

Sources: [Supabase HTTP extension](https://supabase.com/docs/guides/database/extensions/http), [exact pgsql-http 1.6 source](https://github.com/pramsey/pgsql-http/blob/v1.6.0/http.c), [libcurl custom-header security](https://curl.se/libcurl/c/CURLOPT_HTTPHEADER.html), [pg_cron execution behavior](https://github.com/citusdata/pg_cron).

## Provisioning sequence

1. Use the authenticated Supabase connector bound to `uccncldirwhlyrhxwbwt` and verify this query's exact system identifier before any mutation:

   ```sql
   SELECT current_database(), (pg_control_system()).system_identifier::text;
   ```

2. Apply the environment-specific extension setup through the production migration mechanism, separately from the application's Drizzle history:

   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
   ```

3. Inspect actual installed signatures and privileges before provisioning. Restrict every function belonging to this newly installed `http` extension, including overloads and option setters. Revoke default PUBLIC and explicit application-role access, then inspect effective inherited grants. Stop if a non-administrator retains execution or if `postgres` cannot execute the required functions. Do not change unrelated extension or business-table grants.

   ```sql
   SELECT p.oid::regprocedure AS signature, p.proowner::regrole AS owner,
          p.proacl
   FROM pg_proc p
   JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
   JOIN pg_extension e ON e.oid = d.refobjid
   WHERE d.refclassid = 'pg_extension'::regclass
     AND d.deptype = 'e' AND e.extname = 'http';

   DO $restrict$
   DECLARE fn record;
   BEGIN
     FOR fn IN
       SELECT p.oid::regprocedure AS signature
       FROM pg_proc p
       JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
       JOIN pg_extension e ON e.oid = d.refobjid
       WHERE d.refclassid = 'pg_extension'::regclass
         AND d.deptype = 'e' AND e.extname = 'http'
     LOOP
       EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.signature);
     END LOOP;
   END
   $restrict$;

   SELECT r.rolname, p.oid::regprocedure AS signature
   FROM pg_roles r CROSS JOIN pg_proc p
   JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
   JOIN pg_extension e ON e.oid = d.refobjid
   WHERE d.refclassid = 'pg_extension'::regclass
     AND d.deptype = 'e' AND e.extname = 'http'
     AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
   ORDER BY r.rolname, p.oid::regprocedure::text;
   ```

   Review all returned roles, including NOLOGIN roles that can be inherited. Any remaining non-administrator grant must be traced and revoked on these extension functions before continuing. Verify `cron.job` and job-run visibility, Vault access, and function schemas. Required signatures include `extensions.http(extensions.http_request)`, `extensions.http_reset_curlopt()`, and `extensions.http_set_curlopt(character varying, character varying)`; inspect rather than assume. The production connector uses `postgres`, which is not a superuser. Stop on unsupported grants or installation failures.
4. Generate a 32-byte bearer server-side into Vault. Its value never appears as a SQL literal:

   ```sql
   SELECT vault.create_secret(
     encode(extensions.gen_random_bytes(32), 'hex'),
     'saathi_outbox_cron_secret',
     'Production worker bearer'
   );
   ```

   Verify the installed crypto/Vault function signatures first. If the named secret already exists, inspect its metadata and update that exact entry rather than creating duplicates. Return only its ID from creation. Read only this approved Vault record internally during orchestration; never print its decrypted contents or the raw secret-bearing tool result.

   The ignored helper `.local-test/completion-20261021/update-worker-secret.mjs` accepts one newline-terminated JSON object on stdin, shaped as `{ "secret": "<64 hexadecimal characters>" }`. It verifies the linked project/team, sends the value to the CLI's stdin, suppresses CLI stdout/stderr, and returns safe status only. Its CLI command uses the verified options `env update CRON_SECRET --environment production --type secret --project <fixed-id> --scope <fixed-team> --yes`. The secret is absent from arguments, environment variables and files. `--visibility` is not an option in installed CLI 65.2.0. Syntax and synthetic self-tests passed without changing configuration.

5. Check that the job name does not already exist; stop and inspect an existing job rather than replacing it silently. Register one named job owned by `postgres`, and disable it in the same transaction. The command contains a Vault lookup, not the secret value:

   ```sql
   BEGIN;
   SELECT cron.schedule(
     'saathi-outbox-every-minute',
     '* * * * *',
     $job$
       BEGIN;
       SET LOCAL statement_timeout = '40s';
       SET LOCAL client_min_messages = warning;
       SET LOCAL http.timeout_msec = '30000';
       DO $worker$
       DECLARE
         worker_secret text;
         worker_status integer;
       BEGIN
         -- Fail before retrieving the credential if DEBUG2 could be logged.
         IF current_user <> 'postgres'
            OR current_setting('log_min_messages') NOT IN ('warning', 'error', 'log', 'fatal', 'panic')
            OR current_setting('pgaudit.log', true) IS DISTINCT FROM 'none' THEN
           RAISE EXCEPTION 'Saathi worker execution configuration rejected';
         END IF;

         SELECT decrypted_secret INTO STRICT worker_secret
         FROM vault.decrypted_secrets
         WHERE name = 'saathi_outbox_cron_secret';
         IF worker_secret IS NULL OR worker_secret !~ '^[0-9a-f]{64}$' THEN
           RAISE EXCEPTION 'Saathi worker credential configuration rejected';
         END IF;

         BEGIN
           IF NOT extensions.http_reset_curlopt()
              OR NOT extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '5')
              OR NOT extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000')
              OR NOT extensions.http_set_curlopt('CURLOPT_SSL_VERIFYPEER', '1')
              OR NOT extensions.http_set_curlopt('CURLOPT_SSL_VERIFYHOST', '2') THEN
             RAISE EXCEPTION 'HTTP option configuration rejected';
           END IF;

           SELECT response.status INTO STRICT worker_status
           FROM extensions.http(ROW(
             'POST',
             'https://saathi-ten.vercel.app/api/internal/outbox',
             ARRAY[ROW('Authorization', 'Bearer ' || worker_secret)::extensions.http_header],
             'application/json',
             '{}'
           )::extensions.http_request) AS response;
         EXCEPTION
           WHEN query_canceled THEN
             RAISE EXCEPTION 'Saathi worker HTTP request canceled; outcome unknown';
           WHEN OTHERS THEN
             -- Never include SQLERRM, response content, headers, or credential.
             RAISE EXCEPTION 'Saathi worker HTTP request failed; outcome unknown';
         END;
         worker_secret := NULL;
         IF worker_status IS NULL OR worker_status < 200 OR worker_status >= 300 THEN
           RAISE EXCEPTION 'Saathi worker HTTP status %', worker_status;
         END IF;
       END
       $worker$;
       COMMIT;
     $job$
   );
   SELECT cron.alter_job(jobid, active := false)
   FROM cron.job
   WHERE jobname = 'saathi-outbox-every-minute' AND username = 'postgres';
   COMMIT;
   ```

   Verify the secret exists exactly once and meets the worker's minimum length before registering. Verify exactly one inactive row owned by `postgres` after commit. Record only job IDs, status codes, durations and safe counts. No expanded header is stored in `cron.job.command`. The restricted native `http` functions execute directly under the scheduling owner; no elevated wrapper is created. Inspect the installed cron signatures before applying.

## Rotation and release ordering

The selected path rotates to a new server-generated Vault secret and mirrors the same value to Vercel production configuration through supported stdin. No local database connection is required and no unrelated variable is decrypted. Keep the orchestration output restricted to safe IDs, status and validation outcomes.

**Rotation invalidates the already-staged candidate's secret snapshot.** Rebuild that candidate with the new production environment before traffic moves. Existing production still holds its old environment until a deployment changes it. Therefore keep the new job inactive until the public production worker serves the matching secret: create/disable the job in one transaction, then activate only after the main release step verifies the new worker. Do not silently run the new bearer against the old public deployment.

## Acceptance and rollback

- Missing/wrong authorization must return 401 without processing; a missing configured secret returns 503. Use a private supported invocation for an authorized worker check; do not put a bearer in a command argument or URL.
- The existing worker is POST-only. No GET handler or `vercel.json` is needed for this Supabase scheduler.
- The synchronous command fails on a non-2xx response or network error, with only status or a generic error message. A successful `cron.job_run_details` entry therefore establishes a completed 2xx HTTP call, rather than queue insertion. It does not establish that every deferred business task was delivered. Observe subsequent minute executions after activation. Inspect job logs only after checking that command text contains expressions rather than expanded credentials.
- Outbox claims use `SKIP LOCKED`, claim tokens and five-minute claim expiry. Repeated calls retain those existing guarantees; delivery is at least once, and no zero-overlap guarantee is added. A network timeout is an unknown outcome, not evidence of rollback.
- An authorized run may return 503 when realtime publication or retention is deferred. The worker no longer processes invitation email.
- Disable only this exact job with `cron.unschedule('saathi-outbox-every-minute')`, or temporarily use `cron.alter_job(job_id, active := false)`. Do not drop extensions, remove unrelated jobs, reset the database, or delete domain data as rollback.

Vercel's current Hobby plan allows daily native Cron only. The proposed Supabase option supports timely realtime outbox recovery without a new scheduler service or paid-plan change. Invitation acceptance and inbox visibility do not depend on scheduled processing.

References: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [HTTP extension](https://supabase.com/docs/guides/database/extensions/http), [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
