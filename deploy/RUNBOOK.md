# Runbook — the site on Google Cloud

For the owner. One action per numbered line, what you should see after
it, and what to do if you see something else. Where a line is a command,
it is typed in the Terminal app, in the folder of this repository.

Nothing in this file is secret, and the real project id is not in it:
commands say `${PROJECT_ID}`, which your terminal fills in (see "Every
time you open a terminal").

- [Rules that always hold](#rules-that-always-hold)
- [Every time you open a terminal](#every-time-you-open-a-terminal)
- [Where things stand](#where-things-stand)
- [Part 1 — Build the Google Cloud side, with made-up data](#part-1--build-the-google-cloud-side-with-made-up-data)
- [Part 2 — Move live updates, while still on Vercel](#part-2--move-live-updates-while-still-on-vercel)
- [Part 3 — Rehearsal with real data](#part-3--rehearsal-with-real-data)
- [Part 4 — The switch (done on the night of 2026-11-22)](#part-4--the-switch-done-on-the-night-of-2026-11-22)
- [Part 5 — Clean up, after two normal clinic days](#part-5--clean-up-after-two-normal-clinic-days)
- [Everyday](#everyday)
- [When something is wrong](#when-something-is-wrong)
- [What was checked, and what was not](#what-was-checked-and-what-was-not)

## Rules that always hold

1. **A secret is never shown to Claude, pasted into a chat, or put in a
   file in this folder.** Every secret goes in with
   `deploy/ops/set-secret.sh`, which never displays it. If a command in
   this file would print a secret, the command is wrong: stop and say so.
   (One exception, marked where it happens: Practice Better's set-up
   script in Part 4, which you run in a window of your own.)
2. **Real patient data moves only by the job `rac-copy-data`,** which you
   start. It prints a count per table and never a row. No real data goes
   into Google Cloud before you have accepted Google's BAA (Part 3).
3. **Never set the database flag `log_statement` to `ddl` or `all`.** The
   command that gives the database its app password would then be written
   into the database's log, password included. (It is off by default;
   leave it off.)
4. **The three Realtime settings are set together or not at all**
   (`NEXT_PUBLIC_REALTIME_URL`, `NEXT_PUBLIC_REALTIME_ANON_KEY`,
   `REALTIME_SERVICE_KEY`). With only some of them, boards listen in one
   place while the server speaks in another: nothing breaks loudly, the
   boards just fall back to refreshing once a minute.
5. **Migrations are never applied by a deploy.** They are applied by
   running the job `rac-migrate`, on purpose ("Everyday").
6. **Do not add `PGRST_DB_ANON_ROLE` anywhere.** Its absence is what makes
   a request without the app's token get nothing.

Words used below:

- The new Realtime project uses Supabase's new kind of keys. Wherever
  this file or the code says **anon key**, that is the project's
  **publishable key** (`sb_publishable_…`); **service key** is its
  **secret key** (`sb_secret_…`). The publishable key is public (every
  browser receives it); the secret key is a secret.

How the commands are written (your terminal's shell is zsh, and both of
these once broke a command here):

- A name the terminal fills in is always written with braces, like
  `${REGION}`, never bare. Without the braces zsh takes a `:r` that
  follows the name for an instruction of its own and silently changes
  the text: the database's name came out wrong that way.
- A command block holds commands only. zsh does not treat `#` as the
  start of a note when you paste, so the explanations are outside the
  blocks.

## Every time you open a terminal

1. `cd` into this repository's folder.
2. `gcloud config get-value project`
   - You should see the clinic's project id.
   - If not: `gcloud auth login`, then `gcloud config set project` followed
     by the project id (it is on the Google Cloud console's home page).
3. `export PROJECT_ID="$(gcloud config get-value project)"`
   - Nothing is printed. Every command below uses `${PROJECT_ID}`.
4. `export REGION=us-west1`

## Where things stand

**The site has run on Google Cloud since the night of 2026-11-22.** The
switch (Part 4) was done that night, not on the Tuesday first planned.

- **Parts 1 to 4 are done.** What each found is written in its part;
  "What the switch found" is at the end of Part 4.
- **Deploying is automatic.** A merge to `main` is built and deployed by
  the Cloud Build trigger `rac-deploy-main` (Part 2, step 5). Merge on a
  day the clinic is closed, or after hours.
- **The site is watched.** Google checks the home page every minute and
  emails the clinic if it stops answering ("Everyday", "Is it up?").
- **`new.ryuacupuncture.com` now only redirects** to the real address.
- **Still to do: Part 5**, the clean-up, after two normal clinic days.
  Until then the OLD Supabase project still holds a copy of every
  patient, and the Vercel project still exists (no longer connected to
  the repository, no longer serving any address).

Each finished step below says "done" and keeps the command that was used.

## Part 1 — Build the Google Cloud side, with made-up data

Nothing here touches a patient. Needs: `gcloud` signed in, Docker
running, Node installed.

### 1.1 Project basics — done on 2026-11-22

The commands that were used, for the record; each is safe to run again.

```sh
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com certificatemanager.googleapis.com \
  compute.googleapis.com cloudscheduler.googleapis.com

for account in rac-app rac-ops; do
  gcloud iam service-accounts describe "${account}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "${account}"
  for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" --condition=None \
      --member="serviceAccount:${account}@${PROJECT_ID}.iam.gserviceaccount.com" --role="${role}" >/dev/null
  done
done
```

- `rac-app` is what the site runs as; `rac-ops` is what the two jobs run as.

### 1.2 The database — done on 2026-11-22

The command that was used:

```sh
gcloud sql instances create rac-db \
  --database-version=POSTGRES_17 --edition=enterprise --tier=db-g1-small \
  --region=us-west1 --availability-type=zonal \
  --storage-type=SSD --storage-size=10GB --storage-auto-increase \
  --backup-start-time=10:00 --enable-point-in-time-recovery \
  --maintenance-window-day=SUN --maintenance-window-hour=10 \
  --database-flags=log_connections=on,log_disconnections=on \
  --ssl-mode=ENCRYPTED_ONLY --deletion-protection

gcloud sql databases create rac --instance=rac-db
```

- `--edition=enterprise` is required: from Postgres 16 on, Google's
  default edition is Enterprise Plus, which does not offer the small
  shared-core size.
- Do NOT run `instances create` again (it would fail: the instance
  exists). To see that it is there:
  `gcloud sql instances describe rac-db --format="value(state,databaseVersion)"`
  → `RUNNABLE POSTGRES_17`.

### 1.3 A place for the images, and an account for the builds — done on 2026-11-22

The commands that were used; each is safe to run again.

```sh
gcloud artifacts repositories describe rac --location="${REGION}" >/dev/null 2>&1 \
  || gcloud artifacts repositories create rac --repository-format=docker --location="${REGION}"

gcloud iam service-accounts describe "rac-build@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
  || gcloud iam service-accounts create rac-build
for role in roles/cloudbuild.builds.builder roles/run.admin; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" --condition=None \
    --member="serviceAccount:rac-build@${PROJECT_ID}.iam.gserviceaccount.com" --role="${role}" >/dev/null
done
for account in rac-app rac-ops; do
  gcloud iam service-accounts add-iam-policy-binding "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --member="serviceAccount:rac-build@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role=roles/iam.serviceAccountUser >/dev/null
done
```

- `rac` holds the images; `rac-build` is the account Cloud Build works
  as (it may build, and deploy to Cloud Run as `rac-app` / `rac-ops`).

### 1.4 The Realtime project — done on 2026-11-22

A new, free Supabase project that will never hold patient data: it only
carries "something changed, look again" between screens. What was run in
its SQL editor:

```sql
create table public.keepalive (
  id int primary key default 1,
  touched_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;
grant select on public.keepalive to service_role;
```

- The table exists only so the daily ping has something to read: a free
  Supabase project is paused after a week without activity.
- From this project you need three values later: its address
  (`https://….supabase.co`), its **publishable** key and its **secret**
  key. Find them in Supabase → the project → Settings → API Keys.

### 1.5 Secrets — done on 2026-11-22 (two of step 4 being entered again)

Each line stores one secret. You see `stored: <name> (<n> characters)`
and never the value. If you see anything else, stop.

1. **Done.** Made up by the computer:

   ```sh
   bash deploy/ops/set-secret.sh random db-postgres-password
   bash deploy/ops/set-secret.sh random db-authenticator-password
   bash deploy/ops/set-secret.sh random pgrst-jwt-secret
   bash deploy/ops/set-secret.sh random nextauth-secret
   bash deploy/ops/set-secret.sh random cron-secret
   bash deploy/ops/set-secret.sh random pb-webhook-verification-token
   ```

   - Run a line again and it says `already has a value; it was left
     alone`. That is the script protecting you; nothing to do.

2. **Done.** The database's administrator was given its password
   (nothing is shown):

   ```sh
   gcloud sql users set-password postgres --instance=rac-db \
     --password="$(gcloud secrets versions access latest --secret=db-postgres-password)"
   ```

3. **Done** — `pgrst-db-uri` (108 characters) and `db-rest-jwt` (112
   characters). Two secrets made from the ones above, each piped
   straight from Secret Manager back into Secret Manager. The first is
   the address PostgREST logs in to the database with; the second is the
   token the app shows PostgREST, signed with PostgREST's secret.

   ```sh
   printf 'postgres://authenticator:%s@127.0.0.1:5432/rac' \
     "$(gcloud secrets versions access latest --secret=db-authenticator-password)" \
     | bash deploy/ops/set-secret.sh stdin pgrst-db-uri

   gcloud secrets versions access latest --secret=pgrst-jwt-secret \
     | node scripts/mint-db-jwt.js \
     | bash deploy/ops/set-secret.sh stdin db-rest-jwt
   ```

4. **Entered by you** (two are being entered again). Typed or pasted:
   each line asks for the value; what you type stays hidden; press Enter.

   | Secret | What goes in |
   | --- | --- |
   | `allowed-admin-emails` | the staff Google accounts, separated by commas |
   | `google-client-id`, `google-client-secret` | from step 1.6 |
   | `pb-client-id`, `pb-client-secret` | Practice Better, a newly added key |
   | `resend-api-key` | Resend, a newly added key |
   | `resend-from-email` | the sender, e.g. `forms@ryuacupuncture.com` |
   | `realtime-service-key` | the Realtime project's **secret** key (`sb_secret_…`) |

   ```sh
   bash deploy/ops/set-secret.sh ask allowed-admin-emails
   bash deploy/ops/set-secret.sh ask google-client-id
   bash deploy/ops/set-secret.sh ask google-client-secret
   bash deploy/ops/set-secret.sh ask pb-client-id
   bash deploy/ops/set-secret.sh ask pb-client-secret
   bash deploy/ops/set-secret.sh ask resend-api-key
   bash deploy/ops/set-secret.sh ask resend-from-email
   bash deploy/ops/set-secret.sh ask realtime-service-key
   ```

   - **Before the switch a vendor key is ADDED, never regenerated.** The
     live site on Vercel is still using the old one; "regenerate" or
     "roll" at Practice Better or Resend would cut it off. If a vendor
     offers only "regenerate", that key is done on the switch day, after
     the old site is stopped (Part 4).

5. **Done.** Two that get their real value later:

   ```sh
   bash deploy/ops/set-secret.sh random pb-webhook-signing-secret
   printf 'not-yet' | bash deploy/ops/set-secret.sh stdin source-database-url
   ```

   - `pb-webhook-signing-secret` is a random value until Part 4 and never
     a fixed word: whoever knows it can sign a webhook call. (It was
     first stored as a fixed stand-in and replaced the same day with
     `random pb-webhook-signing-secret --replace`.)
   - `source-database-url` holds nothing usable until Part 3.

6. Only if the clinic uses Spotify for the waiting-room music:
   `bash deploy/ops/set-secret.sh ask spotify-client-id`, the same for
   `spotify-client-secret`, and tell Claude — two lines of
   `deploy/service.template.yaml` have to be switched on.

7. Check: `gcloud secrets list --format="value(name)" | sort`
   - You should see the 18 names above (20 with Spotify). Names only.

### 1.6 Google sign-in

In the Google Cloud console (this cannot be scripted):

1. APIs & Services → OAuth consent screen: user type **External**,
   publishing status **In production**.
2. APIs & Services → Credentials → Create credentials → OAuth client ID →
   **Web application**. Authorised redirect URIs — both of these:
   - `https://new.ryuacupuncture.com/api/auth/callback/google`
   - `https://www.ryuacupuncture.com/api/auth/callback/google`
3. Put the client ID and the client secret in with the two `ask` lines
   of step 1.5.4. Do not download the JSON file.

### 1.7 Images, jobs, the database's tables, the service

Have the Realtime project's address and **publishable** key at hand (both
are public values; they may be shown).

1. **Each new terminal window:** `export REALTIME_URL=` followed by the
   address, and `export REALTIME_ANON_KEY=` followed by the publishable key.

2. **Done on 2026-11-22** — SUCCESS in about six minutes (so Cloud Build
   in `us-west1` is allowed for this project). Build the images, without
   deploying yet:

   ```sh
   gcloud builds submit . --config cloudbuild.yaml --region "${REGION}" \
     --service-account "projects/${PROJECT_ID}/serviceAccounts/rac-build@${PROJECT_ID}.iam.gserviceaccount.com" \
     --substitutions "_DEPLOY_SERVICE=false,_NEXTAUTH_URL=https://new.ryuacupuncture.com,_REALTIME_URL=${REALTIME_URL},_REALTIME_ANON_KEY=${REALTIME_ANON_KEY}"
   ```

   - `FAILURE` in the step `app-image` with "build arguments … are both
     required": step 1 was skipped in this terminal window.
   - What is uploaded is this folder without what `.gcloudignore` names
     (no `.env` files, no notes, no tool folders).

3. **Done on 2026-11-22** — both jobs exist. The commands (safe to run
   again; they then update the job):

   ```sh
   gcloud run jobs deploy rac-migrate --region "${REGION}" \
     --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/rac/ops:latest" \
     --service-account "rac-ops@${PROJECT_ID}.iam.gserviceaccount.com" \
     --set-cloudsql-instances "${PROJECT_ID}:${REGION}:rac-db" \
     --set-env-vars "PGHOST=/cloudsql/${PROJECT_ID}:${REGION}:rac-db,PGUSER=postgres,PGDATABASE=rac" \
     --set-secrets "PGPASSWORD=db-postgres-password:latest,AUTHENTICATOR_PASSWORD=db-authenticator-password:latest" \
     --command /app/deploy/ops/migrate.sh --max-retries 0 --task-timeout 10m

   gcloud run jobs deploy rac-copy-data --region "${REGION}" \
     --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/rac/ops:latest" \
     --service-account "rac-ops@${PROJECT_ID}.iam.gserviceaccount.com" \
     --set-cloudsql-instances "${PROJECT_ID}:${REGION}:rac-db" \
     --set-env-vars "PGHOST=/cloudsql/${PROJECT_ID}:${REGION}:rac-db,PGUSER=postgres,PGDATABASE=rac" \
     --set-secrets "PGPASSWORD=db-postgres-password:latest,SOURCE_DATABASE_URL=source-database-url:latest" \
     --command /app/deploy/ops/copy-data.sh --max-retries 0 --task-timeout 30m
   ```

   - `rac-copy-data` is given no argument on purpose: started without one
     it does nothing and says how to use it.
   - The instance is written `${PROJECT_ID}:${REGION}:rac-db`, braces
     included. Without them the terminal turned it into a name that does
     not exist ("Malformed CloudSQL instance string").

4. **Done on 2026-11-22** — the log shows `applied` for all 21
   migrations, `0001_patient_signin.sql` to `0021_apply_flow_change.sql`.
   Build the database:

   ```sh
   gcloud run jobs execute rac-migrate --region "${REGION}" --wait
   ```

   - Read its log (newest line first):
     `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="rac-migrate"' --freshness=15m --format="value(textPayload)"`
   - Run again, it logs `nothing to apply`.
   - It failed with "connection" in the log: see "When something is wrong".

5. **Next.** Look before deploying. This changes nothing:

   ```sh
   . deploy/versions.env
   PROJECT_ID="${PROJECT_ID}" NEXTAUTH_URL=https://new.ryuacupuncture.com \
     IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/rac/web:latest" \
     POSTGREST_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/rac/postgrest:${POSTGREST_VERSION}" \
     bash deploy/render-service.sh > /tmp/rac-web.yaml
   gcloud run services replace /tmp/rac-web.yaml --region "${REGION}" --dry-run
   ```

   - No error = Google accepts the service's definition.
   - An error naming a field or a number: stop and show Claude. The
     likely ones are listed under "When something is wrong".

6. Deploy the service: the command of step 2 again, with
   `_DEPLOY_SERVICE=true` instead of `false`.
   - You should see `SUCCESS`, and in the console under Cloud Run a
     service `rac-web` with a green tick.
   - The step `service` failed: Cloud Run → `rac-web` → Logs, and "When
     something is wrong".

### 1.8 The front door: address, certificate, load balancer

Run these with Claude, one block at a time: they were written from
Google's documentation and have not been run. A command that says
`already exists` was done before; go on to the next.

1. Reserve the address the site will have:

   ```sh
   gcloud compute addresses create rac-web-ip --network-tier=PREMIUM --ip-version=IPV4 --global
   gcloud compute addresses describe rac-web-ip --global --format="value(address)"
   ```

   - You should see one address like `203.0.113.10`. Write it down: it
     is not a secret.

2. **Who may issue a certificate for the domain.** A domain can carry
   "CAA" records naming the only certificate companies allowed. Look:

   ```sh
   for name in ryuacupuncture.com www.ryuacupuncture.com new.ryuacupuncture.com; do
     echo "${name}"
     dig +short CAA "${name}"
   done
   ```

   - **Nothing under any name:** anyone may issue; go on.
   - **Lines that include `pki.goog`:** Google may issue; go on.
   - **Lines without `pki.goog`** (for example only `letsencrypt.org`):
     in Vercel → the domain → DNS records, **add** a record of type
     `CAA`, name `@`, value `0 issue "pki.goog"`. Do **not** remove the
     line for Let's Encrypt: Vercel needs it to renew its own
     certificate, which is the way back. Then run the block again.
   - Why: Google issues these certificates through Google Trust Services
     (`pki.goog`) or, as a second choice it does not promise, Let's
     Encrypt. Allow both.

3. Ask Google for a certificate, and get the three records that prove
   the domain is the clinic's:

   ```sh
   gcloud certificate-manager dns-authorizations create rac-auth-www  --domain="www.ryuacupuncture.com"
   gcloud certificate-manager dns-authorizations create rac-auth-bare --domain="ryuacupuncture.com"
   gcloud certificate-manager dns-authorizations create rac-auth-new  --domain="new.ryuacupuncture.com"
   for name in rac-auth-www rac-auth-bare rac-auth-new; do
     gcloud certificate-manager dns-authorizations describe "${name}" \
       --format="value(dnsResourceRecord.name,dnsResourceRecord.type,dnsResourceRecord.data)"
   done
   ```

   - You should see three lines, each a name starting `_acme-challenge.`,
     the word `CNAME`, and a long name ending `authorize.certificatemanager.goog.`

4. In Vercel → the domain `ryuacupuncture.com` → DNS records, **add**
   four records. Add only; change and delete nothing — the clinic's
   email depends on the records already there.
   - three `CNAME` records, name and value exactly as printed in step 3;
   - one `A` record: name `new`, value the address from step 1.

5. Make the certificate and wait for it:

   ```sh
   gcloud certificate-manager certificates create rac-cert \
     --domains="www.ryuacupuncture.com,ryuacupuncture.com,new.ryuacupuncture.com" \
     --dns-authorizations="rac-auth-www,rac-auth-bare,rac-auth-new"
   gcloud certificate-manager certificates describe rac-cert --format="get(managed.state)"
   ```

   - Repeat the second line every few minutes until it says `ACTIVE`
     (Google allows itself up to an hour).
   - Not `ACTIVE` after an hour, or `FAILED`: read why —
     `gcloud certificate-manager certificates describe rac-cert --format="get(managed.authorizationAttemptInfo)"`
     For each domain it gives a state and, if it failed, a reason:
     `CONFIG` = a CNAME record of step 4 is missing or misspelt (compare
     letter by letter); `CAA` = step 2; `RATE_LIMITED` = wait.
   - A certificate that says `FAILED` does not try again by itself: fix
     the cause, `gcloud certificate-manager certificates delete rac-cert`,
     and run this step again.

6. Build the load balancer. The first file is the map of what goes
   where: the bare domain is sent on to `www`; everything else goes to
   the site — and on the way **the header `x-middleware-subrequest` is
   taken off every request**. That header used to let a caller skip the
   site's own "are you signed in?" page check (a fault of older Next.js
   versions; the one the site runs now refuses the header by itself, and
   the removal stays as a second lock — see "Everyday → The header the
   load balancer removes"). The second file sends `http://` to `https://`.

   ```sh
   gcloud certificate-manager maps create rac-cert-map
   for host in www.ryuacupuncture.com ryuacupuncture.com new.ryuacupuncture.com; do
     gcloud certificate-manager maps entries create "rac-entry-${host%%.*}" \
       --map=rac-cert-map --certificates=rac-cert --hostname="${host}"
   done

   gcloud compute network-endpoint-groups create rac-web-neg --region="${REGION}" \
     --network-endpoint-type=serverless --cloud-run-service=rac-web
   gcloud compute backend-services create rac-web-backend \
     --load-balancing-scheme=EXTERNAL_MANAGED --global
   gcloud compute backend-services add-backend rac-web-backend --global \
     --network-endpoint-group=rac-web-neg --network-endpoint-group-region="${REGION}"

   printf '%s\n' \
     "name: rac-web-map" \
     "defaultService: projects/${PROJECT_ID}/global/backendServices/rac-web-backend" \
     "headerAction:" \
     "  requestHeadersToRemove:" \
     "    - x-middleware-subrequest" \
     "hostRules:" \
     "  - hosts: ['ryuacupuncture.com']" \
     "    pathMatcher: bare-to-www" \
     "pathMatchers:" \
     "  - name: bare-to-www" \
     "    defaultUrlRedirect:" \
     "      hostRedirect: www.ryuacupuncture.com" \
     "      httpsRedirect: true" \
     "      redirectResponseCode: MOVED_PERMANENTLY_DEFAULT" \
     "      stripQuery: false" \
     > /tmp/rac-web-map.yaml
   gcloud compute url-maps import rac-web-map --source /tmp/rac-web-map.yaml --global

   gcloud compute ssl-policies create rac-tls --profile MODERN --min-tls-version 1.2
   gcloud compute target-https-proxies create rac-web-https \
     --certificate-map=rac-cert-map --url-map=rac-web-map --global
   gcloud compute target-https-proxies update rac-web-https --ssl-policy rac-tls --global
   gcloud compute forwarding-rules create rac-web-443 \
     --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM \
     --address=rac-web-ip --target-https-proxy=rac-web-https --global --ports=443

   printf '%s\n' \
     "name: rac-web-http" \
     "defaultUrlRedirect:" \
     "  httpsRedirect: true" \
     "  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT" \
     > /tmp/rac-web-http.yaml
   gcloud compute url-maps import rac-web-http --source /tmp/rac-web-http.yaml --global
   gcloud compute target-http-proxies create rac-web-http-proxy --url-map=rac-web-http --global
   gcloud compute forwarding-rules create rac-web-80 \
     --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM \
     --address=rac-web-ip --target-http-proxy=rac-web-http-proxy --global --ports=80
   ```

   - Then wait about ten minutes: a new load balancer answers slowly at first.

7. A budget alert, in the console: Billing → Budgets & alerts → Create
   budget → amount $100 a month, email alerts on.

### 1.9 The daily ping

```sh
gcloud scheduler jobs create http rac-keepalive --location "${REGION}" \
  --schedule "0 15 * * *" --time-zone "Etc/UTC" --http-method GET \
  --uri "https://new.ryuacupuncture.com/api/cron/keepalive" \
  --headers "Authorization=Bearer $(gcloud secrets versions access latest --secret=cron-secret)" \
  >/dev/null 2>&1 && echo "made" || echo "NOT made"
gcloud scheduler jobs describe rac-keepalive --location "${REGION}" --format="value(state,schedule,httpTarget.uri)"
gcloud scheduler jobs run rac-keepalive --location "${REGION}" >/dev/null 2>&1 && echo "started" || echo "NOT started"
```

- Why everything these commands print is thrown away: the ping carries
  the cron secret, and gcloud's answer describes the job it made —
  secret included. The second line shows only the three harmless fields:
  `ENABLED`, the schedule, the address.
- `NOT made`: run the second line; if it shows the job, it existed
  already. Otherwise tell Claude (and do not rerun without the
  `>/dev/null 2>&1`).
- Then, in the console: Cloud Scheduler → `rac-keepalive` → "Last run
  result" should say **Success**.
- **Failed**: Cloud Run → `rac-web` → Logs, look for `/api/cron/keepalive`.
  A 401 means the ping's secret is not the service's; a 500 means the
  Realtime project did not accept its secret key — check
  `realtime-service-key` (1.5.4) and the table of step 1.4, then deploy
  again (the service reads secrets when it starts).

### 1.10 Checks — every one must hold before Part 3

1. `curl -sI https://new.ryuacupuncture.com/ | head -1` → `HTTP/2 200`.
2. `curl -sI --tls-max 1.1 https://new.ryuacupuncture.com/ | head -1` →
   an error about the connection or protocol version, no `HTTP` line.
3. `curl -sI http://new.ryuacupuncture.com/ | grep -i "^HTTP\|^location"`
   → `301` and `location: https://new.ryuacupuncture.com/`.
4. The service's own address refuses the internet — so nobody can go
   around the load balancer and what it removes:
   `curl -s -o /dev/null -w "%{http_code}\n" "$(gcloud run services describe rac-web --region "${REGION}" --format="value(status.url)")"`
   → `404` (or `403`), never `200`.
5. **The page check cannot be skipped.**

   ```sh
   curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
     -H "x-middleware-subrequest: src/middleware:src/middleware:src/middleware:src/middleware:src/middleware" \
     https://new.ryuacupuncture.com/admin/dashboard
   ```

   - It must say `307 https://new.ryuacupuncture.com/admin/login?next=%2Fadmin%2Fdashboard`.
   - **`200`: stop. Do not go on to Part 3.** Neither the site nor the
     load balancer stopped the request; tell Claude.
   - What `307` proves changed with the Next.js version. Up to 15.1.11
     the container alone, with no load balancer in front, answered 200
     to this command, so 307 proved the load balancer's rule (1.8.6).
     From 15.5.29 the container answers 307 by itself, so 307 no longer
     says which of the two did it. To see the load balancer's rule, look
     at the map as Google holds it —
     `gcloud compute url-maps describe rac-web-map --global` — it must
     list `x-middleware-subrequest` under `headerAction` →
     `requestHeadersToRemove`.
6. Three containers started, in order: Cloud Run → `rac-web` → Logs,
   newest revision: lines from `cloud-sql-proxy` ("ready for new
   connections"), then `postgrest` ("Schema cache loaded"), then `app`
   ("Ready in"). And a new revision's first page opens in under 10 seconds.
7. **The caller's address.** From your own computer:

   ```sh
   curl -s -X POST https://new.ryuacupuncture.com/api/display/pair \
     -H "X-Forwarded-For: 1.2.3.4" -H "X-Real-IP: 1.2.3.4"
   ```

   Then in the console: SQL → `rac-db` → Cloud SQL Studio, database
   `rac`, user `postgres`. For the password, run
   `gcloud secrets versions access latest --secret=db-postgres-password | pbcopy`
   (it goes to the clipboard, not the screen) and paste. Run:

   ```sql
   select created_ip from display_devices order by created_at desc limit 1;
   ```

   - It must be your computer's real public address (search the web for
     "what is my ip"), **not** `1.2.3.4` and not `unknown`.
   - Otherwise tell Claude what it shows: `CLIENT_IP_FROM_RIGHT` in
     `deploy/service.template.yaml` is corrected (3 instead of 2 if
     Google adds one more address) and this check repeated. Do not go on
     until it holds: the pairing and form limits depend on it.
8. Staff sign-in with Google works at `https://new.ryuacupuncture.com/admin/login`;
   a Google account that is not on the list is refused.
9. With a made-up patient. Add one in Cloud SQL Studio (as in check 7):

   ```sql
   insert into patients (first_name, last_name, phone, pb_client_id)
   values ('Madeup', 'Testperson', '(555) 010-0100', 'made-up-1');
   ```

   Then: on the kiosk page, "First time here?" with that phone number —
   PIN set-up and check-in work; the patient appears on the rooms board;
   a room assignment made in one browser shows in a second browser
   within a second; the waiting-room page pairs and shows the call.
   (The made-up patient is removed by check 11.)
10. The daily ping, run by hand (1.9), says Success.
11. `gcloud run jobs execute rac-copy-data --region "${REGION}" --args=empty --wait`,
    then its log (as in 1.7.4, with `rac-copy-data`): nine lines ending
    `dest=0`.

If a container cannot start, or PostgREST cannot reach the database, and
nothing under "When something is wrong" fixes it: **stop** and decide
with Claude. That is the one point where this plan can be wrong at its
root.

## Part 2 — Move live updates, while still on Vercel

1. Say yes to merging the pull request; it is merged. Vercel deploys.
   - Nothing changes yet. Check the live site: the kiosk page opens, a
     rooms board updates.
2. In Vercel → the project → Settings → Environment Variables,
   Production, add **all three**:
   - `NEXT_PUBLIC_REALTIME_URL` — the Realtime project's address
   - `NEXT_PUBLIC_REALTIME_ANON_KEY` — its **publishable** key
   - `REALTIME_SERVICE_KEY` — its **secret** key (mark it Sensitive)
3. Redeploy (Deployments → the newest → Redeploy).
4. Check, on the rooms board in a browser: open the developer tools'
   Network panel, filter "WS": the connection goes to the **new**
   project's address. The Console shows no "Content Security Policy"
   error. Change something on one board: a second board shows it within
   a second.
   - If not: remove the three variables, redeploy. Everything is as before.
5. **Done on 2026-11-22**, from the terminal. Connect the repository to
   Cloud Build and make the trigger:

   ```sh
   gcloud builds connections create github rac-github --region="${REGION}"
   ```

   - It prints a link. Open it signed in to GitHub as the repository's
     owner, and allow Cloud Build. (A page saying the state "is
     PENDING_INSTALL_APP, not PENDING_USER_OAUTH" means it already
     worked.) Then get the second link, to install Google's build app on
     this one repository:
     `gcloud builds connections describe rac-github --region="${REGION}" --format="value(installationState.actionUri)"`
   - When `--format="value(installationState.stage)"` says `COMPLETE`:

   ```sh
   gcloud builds repositories create rec-website --connection=rac-github \
     --region="${REGION}" --remote-uri="https://github.com/${GITHUB_OWNER}/rec-website.git"
   gcloud builds triggers create github --name=rac-deploy-main --region="${REGION}" \
     --repository="projects/${PROJECT_ID}/locations/${REGION}/connections/rac-github/repositories/rec-website" \
     --branch-pattern='^main$' --build-config=cloudbuild.yaml \
     --service-account="projects/${PROJECT_ID}/serviceAccounts/rac-build@${PROJECT_ID}.iam.gserviceaccount.com" \
     --substitutions="_REALTIME_URL=${REALTIME_URL},_REALTIME_ANON_KEY=${REALTIME_ANON_KEY},_NEXTAUTH_URL=https://www.ryuacupuncture.com"
   ```

   - `GITHUB_OWNER` is the GitHub account the repository belongs to.
   - Cloud Build's own account needs to keep the GitHub token in Secret
     Manager; it was given `roles/secretmanager.admin` for that.
   - To run it by hand: `gcloud builds triggers run rac-deploy-main --region="${REGION}" --branch=main`

## Part 3 — Rehearsal with real data

1. **Gate.** You have accepted Google Cloud's BAA (keep a screenshot)
   and reset the Supabase database password.
   - Use the password **Supabase generates** ("Generate a password"),
     not one of your own: it goes inside an address in the next step,
     where characters such as `@ / # %` in a hand-made password would
     have to be rewritten in a special way first.
2. Store the old database's address. In Supabase → the OLD project →
   Connect → **Session pooler**, copy the connection string, put the
   password in place of `[YOUR-PASSWORD]` in a text field of your own
   (not in this folder), then:
   `bash deploy/ops/set-secret.sh ask source-database-url`
   - It must be the *session pooler* string: Cloud Run cannot reach the
     "direct connection" address.
3. `gcloud run jobs execute rac-copy-data --region "${REGION}" --args=copy --wait`
4. Its log must show nine lines, each ending `ok`:
   `patients source=… dest=… ok`, and so on. Claude may read these
   lines: they are counts.
   - A line ending `MISMATCH`: someone checked in while it ran. Run step 3
     again.
   - `copy failed: nothing was committed`: the new database is untouched.
     The line above it is an error code; show Claude.
5. Walk through `https://new.ryuacupuncture.com`, signed in as staff:
   patient search finds a patient you know; Check-ins shows past days
   with the right totals; Log shows history; the rooms board shows the
   clinic's rooms and doctors; Setup lists the paired screens and kiosk.
6. **PIN timing.** On the kiosk page, type a real PIN you know, then a
   wrong one. Time "Checking…" for each, and time the same two on the
   live site.
   - Slower than the live site by more than a second or two, or more
     than 5 seconds where the live site is quick: **stop** and discuss
     before Part 4.
7. Empty it again:
   `gcloud run jobs execute rac-copy-data --region "${REGION}" --args=empty --wait`
   → nine lines ending `dest=0`.

### What the rehearsal found (2026-11-22)

- All nine tables matched: 5,599 patients, 1,667 check-ins, 47 paired
  screens, 64 audit rows, 5 rooms, 3 doctors, 3 stations, 1 kiosk, 1
  music setting.
- **With a new `NEXTAUTH_SECRET` the PINs took 7 to 8 seconds.** The
  quick PIN lookup is keyed with that secret (CLAUDE.md, "PIN lookup"),
  so under a new one every stored fingerprint is out of date and each
  PIN is compared against every patient who has one.
- The old host would not show the value, so it was handed over sealed:
  for a few minutes the live site had a staff-only page that returned
  the value encrypted with a public key whose private half existed only
  in Secret Manager; it was opened straight into `nextauth-secret` and
  never shown. The page and the private key are both gone (pull requests
  #70 and #71).
- With the same secret: a right PIN takes 1 second. **A wrong PIN takes
  about 10 seconds — on the live site too.** That is not the move: the
  fingerprints only exist since migration 0017 (applied 2026-11-22), so
  nearly every PIN holder is still compared the slow way until they next
  sign in. It was measured afterwards (CLAUDE.md, "PIN lookup" → "The
  slow way"): the wait is the number of those patients times about 15
  thousandths of a second of one CPU, whichever way it is run. It gets
  shorter by itself as patients sign in; more CPUs for the service, or
  stamping everyone in one go, are decisions for the owner.

## Part 4 — The switch (done on the night of 2026-11-22)

1. **Stop the old side.** Vercel → the **project** → Settings → Domains:
   remove `www.ryuacupuncture.com` and `ryuacupuncture.com` from the
   project. The site is now offline, so nothing can write to Supabase.
   - **Only there.** Never delete the domain on the Vercel *account's*
     Domains page: that deletes every DNS record with it, the ones the
     clinic's email depends on included.
2. **Copy.** `gcloud run jobs execute rac-copy-data --region "${REGION}" --args=copy --wait`
   → nine lines ending `ok`.
3. **Give the app its real address.** In the Cloud Build trigger, change
   `_NEXTAUTH_URL` to `https://www.ryuacupuncture.com` and press Run.
   (No trigger yet? Run the command of 1.7.2 with `_DEPLOY_SERVICE=true`
   and `_NEXTAUTH_URL=https://www.ryuacupuncture.com`; the same wherever
   a later step says "press Run".) When it says SUCCESS:

   ```sh
   gcloud scheduler jobs update http rac-keepalive --location "${REGION}" \
     --uri "https://www.ryuacupuncture.com/api/cron/keepalive" \
     >/dev/null 2>&1 && echo "changed" || echo "NOT changed"
   ```

   - The answer is thrown away for the same reason as in 1.9.
4. **DNS.** In Vercel → the domain → DNS records:
   - `A` record, name `www`, value the load balancer's address (1.8.1);
   - `A` record, name `@` (the bare domain), the same value.
   - Then look at the whole list: no other record (CNAME, ALIAS, AAAA)
     may be left for `www` or for the bare domain. Touch nothing else —
     above all not the `MX` and `TXT` records (email).
5. **Checks, in this order:**
   1. `https://www.ryuacupuncture.com` opens, with a padlock.
   2. Check 1.10.5 again, with `www` in place of `new`: it must say 307.
   3. Staff sign-in.
   4. **Reload every tablet and the waiting-room TV's page once.** Pages
      that were open since before the switch were loaded from Vercel and
      still ask for its files.
   5. The kiosk tablet shows the PIN pad without asking to pair.
   6. The waiting-room TV shows its screen without a pairing code.
   7. A PIN check-in, by a staff member's own test patient.
   8. A room assignment crossing to a second board within a second.
   9. The appointment form sends its email.
   10. An email sent to the clinic's address still arrives.
6. **Practice Better webhook.** Read "What the switch found" below
   first: the key must be allowed to write, and an existing webhook for
   the same address has to be deleted before a new one is made.
   Do this yourself, in a terminal window
   Claude is not using: the script prints a secret, once. Nothing is
   written to a file — the three values it needs go straight from Secret
   Manager to the one command.
   1. In that window (after "Every time you open a terminal"):

      ```sh
      PB_CLIENT_ID="$(gcloud secrets versions access latest --secret=pb-client-id)" \
      PB_CLIENT_SECRET="$(gcloud secrets versions access latest --secret=pb-client-secret)" \
      PB_WEBHOOK_VERIFICATION_TOKEN="$(gcloud secrets versions access latest --secret=pb-webhook-verification-token)" \
        node scripts/setup-pb-webhook.js
      ```

      - It prints `Subscription created` and the signing secret. Copy
        the value after `PB_WEBHOOK_SIGNING_SECRET=`.
      - `Subscription failed`: nothing was changed. If Practice Better
        refuses a second subscription for the same address, remove the
        old one there first (see "The way back" for what that costs).
   2. `bash deploy/ops/set-secret.sh ask pb-webhook-signing-secret`,
      paste, Enter. Then `clear`, and close that window.
   3. Press Run on the Cloud Build trigger (the service reads secrets
      when it starts).
   4. Edit a test client in Practice Better and see the change arrive in
      the dashboard's patient search; then Dashboard → Setup → Quick sync.
   5. Remove the old subscription in Practice Better — once you no
      longer mean to go back.
7. Reconnect Spotify from the dashboard, if the clinic uses it.
8. **Take the copy job away**, as soon as the checks of step 5 hold. It
   replaces everything in the new database with the old one's rows; from
   the first real check-in on, running it would destroy that day's work.

   ```sh
   gcloud run jobs delete rac-copy-data --region "${REGION}" --quiet
   gcloud secrets delete source-database-url --quiet
   ```

   - Both say `Deleted`. The builds notice the job is gone and leave it
     alone.

### What the switch found (2026-11-22)

- **Vercel will not add an `A` record while a `CNAME` of the same name
  exists.** The old `www` CNAME and the old bare-domain `A` record
  (`76.76.21.21`) had to be deleted by hand, each on its own row, before
  and after adding the new ones. Until the old bare-domain record was
  gone, half the visitors without `www` reached Vercel's "not found".
- **A browser can keep showing Vercel's "This page doesn't exist"** for
  a while: Chrome remembers where a site lived and keeps old connections
  open. Quit the browser fully and reopen it.
- **Signing in must start on the real address.** A sign-in begun on
  `new.ryuacupuncture.com` comes back to `www` and fails ("Sign-in
  failed", `error=OAuthCallback`; the log says "State cookie was
  missing"). `new.` now redirects to `www` at the load balancer, so this
  cannot be done by accident any more.
- **Practice Better: the key must be allowed to write.** A read-only key
  reads records and lists webhooks, but creating one answers 401.
- **Practice Better: an address can have one webhook.** Asking for a
  second one for the same address returns the EXISTING one, without a
  signing secret (the script then prints `undefined`). Delete the old
  one first — and never store a secret without looking at its length:
  a real one is 44 characters.
- The copy job and `source-database-url` were deleted the same night;
  the old webhook is gone. **There is no way back to Vercel any more**,
  and none is needed.

**The way back — only until the first real check-in on the new side.**
Delete the two `A` records of step 4 and add both domains back to the
Vercel project. Decide by the end of Tuesday: if a check of step 5 fails
and is not fixed that day, go back.

- Going back needs nothing from Google Cloud and not the copy job: the
  old database was only read, never changed.
- **The webhook, if step 6 was done.** Practice Better now signs with
  the new secret, and Vercel still holds the old one, so Vercel refuses
  its calls: patients created in Practice Better reach the old site only
  through Dashboard → Setup → Quick sync until the webhook is registered
  once more for the old side. This is why step 6.5 (removing the old
  subscription) waits until going back is off the table. Whether
  Practice Better allows two subscriptions for one address at all is not
  known; if it does not, step 6 is the point of no easy return for the
  webhook — and only for the webhook.
- Trying the switch again another day: make the copy job again (1.7.3)
  and store `source-database-url` again (Part 3, step 2).

## Part 5 — Clean up, after two normal clinic days

1. You confirm two clinic days ran without a hosting problem.
2. Delete the OLD Supabase project (it holds a copy of every patient,
   with a company the clinic has no agreement with). Not the Realtime one.
3. Delete the Vercel **project** (Settings → General → Delete Project).
   Keep the Vercel account and the domain in it: it still hosts the
   domain's DNS. **Never** use Delete, or Delete DNS Zone, on the
   account's Domains page.
   - The project is already disconnected from the repository and serves
     no address.
   - With the project gone the account only holds DNS records, which the
     free plan does too.
4. Delete the keys that are no longer used: the old Resend key; at
   Practice Better the old key and the read-only one made on the 22nd
   (keep the read-and-write one in use); Spotify's if there was one; the
   old Google sign-in client if you can find it.
5. Check: `gcloud run jobs list --region "${REGION}" --format="value(name)"`
   shows `rac-migrate` only.
6. Claude: remove the three Supabase database variables and the "both
   hosts" wording from `CLAUDE.md`, delete `vercel.json`, pull request.

## Everyday

### Deploy

Merge to `main`. Cloud Build builds and deploys by itself (about six
minutes). Cloud Build → History shows SUCCESS or FAILURE; a failed build
leaves the running site as it was. Every merge reaches the live site, so
merge on a day the clinic is closed, or after hours.

### Is it up?

- Google checks `https://www.ryuacupuncture.com/` every minute from
  several places (Monitoring → Uptime checks → "Clinic site is up"). If
  it fails from more than one of them for two minutes, the alert "The
  clinic website is not answering" emails the clinic's alerts inbox
  (Monitoring → Alerting → Notification channels). A test alert was sent
  and received on 2026-11-22.
- What is recorded, and for how long: every request at the load
  balancer, and who read or changed the database's settings, the secrets,
  the access rules and the service (Data Access audit logs for Cloud SQL,
  Secret Manager, IAM and Cloud Run). Logs are kept six years
  (Logging → Log storage → `_Default`).
- The database is backed up every day, with seven days of
  point-in-time recovery.

### Apply a migration

A migration goes in **before** the code that needs it, as its own merge:

1. Merge the pull request that adds the file under `supabase/migrations`.
   Wait for the build to say SUCCESS (the job now holds the new file).
2. Cloud Run → Jobs → `rac-migrate` → **Execute**.
3. Read its log: `applied <the file>`. An error: nothing of that file
   was applied; show Claude the log (it holds no patient data).
4. Then merge the code that uses it.
   - If, a minute after step 3, the site says "Database error" about
     the new table or function: Cloud Run → `rac-web` → Edit & deploy new
     revision → Deploy (no changes). That restarts the database layer.

**Not by pasting SQL into Cloud SQL Studio.** That was the way on
Supabase; here it skips two things the job does. A table made that way
has no permission for the app — it reads as empty and refuses writes —
and the migration is not recorded, so the job would try it again later.
If SQL was pasted anyway: execute `rac-migrate` afterwards (it gives the
permissions and tells the database layer to look again).

### Read the logs

Cloud Run → `rac-web` → Logs. Each line says which container wrote it.
For a job: Cloud Run → Jobs → the job → Logs.

### Roll back a bad deploy

Cloud Run → `rac-web` → Revisions → the previous revision → Manage
traffic → 100%. The next merge to `main` deploys a new revision and takes
the traffic again, so fix or revert the code before merging anything.

### Restore the database from a backup

SQL → `rac-db` → Backups. Prefer **cloning to a new instance** at a
point in time (Overview → Clone → "Clone from an earlier point in time"),
looking at the clone, and deciding with Claude — restoring over `rac-db`
itself replaces everything written since the backup.

### Changing a secret

The service takes each secret's **newest** value whenever an instance
starts. So from the moment a secret is changed, an instance that starts
later has the new value while the ones already running keep the old —
two halves of the site disagreeing. Therefore: **change a secret outside
clinic hours, and deploy straight away.**

1. `bash deploy/ops/set-secret.sh ask <name>` (or `random <name> --replace`).
2. At once: Cloud Build → Triggers → Run.
3. Two pairs must change together, in this order, before deploying:
   - `db-authenticator-password` → then `pgrst-db-uri` again (1.5.3) →
     then execute `rac-migrate` (it gives the database the new password).
   - `pgrst-jwt-secret` → then `db-rest-jwt` again (1.5.3).
4. `nextauth-secret`: avoid changing it. Staff must sign in again,
   Spotify must be reconnected, and every PIN fingerprint goes out of
   date at once — the rehearsal measured 7 to 8 seconds per PIN entry
   until each patient has signed in once more.

### The header the load balancer removes

Next.js before 15.2.3 has a known fault, CVE-2025-29927: a request
carrying the header `x-middleware-subrequest` skips the step that sends
a signed-out visitor from a staff page to the login page. The site ran
such a version (15.1.11) until it moved to 15.5.29, which refuses the
header by itself — tried by request against the built image, before and
after: 200 became 307. The staff *data* was never behind that step:
every staff address checks the sign-in again by itself and answers 401.

The load balancer still removes the header (1.8.6), and the service
cannot be reached except through it (1.10.4). That is a second lock now,
not the only one:

- Do not remove `headerAction` from the load balancer's map. More ways
  around that same page check were found in Next.js after this one
  (corrected in 15.5.16), and the removal costs nothing.
- Keep Next.js on the newest 15.5.x. It is the only 15 line that still
  gets security corrections (15.1 to 15.4 stopped in January 2026), and
  Next.js has said it gets them only until 2027-01-31. After that the
  site has to be on Next.js 16, which is its own piece of work (it needs
  React 19, among other things). To see whether a newer 15.5 exists:
  `npm view next dist-tags.backport`. Tell Claude when it shows a number
  above the one in `package.json`.

## When something is wrong

- **A revision does not start; the log's last lines are from
  `cloud-sql-proxy`.** The account `rac-app` lacks the role Cloud SQL
  Client, or the instance name in the rendered file is not
  `<project>:us-west1:rac-db`.
- **…the last lines are from `postgrest`, about a password or a role.**
  `rac-migrate` has not run, or `pgrst-db-uri` was made before
  `db-authenticator-password` changed. Redo 1.5.3, execute `rac-migrate`,
  deploy.
- **…`postgrest` says the JWT secret is too short.** `pgrst-jwt-secret`
  was not made with `set-secret.sh random`.
- **Every page that needs the database says "Database error" or "One
  moment, please".** Cloud Run → `rac-web` → Logs. `401` from PostgREST:
  `db-rest-jwt` does not belong to `pgrst-jwt-secret` — redo 1.5.3 and
  deploy.
- **A build fails in the step `app-image` with "An error occurred in
  `next/font`".** The build fetches the site's fonts from Google and now
  and then gets an answer it cannot use (it happened on the trigger's
  very first run). The image build tries three times by itself; if all
  three fail, nothing running is touched: press Run again (or repeat the
  build command).
- **`--dry-run` (1.7.5) refuses the file.** Tell Claude the message.
  Known soft spots in `deploy/service.template.yaml`, none of which
  could be tried without a project:
  - the two sidecars ask for less than one CPU (`500m`, `250m`); if
    Google wants whole CPUs there, both become `"1"`;
  - their start-up checks are plain HTTP on ports 3002 and 9090; if
    Cloud Run cannot reach the proxy's, its check becomes
    `tcpSocket: { port: 5432 }` with `--address=0.0.0.0`.
- **Check 1.10.5 says 200.** Two things failed together. The site is
  running a build older than the move to Next.js 15.5.29 (Cloud Run →
  `rac-web` → Revisions: which build is serving?), and the load balancer
  is not removing the header: the map was imported without
  `headerAction`, or Google does not apply it where it stands. See the
  map as Google holds it:
  `gcloud compute url-maps describe rac-web-map --global`. If
  `headerAction` is there, tell Claude: the same removal can be written
  on a route rule instead (the form Google's own example uses).
- **`rac-migrate` or `rac-copy-data` cannot connect, or says "Malformed
  CloudSQL instance string".** Make the job again with the command of
  1.7.3 exactly as written, braces included, and check step 1.5.2 was done.
- **The certificate stays `PROVISIONING` or says `FAILED`.** Step 1.8.5
  says how to read the reason.
- **Vercel shows a certificate warning for the domain before Part 4.**
  Tell Claude: the three `_acme-challenge` records of 1.8.4 may be in the
  way of Vercel's own renewal. It matters only if the way back is taken.

## What was checked, and what was not

Checked on a computer, with made-up data (see the pull request):

- the app, PostgREST and Postgres 17 together, in Docker, from the same
  images; every kind of query the app makes; the copy and migrate
  scripts; the secret helper; that the request of check 1.10.5 is
  answered 200 by the container on Next.js 15.1.11 and 307 by the
  container on 15.5.29.

Done in the real project by 2026-11-22: 1.1 to 1.5, and 1.7.1 to 1.7.4.

Not checkable without the real project — Part 1 is where they are
settled, and each has a check above:

- that the three containers start in order on Cloud Run (1.10.6);
- that Google accepts the service definition as written (1.7.5);
- that the load balancer removes the header where the map says. Since
  Next.js 15.5.29 no request can show it (the site refuses the header
  either way — 1.10.5); what can be seen is that the map holds the rule;
- which place in `x-forwarded-for` holds the caller's address (1.10.7);
- the load balancer and certificate commands of 1.8, which were written
  from Google's documentation and not run;
- that the Realtime project's secret key is accepted by the daily ping
  (1.9), and that the ping is enough to keep a free project awake.
