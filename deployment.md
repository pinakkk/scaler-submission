# Deployment guide

This runbook deploys the FastAPI/WebSocket backend to Fly.io and the Next.js/OpenNext frontend to Cloudflare Workers. Use account-owned credentials; do not commit secrets or paste them into `fly.toml`/`wrangler.toml`.

## 1. Prerequisites

Install and authenticate:

```bash
brew install flyctl
npm install -g wrangler
fly auth login
wrangler login
```

You also need a Google Cloud project with an OAuth consent screen and an OAuth 2.0 **Web application** client.

Choose globally unique names before continuing:

```text
FLY_APP=<your-unique-api-name>
WORKER_NAME=<your-unique-web-name>
FLY_REGION=sin
```

Replace `app` in `api/fly.toml` and `name` in `web/wrangler.toml` with these values. Replace every `<your-api>` placeholder with the final Fly hostname.

## 2. Create Google OAuth credentials

In Google Cloud Console:

1. Configure the OAuth consent screen. Publish it or add every evaluator as a test user.
2. Create an OAuth 2.0 client of type **Web application**.
3. Add authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://<WORKER_NAME>.<your-workers-subdomain>.workers.dev`
4. Add redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<WORKER_NAME>.<your-workers-subdomain>.workers.dev/api/auth/callback/google`
5. Save the client ID and client secret. The API's `GOOGLE_CLIENT_ID` and the web app's `AUTH_GOOGLE_ID` must be the same client ID.

Generate independent secrets:

```bash
openssl rand -base64 48  # FastAPI SECRET_KEY
openssl rand -base64 32  # Auth.js AUTH_SECRET
```

## 3. Deploy FastAPI to Fly.io

From `api/`:

```bash
cd api
fly apps create <FLY_APP>
fly volumes create zoom_data --region <FLY_REGION> --size 1 --app <FLY_APP>
```

Confirm `fly.toml` has:

- `app = "<FLY_APP>"`
- the same `primary_region`
- `DATABASE_URL = "sqlite:////data/zoom.db"`
- one `shared-cpu-1x`/512 MB VM
- `min_machines_running = 1`
- `auto_stop_machines = false`
- one volume mounted at `/data`
- health path `/api/v1/health`

Set secrets. Initially allow the eventual Workers origin; if the Workers URL is not known yet, deploy once with localhost and update CORS immediately after frontend deployment.

```bash
fly secrets set \
  SECRET_KEY='<generated-fastapi-secret>' \
  GOOGLE_CLIENT_ID='<google-client-id>' \
  --app <FLY_APP>

fly deploy --app <FLY_APP>
fly status --app <FLY_APP>
curl --fail https://<FLY_APP>.fly.dev/api/v1/health
```

Seed the mounted production database once:

```bash
fly ssh console --app <FLY_APP> -C "python -m app.seed"
```

Do not run `--reset` against production unless you intend to delete all application data.

Optional but strongly recommended for internet media tests:

```bash
fly secrets set \
  TURN_URLS='turn:turn.example.com:3478,turns:turn.example.com:5349' \
  TURN_USERNAME='<turn-user>' \
  TURN_CREDENTIAL='<turn-password>' \
  --app <FLY_APP>
```

## 4. Configure and deploy Cloudflare Workers

Edit `web/wrangler.toml`:

```toml
name = "<WORKER_NAME>"

[vars]
API_HEALTH_URL = "https://<FLY_APP>.fly.dev/api/v1/health"
```

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so they must be set **before** the OpenNext build. They are not secrets.

Fill them in `web/.env.production` — `npm run cf:build` loads that file and injects it into the build automatically.

> Do not rely on Next.js to pick the file up on its own: `.env.local` is loaded in every environment except `test` and takes priority over `.env.production`, so an unguarded build would bake in your localhost URLs. The `cf:build` script passes the values as real environment variables, which outrank both files.

```bash
cd ../web
npm ci

npm run typecheck
npm run typecheck:worker
npm test -- --run
npm run cf:build
```

Store server-only values as Worker secrets:

```bash
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
npx wrangler secret put AUTH_SECRET
npx wrangler secret put NEXTAUTH_URL
```

Enter the values when prompted, then deploy:

```bash
npm run cf:deploy
```

If the deployment receives a different URL than expected, update `NEXTAUTH_URL`, the Google authorized origin/redirect URI, rebuild with the correct public values, and deploy again.

## 5. Lock backend CORS to the deployed frontend

Update `api/fly.toml`:

```toml
CORS_ORIGINS = "https://<WORKER_NAME>.<your-workers-subdomain>.workers.dev"
```

Then redeploy the API:

```bash
cd ../api
fly deploy --app <FLY_APP>
```

For a custom domain, include that HTTPS origin too, separated by a comma.

## 6. Verify cron keep-alive

The Worker declares `*/5 * * * *` and calls the cheap API health endpoint.

Local scheduled-handler check (run the preview command in one terminal):

```bash
cd web
npx wrangler dev --test-scheduled
```

Then from another terminal:

```bash
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

In Cloudflare Dashboard, open **Workers & Pages → your Worker → Triggers** and confirm the cron is active. Check Worker logs for `keepalive 200` and confirm Fly remains on one running machine.

## 7. Production verification checklist

```bash
curl --fail https://<FLY_APP>.fly.dev/api/v1/health
curl -I https://<WORKER_NAME>.<your-workers-subdomain>.workers.dev
```

Then verify in browsers:

- [ ] Sign in with Google and refresh without losing the app session.
- [ ] Create an instant meeting and copy its invite URL.
- [ ] Open the invite in a signed-out/private browser and join as a guest.
- [ ] Schedule a meeting and confirm it appears on Home and Meetings.
- [ ] Join the same room in two browser profiles and exchange audio/video.
- [ ] Host mute-all and remove-participant actions affect the target browser.
- [ ] Host end-for-all redirects every participant.
- [ ] Refresh mid-meeting rejoins cleanly.
- [ ] Denying camera/microphone shows a fallback rather than crashing.
- [ ] Settings save and are applied on the next join.
- [ ] Cloudflare logs show a successful keep-alive every five minutes.

## 8. Operations and rollback

View logs:

```bash
fly logs --app <FLY_APP>
npx wrangler tail
```

Fly releases can be listed and rolled back with `fly releases` / `fly releases rollback`. Cloudflare Worker deployments can be rolled back from **Deployments** in the dashboard or with Wrangler's deployment rollback command for the installed CLI version.

Back up SQLite before risky changes:

```bash
fly ssh sftp get --app <FLY_APP> /data/zoom.db ./zoom-production-backup.db
```

Never run multiple Fly machines or Uvicorn workers with the current in-process `RoomRegistry`; doing so splits signaling rooms. Horizontal scaling requires shared room coordination first.
