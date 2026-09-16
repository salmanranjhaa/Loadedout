# Deploying LoadedOut

LoadedOut runs as a self-contained Docker Compose stack on a single GCP Compute
Engine VM. There is no Cloud SQL, no Artifact Registry and no image push step —
images are built on the VM straight from the checked-out repo.

> Superseded 2026-09-16. This file previously described a Cloud SQL + Artifact
> Registry deployment on a VM named `lifeplan-vm` in `europe-west6`. That setup
> is gone; the stack was migrated to the VM documented below.

---

## The production VM

| | |
|---|---|
| Instance | `doosra-prod` |
| Zone | `europe-west12-c` |
| GCP project | `project-4729265c-0c39-424d-84d` |
| Machine type | `e2-highmem-2` (2 vCPU, 16 GB) |
| External IP | `34.17.132.101` (static — referenced by `Caddyfile` and DNS) |
| Checkout path | `/home/docloud19/projects/loaded-out` |

```bash
gcloud compute ssh --zone europe-west12-c doosra-prod --project project-4729265c-0c39-424d-84d
```

Two things to know before you touch anything:

- **The checkout is owned by `docloud19`.** `gcloud compute ssh` logs you in as
  your own user, so git will refuse the repo with a "dubious ownership" error.
  Either work as `sudo -u docloud19` or pass
  `git -c safe.directory=/home/docloud19/projects/loaded-out`.
- **This VM is shared.** It also runs erp-rag, polaris, polaris_internal,
  pitwall, bondcheck, gre-vocab-v2 and portfolio. Anything you restart that is
  not scoped to this stack affects other projects — see *Shared Caddy* below.

---

## Stack layout

Deploys run from `infra/`, so the Compose project name is **`infra`** and every
container is named `infra-<service>-1`.

| Service | Container | Image | Exposure |
|---|---|---|---|
| `frontend` | `infra-frontend-1` | Caddy + built React SPA | **host `:80` and `:443`** |
| `backend` | `infra-backend-1` | FastAPI / uvicorn | internal `:8000` |
| `mcp` | `infra-mcp-1` | MCP server | internal `:8003` |
| `db` | `infra-db-1` | `pgvector/pgvector:pg16` | internal `:5432` |
| `mongo` | `infra-mongo-1` | `mongo:7` | internal `:27017` |

Only the frontend binds host ports. Postgres, Mongo, the backend and the MCP
server are reachable only on the `lifeplan-net` bridge network.

The network and all volumes are declared `external` in
`docker-compose.prod.yml` — they predate the current Compose project name and
are reused in place rather than recreated:

```
lifeplan-net            lifeplan-pgdata      lifeplan-mongodata
lifeplan-gifs           lifeplan-caddy-data  lifeplan-caddy-config
```

If you ever delete these, the data is gone. `docker compose down -v` will not
touch them (external volumes are never removed by Compose), but an explicit
`docker volume rm` will.

### Shared Caddy

`infra-frontend-1` is the **only thing on the VM bound to :80/:443**. It
terminates TLS and reverse-proxies for *every* project on the box, not just
LoadedOut. Restarting or rebuilding it briefly takes all of them down.

`infra/Caddyfile` is **baked into the frontend image** (`COPY infra/Caddyfile`
in `frontend/Dockerfile`), so editing it has no effect until the frontend image
is rebuilt. There is no bind mount and no `caddy reload` shortcut.

---

## Routine deploy

```bash
cd /home/docloud19/projects/loaded-out
sudo -u docloud19 git pull
cd infra
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Backend-only change (leaves the shared Caddy untouched — prefer this):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend
```

Caddy/frontend change — build first, then swap, to keep the outage to seconds:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d frontend
```

Validate the Caddyfile before you recreate anything:

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

### Migrations

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend alembic current
```

---

## Configuration and secrets

Everything lives in `infra/.env.prod`, which is **gitignored and exists only on
the VM**. `infra/.env.prod.example` lists the keys. It is the single source for
`SECRET_KEY`, `POSTGRES_PASSWORD`, the Google OAuth client credentials, the
Groq fallback key and `WORKOUTX_API_KEY`.

`docker-compose.prod.yml` overrides the DB URLs so the values in `.env.prod`
never have to match container hostnames.

Vertex AI authenticates via **Application Default Credentials from the GCE
metadata server** — the VM's service account. `GOOGLE_APPLICATION_CREDENTIALS`
is deliberately set to the empty string; there is no key file on the VM and
none should be added.

Also present on the VM but not in git:

- `infra/secrets/loadedout-release.keystore` — Android release signing key.
  **There is no other copy. Losing it means no more updates to the published
  APK.**
- `infra/apk/loadedout.apk` — bind-mounted into the frontend at
  `/usr/share/caddy/loadedout.apk` and served from
  `https://loadedout.online/loadedout.apk`. Drop a new build in place to ship
  it; no rebuild needed.

---

## Cron jobs

Both run as `docloud19` and log to `~/backups/loadedout/`:

```
20 3 * * *   infra/backup.sh       # Postgres + Mongo dumps, 14-day rotation
*/5 * * * *  infra/healthcheck.sh  # probes /api/v1/health, alerts via ntfy.sh,
                                   # restarts the stack after repeated failures
```

Restore a Postgres dump with:

```bash
docker exec -i infra-db-1 pg_restore -U lifeplan_user -d lifeplan_db --clean \
  < ~/backups/loadedout/pg_YYYYMMDD_HHMMSS.dump
```

---

## DNS

`loadedout.online` and the `salmanranjha.me` subdomains are GoDaddy A records
pointing at `34.17.132.101`. Projects without an owned domain use sslip.io
wildcard hostnames (`<name>.34.17.132.101.sslip.io`), which lets Caddy issue
real Let's Encrypt certs with no DNS setup.

**If the VM's external IP ever changes, `infra/Caddyfile` must be updated and
the frontend rebuilt**, or every sslip.io host on the box stops resolving to a
valid cert. This is the single most common way to break the VM.

---

## Verifying a deploy

```bash
./scripts/smoke_test.sh              # from the repo root
curl -s https://loadedout.online/api/v1/health
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

---

## Troubleshooting

**`git` refuses the repo — "dubious ownership"**
You are not `docloud19`. Use `sudo -u docloud19 git ...` or
`git -c safe.directory=/home/docloud19/projects/loaded-out ...`.

**A Caddyfile edit did nothing**
It is baked into the image. Rebuild the frontend.

**502 on a subdomain**
Caddy is proxying to a container that is not running. Compare the upstream
names in `Caddyfile` against `docker ps`; remember other projects' containers
must be joined to `lifeplan-net` (usually via a `docker-compose.override.yml`
in that project) for Caddy to resolve them by name.

**Vertex AI errors**
Check the VM service account still has `roles/aiplatform.user`. Do not add a
credentials file — ADC from the metadata server is intentional.

**Backend cannot reach Postgres**
`docker compose ... ps` should show `db` healthy. The DB has no host port
binding by design; connect through `docker exec infra-db-1 psql -U lifeplan_user -d lifeplan_db`.
