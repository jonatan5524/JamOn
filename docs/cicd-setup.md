# CI/CD Setup Guide

This document tells a new team member everything they need to know to get the
pipeline running on a fresh college server VM.

---

## Architecture

```
Internet
   │ ports 80 (redirect) + 443 (HTTPS, self-signed cert)
   ▼
jamon-client  (nginx — React static files + reverse proxy)
   ├── serves React SPA at /
   ├── proxies /api/, /docs, /playlists/, /internal/ → orchestrator:3000
   └── /health on port 80 (Docker healthcheck only)

jamon-orchestrator  (NestJS, port 3000 — internal only, not internet-facing)
   └── http://jamon-data-engine:8000

jamon-data-engine  (FastAPI, port 8000 — internal only, not internet-facing)
   └── host.docker.internal:5432  →  native PostgreSQL on the VM
```

All three containers share a Docker Compose default network.
The orchestrator and data-engine have no published ports — they are reachable
only by other containers in the same network.

---

## Prerequisites on the server

- Docker Engine ≥ 20.10 (required for `host-gateway`); ≥ 24 recommended, with
  the Compose v2 plugin (`docker compose` — not `docker-compose`)
- The native PostgreSQL is already running on the VM
- Ports 80 and 443 are open in the firewall (no other ports needed externally)
- The user that runs the runner has permission to run `docker`:
  ```bash
  sudo usermod -aG docker $USER   # then log out and back in
  ```

### Generate the self-signed SSL certificate (do this once)

```bash
sudo mkdir -p /etc/ssl/jamon
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/jamon/privkey.pem \
  -out    /etc/ssl/jamon/fullchain.pem \
  -subj   "/CN=<your-server-hostname-or-IP>"
sudo chmod 600 /etc/ssl/jamon/privkey.pem
```

The nginx container mounts these files read-only at `/etc/nginx/ssl/`.
Renew annually by re-running the command and restarting the client container:
`docker compose restart client`

### Make native PostgreSQL reachable from containers (do this once)

Containers reach the host DB via `host.docker.internal` (resolved via
`host-gateway` to the Docker bridge IP — **not** `127.0.0.1`). A default
PostgreSQL install listens only on localhost and will reject container
connections. Fix it:

1. **`postgresql.conf`** — allow the bridge:
   ```conf
   listen_addresses = '*'
   ```
2. **`pg_hba.conf`** — allow the Docker subnet:
   ```conf
   host  all  all  172.16.0.0/12  scram-sha-256
   ```
   Confirm your subnet: `docker network inspect bridge | grep Subnet`
3. **Firewall** — restrict to Docker bridge only:
   ```bash
   sudo ufw allow from 172.16.0.0/12 to any port 5432
   ```
4. Reload: `sudo systemctl reload postgresql`
5. Verify from a throw-away container:
   ```bash
   docker run --rm --add-host host.docker.internal:host-gateway postgres:16 \
     psql "postgresql://<DB_USERNAME>:<DB_PASSWORD>@host.docker.internal:5432/<DB_NAME>" -c '\l'
   ```

---

## Registering the Self-Hosted Runner (label: `colman`)

1. On GitHub: **Settings → Actions → Runners → New self-hosted runner**
2. Select **Linux / x64**. Copy the registration token shown.
3. On the server:
   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # Use the download URL shown on the GitHub page (version may differ):
   curl -o actions-runner-linux-x64.tar.gz -L \
     https://github.com/actions/runner/releases/download/v2.316.1/actions-runner-linux-x64-2.316.1.tar.gz
   tar xzf actions-runner-linux-x64.tar.gz

   ./config.sh --url https://github.com/<ORG>/<REPO> \
               --token <TOKEN> \
               --labels colman \
               --name colman-server
   ```
4. Install as a system service so it survives reboots:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status   # should print "active (running)"
   ```

---

## GitHub Secrets to Configure

**Settings → Secrets and variables → Actions → New repository secret**

### Frontend (baked into the React bundle at build time)

| Secret | Example value |
|---|---|
| `VITE_API_URL` | `https://yourdomain.com/api` |

> This URL is compiled into the JavaScript bundle. It must be the **public** URL
> that browsers will call. Since nginx serves both the SPA and the API under the
> same domain, this is just your domain with `/api` appended.

### Orchestrator / NestJS

| Secret | Notes |
|---|---|
| `SPOTIFY_CLIENT_ID` | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | e.g. `https://yourdomain.com/api/auth/spotify/callback` |
| `JWT_SECRET` | Long random string (≥ 32 chars) |
| `DB_PORT` | PostgreSQL port, typically `5432` |
| `DB_USERNAME` | PostgreSQL user |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `API_URL` | e.g. `https://yourdomain.com/api` |
| `CLIENT_URL` | e.g. `https://yourdomain.com` |

### Data Engine — AI providers

| Secret | Notes |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio |
| `NVIDIA_API_KEY` | NIM API key |
| `GENIUS_ACCESS_TOKEN` | Genius lyrics API |
| `LASTFM_API_KEY` | Last.fm API |
| `COLLEGE_BASE_URL` | College LLM service base URL |
| `COLLEGE_USERNAME` | College LLM service username |
| `COLLEGE_PASSWORD` | College LLM service password |

### Data Engine — provider selection

| Secret | Example | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `gemini` | `gemini`, `college`, or `nim` |
| `TAGGING_PROVIDER` | `gemini` | same options |
| `DJ_PROVIDER` | `college` | same options |
| `HYDE_PROVIDER` | `nim` | same options |
| `VECTOR_DB_PROVIDER` | `chroma` | Use `chroma` for now. Flip to `pgvector` when that mission ships — no other pipeline change needed. |
| `NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | |
| `NIM_TAGGING_MODEL` | `meta/llama-3.3-70b-instruct` | |
| `NIM_HYDE_MODEL` | `meta/llama-3.3-70b-instruct` | |

> `GITHUB_TOKEN` is provided automatically — do **not** create it as a secret.

---

## How the pipeline works

```
push to main
    │
    ▼  GitHub-hosted runner (ubuntu-latest)
 build-and-push
    ├── docker build apps/client   → ghcr.io/<owner>/jamon-client:latest
    ├── docker build apps/orchestrator → ghcr.io/<owner>/jamon-orchestrator:latest
    └── docker build apps/data-engine  → ghcr.io/<owner>/jamon-data-engine:latest
    │
    ▼  Self-hosted runner on college VM (label: colman)
 deploy
    ├── docker pull (all 3 images)
    ├── docker compose up -d --remove-orphans
    ├── poll container health via docker inspect (120s timeout, fail loudly)
    └── docker image prune (remove old/dangling images)
```

Images are **never built on the server** — the 3.6 GB disk constraint makes
a full `npm ci` or `pip install` build risky. GitHub builds and compresses
the images; the server only stores the final layers.

---

## Troubleshooting

**Runner not picking up jobs**
Check: `sudo ./svc.sh status` — restart with `sudo ./svc.sh stop && sudo ./svc.sh start`.

**Container stuck in `starting` health state**
```bash
docker logs <container-name> --tail 100
```
For `jamon-orchestrator`: the healthcheck hits `/docs` (Swagger). There is no
route at `/api` — if you see 404s, confirm the Dockerfile targets `/docs`.
For `jamon-client`: healthcheck uses `http://localhost:80/health` (HTTP, not
HTTPS) — if it fails, confirm the nginx config has the `/health` location.

**Orchestrator / data-engine: DB connection refused or "no pg_hba.conf entry"**
The PostgreSQL host-side config was skipped. Re-do the "Make native PostgreSQL
reachable" steps above.

**Site returns HTTP 502 Bad Gateway**
nginx is up but the orchestrator is not. Check: `docker logs jamon-orchestrator --tail 50`.

**SSL certificate expired**
Re-run the `openssl` command above, then: `docker compose restart client`.

**Songs / recommendations empty after a deploy**
Expected while `VECTOR_DB_PROVIDER=chroma` — the Chroma store is in-memory and
is wiped when the container restarts. Users must re-sync their library. This
goes away once the pgvector mission ships and the secret is flipped to `pgvector`.

**Image pull fails (403)**
The runner's `GITHUB_TOKEN` expired, or the package is private. Go to
**Packages → jamon-\<service\> → Package settings** and grant the repo read access,
or set visibility to public.

**Disk full after a failed deploy**
```bash
docker system prune -af   # removes all unused images/containers
```
Safe to run while containers are running.
