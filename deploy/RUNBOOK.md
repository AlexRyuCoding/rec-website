# Runbook — the site on Google Cloud

For the owner. One action per numbered line, what you should see after
it, and what to do if you see something else. Where a line is a command,
it is typed in the Terminal app, in the folder of this repository.

Nothing in this file is secret, and the real project id is not in it:
commands say `$PROJECT_ID`, which your terminal fills in (see "Every time
you open a terminal").

- [Rules that always hold](#rules-that-always-hold)
- [Every time you open a terminal](#every-time-you-open-a-terminal)
- [Part 1 — Build the Google Cloud side, with made-up data](#part-1--build-the-google-cloud-side-with-made-up-data)
- [Part 2 — Move live updates, while still on Vercel](#part-2--move-live-updates-while-still-on-vercel)
- [Part 3 — Rehearsal with real data](#part-3--rehearsal-with-real-data)
- [Part 4 — The switch (Tuesday 2026-11-24, clinic closed)](#part-4--the-switch-tuesday-2026-11-24-clinic-closed)
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

## Every time you open a terminal

1. `cd` into this repository's folder.
2. `gcloud config get-value project`
   - You should see the clinic's project id.
   - If not: `gcloud auth login`, then `gcloud config set project` followed
     by the project id (it is on the Google Cloud console's home page).
3. `export PROJECT_ID="$(gcloud config get-value project)"`
   - Nothing is printed. Every command below uses `$PROJECT_ID`.
4. `export REGION=us-west1`

## Part 1 — Build the Google Cloud side, with made-up data

Nothing here touches a patient. Needs: `gcloud` signed in, Docker
running, Node installed.

### 1.1 Project basics — done on 2026-11-22

Already done by hand. The commands that were used, for the record; each
is safe to run again.

```sh
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com certificatemanager.googleapis.com \
  compute.googleapis.com cloudscheduler.googleapis.com

for account in rac-app rac-ops; do
  gcloud iam service-accounts describe "$account@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$account"
  for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
      --member="serviceAccount:$account@$PROJECT_ID.iam.gserviceaccount.com" --role="$role" >/dev/null
  done
done
```

- `rac-app` is what the site runs as; `rac-ops` is what the two jobs run as.

### 1.2 The database — done on 2026-11-22

Already done by hand. The command that was used:

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
  exists). To see that it is there: `gcloud sql instances describe rac-db --format="value(state,databaseVersion)"`
  → `RUNNABLE POSTGRES_17`.
- No database user has a password yet. That is step 1.5.

### 1.3 A place for the images, and an account for the builds

1. `gcloud artifacts repositories describe rac --location="$REGION" >/dev/null 2>&1 || gcloud artifacts repositories create rac --repository-format=docker --location="$REGION"`
   - You should see `Created repository [rac]`, or nothing if it exists.
2. Make the account Cloud Build works as, and let it build and deploy:

   ```sh
   gcloud iam service-accounts describe "rac-build@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 \
     || gcloud iam service-accounts create rac-build
   for role in roles/cloudbuild.builds.builder roles/run.admin; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
       --member="serviceAccount:rac-build@$PROJECT_ID.iam.gserviceaccount.com" --role="$role" >/dev/null
   done
   for account in rac-app rac-ops; do
     gcloud iam service-accounts add-iam-policy-binding "$account@$PROJECT_ID.iam.gserviceaccount.com" \
       --member="serviceAccount:rac-build@$PROJECT_ID.iam.gserviceaccount.com" \
       --role=roles/iam.serviceAccountUser >/dev/null
   done
   ```

   - Nothing is printed. An error that mentions a permission: stop and
     show Claude the error (it contains no secret).

### 1.4 The Realtime project — done on 2026-11-22

A new, free Supabase project that will never hold patient data: it only
carries "something changed, look again" between screens. Already made.
What was run in its SQL editor:

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

### 1.5 Secrets

Each line stores one secret. You will see `stored: <name> (<n> characters)`
and never the value. If you see anything else, stop.

1. Made up by the computer (run each line once):

   ```sh
   bash deploy/ops/set-secret.sh random db-postgres-password
   bash deploy/ops/set-secret.sh random db-authenticator-password
   bash deploy/ops/set-secret.sh random pgrst-jwt-secret
   bash deploy/ops/set-secret.sh random nextauth-secret
   bash deploy/ops/set-secret.sh random cron-secret
   bash deploy/ops/set-secret.sh random pb-webhook-verification-token
   ```

   - Run a line twice and the second time says `already has a value; it
     was left alone`. That is the script protecting you; nothing to do.

2. Give the database's administrator its password (nothing is shown):

   ```sh
   gcloud sql users set-password postgres --instance=rac-db \
     --password="$(gcloud secrets versions access latest --secret=db-postgres-password)"
   ```

   - You should see `Updating Cloud SQL user...done.`

3. Two secrets made from the ones above, each piped straight from
   Secret Manager back into Secret Manager:

   ```sh
   # The address PostgREST logs in to the database with.
   printf 'postgres://authenticator:%s@127.0.0.1:5432/rac' \
     "$(gcloud secrets versions access latest --secret=db-authenticator-password)" \
     | bash deploy/ops/set-secret.sh stdin pgrst-db-uri

   # The token the app shows PostgREST, signed with PostgREST's secret.
   gcloud secrets versions access latest --secret=pgrst-jwt-secret \
     | node scripts/mint-db-jwt.js \
     | bash deploy/ops/set-secret.sh stdin db-rest-jwt
   ```

   - You should see `stored: pgrst-db-uri (108 characters)` and
     `stored: db-rest-jwt (112 characters)`.

4. Typed or pasted by you. Each line asks for the value; what you type
   stays hidden; press Enter.

   ```sh
   bash deploy/ops/set-secret.sh ask allowed-admin-emails     # staff Google accounts, separated by commas
   bash deploy/ops/set-secret.sh ask google-client-id         # from step 1.6
   bash deploy/ops/set-secret.sh ask google-client-secret     # from step 1.6
   bash deploy/ops/set-secret.sh ask pb-client-id             # Practice Better, newly issued
   bash deploy/ops/set-secret.sh ask pb-client-secret
   bash deploy/ops/set-secret.sh ask resend-api-key           # Resend, newly issued
   bash deploy/ops/set-secret.sh ask resend-from-email        # e.g. forms@ryuacupuncture.com
   bash deploy/ops/set-secret.sh ask realtime-service-key     # the Realtime project's SECRET key (sb_secret_…)
   ```

5. Two that get their real value later; for now, a stand-in so the
   service and the copy job can be made:

   ```sh
   printf 'not-yet' | bash deploy/ops/set-secret.sh stdin pb-webhook-signing-secret   # real value: Part 4
   printf 'not-yet' | bash deploy/ops/set-secret.sh stdin source-database-url         # real value: Part 3
   ```

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

1. `export REALTIME_URL=` followed by the address, and
   `export REALTIME_ANON_KEY=` followed by the publishable key.
2. Build the images, without deploying yet (the database has no tables):

   ```sh
   gcloud builds submit . --config cloudbuild.yaml --region "$REGION" \
     --service-account "projects/$PROJECT_ID/serviceAccounts/rac-build@$PROJECT_ID.iam.gserviceaccount.com" \
     --substitutions "_DEPLOY_SERVICE=false,_NEXTAUTH_URL=https://new.ryuacupuncture.com,_REALTIME_URL=$REALTIME_URL,_REALTIME_ANON_KEY=$REALTIME_ANON_KEY"
   ```

   - Takes about ten minutes. You should see `SUCCESS` at the end.
   - `FAILURE` in the step `app-image` with "build arguments … are both
     required": step 1 was skipped in this terminal window.

3. Make the two jobs:

   ```sh
   SOCKET="/cloudsql/$PROJECT_ID:$REGION:rac-db"
   gcloud run jobs deploy rac-migrate --region "$REGION" \
     --image "$REGION-docker.pkg.dev/$PROJECT_ID/rac/ops:latest" \
     --service-account "rac-ops@$PROJECT_ID.iam.gserviceaccount.com" \
     --set-cloudsql-instances "$PROJECT_ID:$REGION:rac-db" \
     --set-env-vars "PGHOST=$SOCKET,PGUSER=postgres,PGDATABASE=rac" \
     --set-secrets "PGPASSWORD=db-postgres-password:latest,AUTHENTICATOR_PASSWORD=db-authenticator-password:latest" \
     --command /app/deploy/ops/migrate.sh --max-retries 0 --task-timeout 10m

   gcloud run jobs deploy rac-copy-data --region "$REGION" \
     --image "$REGION-docker.pkg.dev/$PROJECT_ID/rac/ops:latest" \
     --service-account "rac-ops@$PROJECT_ID.iam.gserviceaccount.com" \
     --set-cloudsql-instances "$PROJECT_ID:$REGION:rac-db" \
     --set-env-vars "PGHOST=$SOCKET,PGUSER=postgres,PGDATABASE=rac" \
     --set-secrets "PGPASSWORD=db-postgres-password:latest,SOURCE_DATABASE_URL=source-database-url:latest" \
     --command /app/deploy/ops/copy-data.sh --max-retries 0 --task-timeout 30m
   ```

   - `rac-copy-data` is given no argument on purpose: started without one
     it does nothing and says how to use it.

4. Build the database: `gcloud run jobs execute rac-migrate --region "$REGION" --wait`
   - You should see the execution finish successfully.
   - Read its log (newest line first):
     `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="rac-migrate"' --freshness=15m --format="value(textPayload)"`
     → one line `applied 0001_patient_signin.sql` … for every file in
     `supabase/migrations`. Run the job a second time: `nothing to apply`.
   - It failed with "connection" in the log: see "When something is wrong".

5. Look before deploying. This changes nothing:

   ```sh
   . deploy/versions.env
   PROJECT_ID="$PROJECT_ID" NEXTAUTH_URL=https://new.ryuacupuncture.com \
     IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/rac/web:latest" \
     POSTGREST_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/rac/postgrest:$POSTGREST_VERSION" \
     bash deploy/render-service.sh > /tmp/rac-web.yaml
   gcloud run services replace /tmp/rac-web.yaml --region "$REGION" --dry-run
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

1. Reserve the address the site will have:

   ```sh
   gcloud compute addresses create rac-web-ip --network-tier=PREMIUM --ip-version=IPV4 --global
   gcloud compute addresses describe rac-web-ip --global --format="value(address)"
   ```

   - You should see one address like `203.0.113.10`. Write it down: it
     is not a secret.

2. Ask Google for a certificate, and get the three records that prove
   the domain is the clinic's:

   ```sh
   gcloud certificate-manager dns-authorizations create rac-auth-www  --domain="www.ryuacupuncture.com"
   gcloud certificate-manager dns-authorizations create rac-auth-bare --domain="ryuacupuncture.com"
   gcloud certificate-manager dns-authorizations create rac-auth-new  --domain="new.ryuacupuncture.com"
   for name in rac-auth-www rac-auth-bare rac-auth-new; do
     gcloud certificate-manager dns-authorizations describe "$name" \
       --format="value(dnsResourceRecord.name,dnsResourceRecord.type,dnsResourceRecord.data)"
   done
   ```

   - You should see three lines, each a name starting `_acme-challenge.`,
     the word `CNAME`, and a long name ending `authorize.certificatemanager.goog.`

3. In Vercel → the domain `ryuacupuncture.com` → DNS records, **add**
   four records. Add only; change and delete nothing — the clinic's
   email depends on the records already there.
   - three `CNAME` records, name and value exactly as printed in step 2;
   - one `A` record: name `new`, value the address from step 1.

4. Make the certificate and wait for it:

   ```sh
   gcloud certificate-manager certificates create rac-cert \
     --domains="www.ryuacupuncture.com,ryuacupuncture.com,new.ryuacupuncture.com" \
     --dns-authorizations="rac-auth-www,rac-auth-bare,rac-auth-new"
   gcloud certificate-manager certificates describe rac-cert --format="value(managed.state)"
   ```

   - Repeat the second line every few minutes until it says `ACTIVE`.
   - Still not `ACTIVE` after an hour: one of the three CNAME records is
     not as printed. Compare them letter by letter.

5. Build the load balancer:

   ```sh
   gcloud certificate-manager maps create rac-cert-map
   for host in www.ryuacupuncture.com ryuacupuncture.com new.ryuacupuncture.com; do
     gcloud certificate-manager maps entries create "rac-entry-${host%%.*}" \
       --map=rac-cert-map --certificates=rac-cert --hostname="$host"
   done

   gcloud compute network-endpoint-groups create rac-web-neg --region="$REGION" \
     --network-endpoint-type=serverless --cloud-run-service=rac-web
   gcloud compute backend-services create rac-web-backend \
     --load-balancing-scheme=EXTERNAL_MANAGED --global
   gcloud compute backend-services add-backend rac-web-backend --global \
     --network-endpoint-group=rac-web-neg --network-endpoint-group-region="$REGION"

   # https://ryuacupuncture.com/… goes to https://www.ryuacupuncture.com/…
   printf '%s\n' \
     "name: rac-web-map" \
     "defaultService: projects/$PROJECT_ID/global/backendServices/rac-web-backend" \
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

   # http:// goes to https://
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

   - Run these with Claude, one block at a time: they were written from
     Google's documentation and have not been run. A command that says
     `already exists` was done before; go on to the next.
   - Then wait about ten minutes: a new load balancer answers slowly at first.

6. A budget alert, in the console: Billing → Budgets & alerts → Create
   budget → amount $100 a month, email alerts on.

### 1.9 The daily ping

```sh
gcloud scheduler jobs create http rac-keepalive --location "$REGION" \
  --schedule "0 15 * * *" --time-zone "Etc/UTC" --http-method GET \
  --uri "https://new.ryuacupuncture.com/api/cron/keepalive" \
  --headers "Authorization=Bearer $(gcloud secrets versions access latest --secret=cron-secret)"
gcloud scheduler jobs run rac-keepalive --location "$REGION"
```

- Then, in the console: Cloud Scheduler → `rac-keepalive` → "Last run
  result" should say **Success**.
- **Failed**: Cloud Run → `rac-web` → Logs, look for `/api/cron/keepalive`.
  A 401 means the ping's secret is not the service's; a 500 means the
  Realtime project did not answer its secret key — check
  `realtime-service-key` (1.5.4) and the table of step 1.4, then deploy
  again (the service reads secrets when it starts).

### 1.10 Checks — every one must hold before Part 3

1. `curl -sI https://new.ryuacupuncture.com/ | head -1` → `HTTP/2 200`.
2. `curl -sI --tls-max 1.1 https://new.ryuacupuncture.com/ | head -1` →
   an error about the connection or protocol version, no `HTTP` line.
3. `curl -sI http://new.ryuacupuncture.com/ | grep -i "^HTTP\|^location"`
   → `301` and `location: https://new.ryuacupuncture.com/`.
4. The service's own address refuses the internet:
   `curl -s -o /dev/null -w "%{http_code}\n" "$(gcloud run services describe rac-web --region "$REGION" --format="value(status.url)")"`
   → `404` (or `403`), never `200`.
5. Three containers started, in order: Cloud Run → `rac-web` → Logs,
   newest revision: lines from `cloud-sql-proxy` ("ready for new
   connections"), then `postgrest` ("Schema cache loaded"), then `app`
   ("Ready in"). And a new revision's first page opens in under 10 seconds.
6. **The caller's address.** From your own computer:

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
7. Staff sign-in with Google works at `https://new.ryuacupuncture.com/admin/login`;
   a Google account that is not on the list is refused.
8. With a made-up patient. Add one in Cloud SQL Studio (as in check 6):

   ```sql
   insert into patients (first_name, last_name, phone, pb_client_id)
   values ('Madeup', 'Testperson', '(555) 010-0100', 'made-up-1');
   ```

   Then: on the kiosk page, "First time here?" with that phone number —
   PIN set-up and check-in work; the patient appears on the rooms board;
   a room assignment made in one browser shows in a second browser
   within a second; the waiting-room page pairs and shows the call.
   (The made-up patient is removed by check 10.)
9. The daily ping, run by hand (1.9), says Success.
10. `gcloud run jobs execute rac-copy-data --region "$REGION" --args=empty --wait`,
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
5. Connect the repository to Cloud Build (console, cannot be scripted):
   Cloud Build → Triggers → Connect repository → GitHub → this
   repository. Then Create trigger: event "Push to a branch", branch
   `^main$`, configuration `cloudbuild.yaml`, service account
   `rac-build`, and under Substitution variables:
   - `_REALTIME_URL` — the Realtime project's address
   - `_REALTIME_ANON_KEY` — its publishable key
   - `_NEXTAUTH_URL` — `https://new.ryuacupuncture.com` (changed in Part 4)

## Part 3 — Rehearsal with real data

1. **Gate.** You have accepted Google Cloud's BAA (keep a screenshot)
   and reset the Supabase database password.
2. Store the old database's address. In Supabase → the OLD project →
   Connect → **Session pooler**, copy the connection string, put the
   password in place of `[YOUR-PASSWORD]` in a text field of your own
   (not in this folder), then:
   `bash deploy/ops/set-secret.sh ask source-database-url`
   - It must be the *session pooler* string: Cloud Run cannot reach the
     "direct connection" address.
3. `gcloud run jobs execute rac-copy-data --region "$REGION" --args=copy --wait`
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
   wrong one. Time "Checking…" for each.
   - More than 5 seconds for either: **stop** and discuss before Part 4.
7. Empty it again:
   `gcloud run jobs execute rac-copy-data --region "$REGION" --args=empty --wait`
   → nine lines ending `dest=0`.

## Part 4 — The switch (Tuesday 2026-11-24, clinic closed)

1. **Stop the old side.** Vercel → the project → Settings → Domains:
   remove `www.ryuacupuncture.com` and `ryuacupuncture.com` from the
   project. The site is now offline, so nothing can write to Supabase.
2. **Copy.** `gcloud run jobs execute rac-copy-data --region "$REGION" --args=copy --wait`
   → nine lines ending `ok`.
3. **Give the app its real address.** In the Cloud Build trigger, change
   `_NEXTAUTH_URL` to `https://www.ryuacupuncture.com` and press Run.
   When it says SUCCESS:
   `gcloud scheduler jobs update http rac-keepalive --location "$REGION" --uri "https://www.ryuacupuncture.com/api/cron/keepalive"`
4. **DNS.** In Vercel → the domain → DNS records:
   - `A` record, name `www`, value the load balancer's address (1.8.1);
   - `A` record, name `@` (the bare domain), the same value.
   - Then look at the whole list: no other record (CNAME, ALIAS, AAAA)
     may be left for `www` or for the bare domain. Touch nothing else —
     above all not the `MX` and `TXT` records (email).
5. **Checks, in this order:**
   1. `https://www.ryuacupuncture.com` opens, with a padlock.
   2. Staff sign-in.
   3. The kiosk tablet shows the PIN pad without asking to pair.
   4. The waiting-room TV shows its screen without a pairing code.
   5. A PIN check-in, by a staff member's own test patient.
   6. A room assignment crossing to a second board within a second.
   7. The appointment form sends its email.
   8. An email sent to the clinic's address still arrives.
6. **Practice Better webhook.** Do this yourself, in a terminal window
   Claude is not using: the one command here that prints a secret is
   Practice Better's own script.
   1. Give the script what it needs, without showing it:

      ```sh
      for pair in PB_CLIENT_ID=pb-client-id PB_CLIENT_SECRET=pb-client-secret \
        PB_WEBHOOK_VERIFICATION_TOKEN=pb-webhook-verification-token; do
        printf '%s=%s\n' "${pair%%=*}" "$(gcloud secrets versions access latest --secret="${pair#*=}")" >> .env.local
      done
      ```

   2. `node scripts/setup-pb-webhook.js` — it prints the signing secret,
      once. Copy it.
   3. `bash deploy/ops/set-secret.sh ask pb-webhook-signing-secret`,
      paste, Enter. Then clear the terminal window (`clear`, and close it).
   4. Delete the three lines step 1 added to `.env.local`.
   5. Press Run on the Cloud Build trigger (the service reads secrets
      when it starts).
   6. Remove the old subscription in Practice Better. Edit a test client
      there and see the change arrive in the dashboard's patient search;
      then Dashboard → Setup → Quick sync.
7. Reconnect Spotify from the dashboard, if the clinic uses it.

**The way back — only until the first real check-in on the new side.**
Delete the two `A` records of step 4 and add both domains back to the
Vercel project. Decide by the end of Tuesday: if a check of step 5 fails
and is not fixed that day, go back.

## Part 5 — Clean up, after two normal clinic days

1. You confirm two clinic days ran without a hosting problem.
2. Delete the OLD Supabase project (it held every patient). Not the
   Realtime one.
3. Delete the Vercel project and its environment variables. Keep the
   Vercel account: it still hosts the domain's DNS.
4. Revoke the old keys at Practice Better, Resend and Spotify; delete the
   old Google sign-in client if you can find it.
5. `gcloud run jobs delete rac-copy-data --region "$REGION"`,
   `gcloud secrets delete source-database-url`, delete the DNS record
   `new` in Vercel, and remove the `new.` redirect address from the
   Google sign-in client (1.6).
6. Claude: remove the three Supabase database variables and the "both
   hosts" note from `CLAUDE.md`, delete `vercel.json`, pull request.

## Everyday

### Deploy

Merge to `main`. Cloud Build builds and deploys by itself (about ten
minutes). Cloud Build → History shows SUCCESS or FAILURE; a failed build
leaves the running site as it was.

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

1. `bash deploy/ops/set-secret.sh ask <name>` (or `random <name> --replace`).
2. Deploy: Cloud Build → Triggers → Run. Running instances keep the old
   value until then.
3. Two pairs must change together, in this order, before deploying:
   - `db-authenticator-password` → then `pgrst-db-uri` again (1.5.3) →
     then execute `rac-migrate` (it gives the database the new password).
   - `pgrst-jwt-secret` → then `db-rest-jwt` again (1.5.3).
4. `nextauth-secret`: staff sign in again, every patient's first PIN
   entry is slower once, and Spotify must be reconnected.

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
- **`--dry-run` (1.7.5) refuses the file.** Tell Claude the message.
  Known soft spots in `deploy/service.template.yaml`, none of which
  could be tried without a project:
  - the two sidecars ask for less than one CPU (`500m`, `250m`); if
    Google wants whole CPUs there, both become `"1"`;
  - their start-up checks are plain HTTP on ports 3002 and 9090; if
    Cloud Run cannot reach the proxy's, its check becomes
    `tcpSocket: { port: 5432 }` with `--address=0.0.0.0`.
- **`rac-migrate` or `rac-copy-data` cannot connect.** The job lacks
  the Cloud SQL connection or the password: make the job again (1.7.3;
  the command is safe to repeat) and check step 1.5.2 was done.
- **The certificate stays `PROVISIONING`.** A CNAME record of 1.8.3 is
  missing or misspelt.
- **Vercel shows a certificate warning for the domain before Part 4.**
  Tell Claude: the three `_acme-challenge` records of 1.8.3 may be in the
  way of Vercel's own renewal. It matters only if the way back is taken.

## What was checked, and what was not

Checked on a computer, with made-up data (see the pull request):

- the app, PostgREST and Postgres 17 together, in Docker, from the same
  images; every kind of query the app makes; the copy and migrate
  scripts; the secret helper.

Not checkable without the real project — Part 1 is where they are
settled, and each has a check above:

- that the three containers start in order on Cloud Run (1.10.5);
- that Google accepts the service definition as written (1.7.5);
- which place in `x-forwarded-for` holds the caller's address (1.10.6);
- the load balancer and certificate commands of 1.8, which were written
  from Google's documentation and not run;
- that the Realtime project's secret key is accepted by the daily ping
  (1.9), and that the ping is enough to keep a free project awake.
