# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions CI/CD pipeline that compiles and pushes Docker images from GitHub-hosted runners, then deploys to the college server using a self-hosted runner that only pulls and restarts containers — never builds.

**Architecture:** Three images (client/nginx, orchestrator/NestJS, data-engine/Python) are built on GitHub's infrastructure and pushed to `ghcr.io`. A self-hosted runner labelled `colman` on the college VM pulls the new images, replaces running containers via `docker compose`, and verifies each service is healthy before the workflow succeeds. The native PostgreSQL on the VM is exposed to containers via `host.docker.internal` (mapped with Docker's `host-gateway` feature — no `network_mode: host` needed, ports stay isolated).

**Tech Stack:** GitHub Actions, Docker multi-stage builds, ghcr.io, Docker Compose v2 plugin, nginx:alpine, node:20-alpine, python:3.11-slim, GitHub Secrets.

---

## Vector DB: `chroma` today, `pgvector` next — pipeline supports both with no changes

The vector provider is selected purely by the `VECTOR_DB_PROVIDER` env var
(`app/core/config.py` → `"chroma" | "pgvector"`). Current state of each:

- **`chroma`** — works today, but `app/providers/vectordb/chroma.py:13` uses
  `chromadb.Client()` (in-memory, not `PersistentClient`). Vectors are wiped whenever the
  data-engine container is recreated, so every deploy forces a library re-sync.
- **`pgvector`** — `app/providers/vectordb/pgvector.py` is currently a `NotImplementedError`
  stub. **The next mission implements it** to persist vectors in the native PostgreSQL already
  on the VM (also drops the heavy `chromadb`/`onnxruntime` runtime weight).

**This pipeline is built so the pgvector handoff is a one-line change — flip the
`VECTOR_DB_PROVIDER` secret from `chroma` to `pgvector`. No workflow, Dockerfile, or compose
edits required.** To make that true, two things are wired up now even though chroma doesn't
use them:

1. The data-engine container receives the **same DB connection env vars as the orchestrator**
   (`DB_HOST=host.docker.internal`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`) — see
   Task 5. Chroma ignores them; pgvector will read them.
2. The data-engine already has `extra_hosts: host.docker.internal:host-gateway`, so it can
   reach the native Postgres the moment pgvector goes live.

> **Do NOT hardcode `chroma`** anywhere in the pipeline. `VECTOR_DB_PROVIDER` stays a
> first-class secret/env var so the switch is config-only. Until pgvector lands, set the secret
> to `chroma` and expect re-index on deploy; afterwards set it to `pgvector`. The pgvector
> implementation itself is application code and out of scope for this plan.

---

## Files Being Created

| File | Purpose |
|---|---|
| `apps/client/nginx.conf` | nginx server block with React Router `try_files` fallback |
| `apps/client/Dockerfile` | Multi-stage: Vite build → nginx:alpine static server |
| `apps/orchestrator/Dockerfile` | Multi-stage: `npm run build` → node:20-alpine runtime |
| `apps/data-engine/Dockerfile` | Single stage: pip install + uvicorn entrypoint |
| `docker-compose.yml` | Root-level compose file the self-hosted runner uses for deploy |
| `.github/workflows/ci-cd.yml` | Full CI/CD pipeline workflow |
| `docs/cicd-setup.md` | Onboarding doc: runner registration + required secrets |

---

## Task 1: nginx config for React Router

**Files:**
- Create: `apps/client/nginx.conf`

nginx must return `index.html` for any path that is not a real file, so React Router's client-side routes work after a hard refresh.

- [ ] **Step 1: Create `apps/client/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Verify the config parses correctly (optional local check)**

```bash
docker run --rm -v $(pwd)/apps/client/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t
```

Expected output: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 3: Commit**

```bash
git add apps/client/nginx.conf
git commit -m "ci: add nginx config with react router fallback"
```

---

## Task 2: React (Vite) Dockerfile

**Files:**
- Create: `apps/client/Dockerfile`

`VITE_API_URL` must be baked into the static bundle at build time via an `ARG`; the container has no runtime env injection. This means the GitHub Actions workflow must pass the production URL as a build-arg.

- [ ] **Step 1: Create `apps/client/Dockerfile`**

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1
```

- [ ] **Step 2: Smoke-test the build locally (optional)**

```bash
cd apps/client
docker build --build-arg VITE_API_URL=http://localhost:3000/api -t jamon-client:test .
docker run --rm -p 8080:80 jamon-client:test
# visit http://localhost:8080, verify it loads
docker stop $(docker ps -q --filter ancestor=jamon-client:test)
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/Dockerfile
git commit -m "ci: add react client dockerfile"
```

---

## Task 3: NestJS Orchestrator Dockerfile

**Files:**
- Create: `apps/orchestrator/Dockerfile`

`nest build` outputs to `dist/`. The production image only needs `dist/` and **production** `node_modules` (no `src/`, no dev tools). `DB_HOST` will be set to `host.docker.internal` at runtime so the container reaches the native PostgreSQL on the VM.

> ⚠️ **Health-check path:** `src/main.ts` does **NOT** call `setGlobalPrefix('api')`. The
> controllers carry their own prefixes (`@Controller("api/auth")`, `@Controller("api/events")`,
> etc.). **There is no route at exactly `/api`** — hitting it returns 404, which makes `wget`
> exit non-zero and the container never reach `healthy`. The only guaranteed 200 at a fixed
> path is Swagger, mounted via `SwaggerModule.setup('docs', app, …)`. So the health check
> targets `/docs`. **Do not change `main.ts`.**

> ⚠️ **Image size (3.6 GB disk):** Do NOT copy the builder's `node_modules` — it contains
> `typescript`, `@nestjs/cli`, and all devDependencies. Run a fresh `npm ci --omit=dev` in the
> runtime stage so only production deps ship.

- [ ] **Step 1: Create `apps/orchestrator/Dockerfile`**

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: production runtime
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:3000/docs || exit 1
CMD ["node", "dist/main"]
```

- [ ] **Step 2: Smoke-test the build locally (optional)**

```bash
cd apps/orchestrator
docker build -t jamon-orchestrator:test .
# image should build without errors
docker rmi jamon-orchestrator:test
```

- [ ] **Step 3: Commit**

```bash
git add apps/orchestrator/Dockerfile
git commit -m "ci: add nestjs orchestrator dockerfile"
```

---

## Task 4: Python Data-Engine Dockerfile

**Files:**
- Create: `apps/data-engine/Dockerfile`

The data-engine has no build step — pip install and copy source is enough. The working directory for uvicorn must be the directory that contains the `app/` package (i.e., `apps/data-engine/`), not inside `app/` itself, because imports are `from app.core.config import settings`.

- [ ] **Step 1: Create `apps/data-engine/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /service

# install deps first so this layer is cached separately from source changes
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/docs')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Smoke-test the build locally (optional)**

```bash
cd apps/data-engine
docker build -t jamon-data-engine:test .
docker rmi jamon-data-engine:test
```

- [ ] **Step 3: Commit**

```bash
git add apps/data-engine/Dockerfile
git commit -m "ci: add python data-engine dockerfile"
```

---

## Task 5: docker-compose.yml for server deployment

**Files:**
- Create: `docker-compose.yml` (repo root)

This file is **only used on the server** by the self-hosted runner to start/restart containers. It is never used by GitHub-hosted runners. Images are pulled from ghcr.io — no `build:` keys. All secrets are injected as environment variables by the runner (via `--env-file` or GitHub Actions `env:` context).

`extra_hosts: host.docker.internal:host-gateway` tells Docker to add a host entry pointing `host.docker.internal` to the VM's host IP, so containers can reach `localhost:5432` (native PostgreSQL) by using `host.docker.internal` as `DB_HOST`.

**Both backends get the DB connection vars.** The orchestrator uses them now; the data-engine gets the same set so that when the next mission implements the `pgvector` provider, no compose change is needed — only the `VECTOR_DB_PROVIDER` secret flips. Chroma simply ignores the DB vars. The `DB_*` secrets are defined once and reused by both services.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  client:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/jamon-client:latest
    container_name: jamon-client
    restart: unless-stopped
    ports:
      - "80:80"

  orchestrator:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/jamon-orchestrator:latest
    container_name: jamon-orchestrator
    restart: unless-stopped
    ports:
      - "3000:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - NODE_ENV=production
      - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
      - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}
      - SPOTIFY_REDIRECT_URI=${SPOTIFY_REDIRECT_URI}
      - JWT_SECRET=${JWT_SECRET}
      - DB_HOST=host.docker.internal
      - DB_PORT=${DB_PORT}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - API_URL=${API_URL}
      - CLIENT_URL=${CLIENT_URL}

  data-engine:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER}/jamon-data-engine:latest
    container_name: jamon-data-engine
    restart: unless-stopped
    ports:
      - "8000:8000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - NVIDIA_API_KEY=${NVIDIA_API_KEY}
      - GENIUS_ACCESS_TOKEN=${GENIUS_ACCESS_TOKEN}
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER}
      - TAGGING_PROVIDER=${TAGGING_PROVIDER}
      - DJ_PROVIDER=${DJ_PROVIDER}
      - HYDE_PROVIDER=${HYDE_PROVIDER}
      - VECTOR_DB_PROVIDER=${VECTOR_DB_PROVIDER}
      # DB connection — ignored by chroma, used by the upcoming pgvector provider.
      # Wired now so switching VECTOR_DB_PROVIDER=pgvector needs no compose change.
      - DB_HOST=host.docker.internal
      - DB_PORT=${DB_PORT}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - COLLEGE_BASE_URL=${COLLEGE_BASE_URL}
      - COLLEGE_USERNAME=${COLLEGE_USERNAME}
      - COLLEGE_PASSWORD=${COLLEGE_PASSWORD}
      - NIM_BASE_URL=${NIM_BASE_URL}
      - NIM_TAGGING_MODEL=${NIM_TAGGING_MODEL}
      - NIM_HYDE_MODEL=${NIM_HYDE_MODEL}
      - LASTFM_API_KEY=${LASTFM_API_KEY}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
```

- [ ] **Step 2: Validate compose file syntax**

```bash
docker compose config
```

Expected: prints the resolved YAML with no errors. Missing env vars will show as empty strings — that is fine at this stage (they are injected at runtime).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "ci: add docker-compose for server deployment"
```

---

## Task 6: GitHub Actions CI/CD workflow

**Files:**
- Create: `.github/workflows/ci-cd.yml`

**Job layout:**

| Job | Runner | Does |
|---|---|---|
| `build-and-push` | `ubuntu-latest` | Builds all 3 images, pushes to ghcr.io |
| `deploy` | `self-hosted, colman` | Pulls images, runs `docker compose up -d`, health-checks, prunes old images |

**Authentication to ghcr.io:** Both jobs use `GITHUB_TOKEN` (automatically available in every workflow run, no secret to configure). GitHub grants write access to ghcr.io for the repo's owner automatically when `packages: write` permission is declared.

The self-hosted runner uses the same `GITHUB_TOKEN` to `docker login ghcr.io` and pull images. The token is scoped to the workflow run and expires after it ends — no long-lived credentials are stored on the server.

**Image naming:** `ghcr.io/${{ github.repository_owner }}/jamon-<service>:latest`. `github.repository_owner` is lowercase automatically in GitHub expressions, which is required by ghcr.io.

**`VITE_API_URL` at build time:** The React bundle bakes the API URL into the JS at build time. The value must be stored as a GitHub secret (`VITE_API_URL`) and passed as a Docker build-arg.

- [ ] **Step 1: Create `.github/workflows/ci-cd.yml`**

```yaml
name: CI/CD

on:
  push:
    branches: [main]

# Only one deploy at a time — a second push to main cancels/queues behind the first
# so two runs never race on the single `colman` runner mid-deploy.
concurrency:
  group: ci-cd-main
  cancel-in-progress: false

permissions:
  contents: read
  packages: write   # allows GITHUB_TOKEN to push to ghcr.io

# NOTE: `OWNER` / `github.repository_owner` preserves case. ghcr.io requires a lowercase
# path. Fine for the `jonatan5524` account; if the repo ever moves to an org with capital
# letters, lowercase it (e.g. via a `tr '[:upper:]' '[:lower:]'` step) before tagging.

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}

jobs:
  build-and-push:
    name: Build & Push Images
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Log in to ghcr.io
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # ── Client (React / nginx) ───────────────────────────────────────────
      - name: Build & push client
        uses: docker/build-push-action@v5
        with:
          context: apps/client
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.OWNER }}/jamon-client:latest
          build-args: |
            VITE_API_URL=${{ secrets.VITE_API_URL }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ── Orchestrator (NestJS) ────────────────────────────────────────────
      - name: Build & push orchestrator
        uses: docker/build-push-action@v5
        with:
          context: apps/orchestrator
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.OWNER }}/jamon-orchestrator:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ── Data Engine (Python / FastAPI) ───────────────────────────────────
      - name: Build & push data-engine
        uses: docker/build-push-action@v5
        with:
          context: apps/data-engine
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.OWNER }}/jamon-data-engine:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy to College Server
    runs-on: [self-hosted, colman]
    needs: build-and-push

    env:
      # ── Orchestrator env ──────────────────────────────────────────────────
      SPOTIFY_CLIENT_ID: ${{ secrets.SPOTIFY_CLIENT_ID }}
      SPOTIFY_CLIENT_SECRET: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
      SPOTIFY_REDIRECT_URI: ${{ secrets.SPOTIFY_REDIRECT_URI }}
      JWT_SECRET: ${{ secrets.JWT_SECRET }}
      DB_PORT: ${{ secrets.DB_PORT }}
      DB_USERNAME: ${{ secrets.DB_USERNAME }}
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
      DB_NAME: ${{ secrets.DB_NAME }}
      API_URL: ${{ secrets.API_URL }}
      CLIENT_URL: ${{ secrets.CLIENT_URL }}
      # ── Data engine env ───────────────────────────────────────────────────
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}
      GENIUS_ACCESS_TOKEN: ${{ secrets.GENIUS_ACCESS_TOKEN }}
      EMBEDDING_PROVIDER: ${{ secrets.EMBEDDING_PROVIDER }}
      TAGGING_PROVIDER: ${{ secrets.TAGGING_PROVIDER }}
      DJ_PROVIDER: ${{ secrets.DJ_PROVIDER }}
      HYDE_PROVIDER: ${{ secrets.HYDE_PROVIDER }}
      VECTOR_DB_PROVIDER: ${{ secrets.VECTOR_DB_PROVIDER }}
      COLLEGE_BASE_URL: ${{ secrets.COLLEGE_BASE_URL }}
      COLLEGE_USERNAME: ${{ secrets.COLLEGE_USERNAME }}
      COLLEGE_PASSWORD: ${{ secrets.COLLEGE_PASSWORD }}
      NIM_BASE_URL: ${{ secrets.NIM_BASE_URL }}
      NIM_TAGGING_MODEL: ${{ secrets.NIM_TAGGING_MODEL }}
      NIM_HYDE_MODEL: ${{ secrets.NIM_HYDE_MODEL }}
      LASTFM_API_KEY: ${{ secrets.LASTFM_API_KEY }}
      GITHUB_REPOSITORY_OWNER: ${{ github.repository_owner }}

    steps:
      - name: Checkout (for docker-compose.yml)
        uses: actions/checkout@v4

      - name: Log in to ghcr.io
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Pull latest images
        run: |
          docker pull ghcr.io/${{ github.repository_owner }}/jamon-client:latest
          docker pull ghcr.io/${{ github.repository_owner }}/jamon-orchestrator:latest
          docker pull ghcr.io/${{ github.repository_owner }}/jamon-data-engine:latest

      - name: Deploy containers
        run: docker compose up -d --remove-orphans

      - name: Wait for services to be healthy
        run: |
          echo "Waiting for containers to report healthy..."
          for service in jamon-client jamon-orchestrator jamon-data-engine; do
            for i in $(seq 1 24); do
              status=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "missing")
              echo "  $service → $status (attempt $i/24)"
              if [ "$status" = "healthy" ]; then break; fi
              if [ "$i" -eq 24 ]; then
                echo "ERROR: $service did not become healthy within 120s"
                docker logs "$service" --tail 50
                exit 1
              fi
              sleep 5
            done
          done
          echo "All services healthy."

      - name: Remove dangling and old images
        run: |
          docker image prune -f
          # Remove any untagged images for our services that are no longer :latest
          docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
            | grep -E 'jamon-(client|orchestrator|data-engine)' \
            | grep -v ':latest' \
            | awk '{print $2}' \
            | xargs -r docker rmi -f || true
```

- [ ] **Step 2: Verify YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: add github actions ci/cd workflow"
```

---

## Task 7: Onboarding documentation

**Files:**
- Create: `docs/cicd-setup.md`

- [ ] **Step 1: Create `docs/cicd-setup.md`**

```markdown
# CI/CD Setup Guide

This document tells a new team member everything they need to know to get the
pipeline running on a fresh college server VM.

---

## Prerequisites on the server

- Docker Engine ≥ 20.10 (required for `host-gateway`); ≥ 24 recommended, with the Compose v2 plugin (`docker compose` — not `docker-compose`)
- The native PostgreSQL is already running on the VM
- Port 80 (client), 3000 (orchestrator), and 8000 (data-engine) are open in the firewall
- The user that runs the runner has permission to run `docker` (add them to the `docker` group: `sudo usermod -aG docker $USER`)

### Make native PostgreSQL reachable from containers (required — do this once)

Containers reach the host DB via `host.docker.internal` (mapped with `host-gateway`), which
resolves to the host's Docker-bridge gateway IP — **not** `127.0.0.1`. A default PostgreSQL
install listens only on localhost and rejects that connection, so both backends will fail to
connect on the first deploy until you do the following:

1. **Listen on the docker bridge.** In `postgresql.conf`:
   ```conf
   listen_addresses = '*'        # or 'localhost,172.17.0.1' to be narrower
   ```
2. **Allow the docker subnet.** In `pg_hba.conf` (use `scram-sha-256` or `md5` to match your setup):
   ```conf
   # allow connections from Docker containers
   host    all    all    172.16.0.0/12    scram-sha-256
   ```
   `172.16.0.0/12` covers Docker's default bridge networks. Confirm your bridge subnet with
   `docker network inspect bridge | grep Subnet` and narrow the rule if you prefer.
3. **Open the port to the bridge only** (do not expose Postgres to the public internet):
   ```bash
   sudo ufw allow from 172.16.0.0/12 to any port 5432
   ```
4. Reload PostgreSQL: `sudo systemctl reload postgresql`.
5. Verify from inside a container:
   ```bash
   docker run --rm --add-host host.docker.internal:host-gateway postgres:16 \
     psql "postgresql://<DB_USERNAME>:<DB_PASSWORD>@host.docker.internal:5432/<DB_NAME>" -c '\l'
   ```

> The orchestrator and data-engine use `DB_HOST=host.docker.internal` (set in
> `docker-compose.yml`). You do **not** change any application code or the Postgres data.

---

## Registering the Self-Hosted Runner (label: `colman`)

1. On GitHub: **Settings → Actions → Runners → New self-hosted runner**
2. Select Linux / x64. Copy the token shown.
3. On the server:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # Download the runner package shown on the GitHub page (version may differ):
   curl -o actions-runner-linux-x64.tar.gz -L \
     https://github.com/actions/runner/releases/download/v2.316.1/actions-runner-linux-x64-2.316.1.tar.gz
   tar xzf actions-runner-linux-x64.tar.gz

   # Configure (use the token from step 2):
   ./config.sh --url https://github.com/<ORG>/<REPO> \
               --token <TOKEN> \
               --labels colman \
               --name colman-server
   ```

4. Install and start as a system service so it survives reboots:

   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status   # should say "active (running)"
   ```

---

## GitHub Secrets to Configure

Go to **Settings → Secrets and variables → Actions → New repository secret** for each:

### General / Orchestrator
| Secret | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | Production callback URL e.g. `https://yourdomain.com/api/auth/spotify/callback` |
| `JWT_SECRET` | Long random string (≥ 32 chars) |
| `DB_PORT` | PostgreSQL port, typically `5432` |
| `DB_USERNAME` | PostgreSQL user |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | PostgreSQL database name |
| `API_URL` | Production API base URL e.g. `https://yourdomain.com/api` |
| `CLIENT_URL` | Production frontend URL e.g. `https://yourdomain.com` |

### React frontend (baked at build time)
| Secret | Value |
|---|---|
| `VITE_API_URL` | Same as `API_URL` — e.g. `https://yourdomain.com/api` |

### Data Engine — AI providers
| Secret | Value |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key |
| `NVIDIA_API_KEY` | NIM API key |
| `GENIUS_ACCESS_TOKEN` | Genius lyrics API token |
| `LASTFM_API_KEY` | Last.fm API key |
| `COLLEGE_BASE_URL` | College LLM service base URL |
| `COLLEGE_USERNAME` | College LLM service username |
| `COLLEGE_PASSWORD` | College LLM service password |

### Data Engine — provider selection
| Secret | Example value | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `gemini` | `gemini`, `college`, or `nim` |
| `TAGGING_PROVIDER` | `gemini` | Same options |
| `DJ_PROVIDER` | `college` | Same options |
| `HYDE_PROVIDER` | `nim` | Same options |
| `VECTOR_DB_PROVIDER` | `chroma` | `chroma` until the pgvector mission ships, then flip to `pgvector` (config-only — no pipeline change). Today `chroma` is in-memory, so vectors are wiped on every deploy; `pgvector` will persist them in the native Postgres. The `DB_*` secrets above are reused by the data-engine for this. |
| `PROVIDER_FAILOVER_ENABLED` | `true` | Enable automatic failover for tagging, DJ generation, and HyDE |
| `PROVIDER_FAILOVER_CHAIN` | `gemini,nim,college` | Provider order for failover |
| `PROVIDER_CIRCUIT_FAILURE_THRESHOLD` | `3` | Failures inside the rolling window before a provider circuit opens |
| `PROVIDER_CIRCUIT_WINDOW_SECONDS` | `300` | Rolling failure window in seconds |
| `PROVIDER_CIRCUIT_COOLDOWN_SECONDS` | `60` | How long to skip an open provider before probing it again |
| `PROVIDER_FAILOVER_PROVIDER_ATTEMPTS` | `2` | Attempts on one provider before moving to the next provider |
| `NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | |
| `NIM_TAGGING_MODEL` | `meta/llama-3.3-70b-instruct` | |
| `NIM_HYDE_MODEL` | `meta/llama-3.3-70b-instruct` | |

> **Note:** `GITHUB_TOKEN` is automatically provided by GitHub Actions in every workflow run — you do NOT need to create this secret manually.

---

## How the pipeline works

```
push to main
    │
    ▼ GitHub-hosted runner (ubuntu-latest)
 build-and-push
    ├── docker build apps/client  → ghcr.io/<owner>/jamon-client:latest
    ├── docker build apps/orchestrator → ghcr.io/<owner>/jamon-orchestrator:latest
    └── docker build apps/data-engine  → ghcr.io/<owner>/jamon-data-engine:latest
    │
    ▼ Self-hosted runner on college VM (label: colman)
 deploy
    ├── docker pull (all 3 images)
    ├── docker compose up -d --remove-orphans
    ├── poll container health (120s timeout, fail loudly)
    └── docker image prune (remove old/dangling images)
```

**Why images are never built on the server:** The college VM has only 3.6 GB of free disk.
A full `npm ci` or `pip install` build would exhaust that. Images are built in GitHub's
cloud, compressed, and the server only stores the final layers.

**How containers reach the native PostgreSQL:** Docker adds `host.docker.internal` as a
host entry pointing to the VM's host IP (via `extra_hosts: host.docker.internal:host-gateway`).
The orchestrator uses `DB_HOST=host.docker.internal` at runtime. The PostgreSQL instance
does not need to be changed.

---

## Troubleshooting

**Runner not picking up jobs:** Check `sudo ./svc.sh status` on the server. Restart with
`sudo ./svc.sh stop && sudo ./svc.sh start`.

**Container stuck in `starting` health state:** Run `docker logs <container-name> --tail 100`
on the server. Missing environment variables (empty secrets) are the most common cause for
the orchestrator and data-engine. The orchestrator health check hits `/docs` (Swagger) because
there is no route at `/api` — if you see health-check 404s, confirm the Dockerfile targets
`/docs`, not `/api`.

**Orchestrator/data-engine logs show DB connection refused / "no pg_hba.conf entry":** The
native PostgreSQL host-side config was skipped. Re-do the "Make native PostgreSQL reachable
from containers" steps above (`listen_addresses`, `pg_hba.conf`, reload).

**Songs/recommendations empty right after a deploy:** Expected while `VECTOR_DB_PROVIDER=chroma`
— the Chroma store is in-memory and is wiped whenever the data-engine container is recreated.
Users must re-sync their library. This goes away once the pgvector mission ships and the secret
is flipped to `pgvector` (vectors then persist in Postgres). See the "Vector DB" section of the
plan.

**Image pull fails on server (403):** The runner's `GITHUB_TOKEN` has expired or the repo
package visibility is set to private. Go to **Packages → jamon-<service> → Package settings**
and ensure the repo has read access, or change visibility to public.

**Disk full after failed deploy:** Run `docker system prune -af` on the server to reclaim
space (this removes all unused images/containers — safe to do while services are running).
```

- [ ] **Step 2: Commit**

```bash
git add docs/cicd-setup.md
git commit -m "docs: add cicd setup and onboarding guide"
```

---

## Self-Review

### Spec coverage check

| Requirement | Covered by |
|---|---|
| GitHub-hosted runners build and push to ghcr.io | Task 6 — `build-and-push` job |
| Self-hosted `colman` runner only pulls and restarts | Task 6 — `deploy` job |
| React frontend as static files behind nginx with Router fallback | Tasks 1 & 2 |
| NestJS and Python connect to native PostgreSQL | Task 5 — `extra_hosts`, `DB_HOST=host.docker.internal` |
| Old Docker images cleaned up after deploy | Task 6 — `docker image prune` + remove untagged step |
| Fails loudly if unhealthy after deploy | Task 6 — health-check loop with `exit 1` and log dump |
| All sensitive values in secrets, nothing hardcoded | Tasks 5 & 6 — all values via `secrets.*` or `env:` |
| Onboarding: runner registration + secrets | Task 7 |

### Codebase-verified correctness notes

- **Orchestrator health check targets `/docs`, not `/api`.** Verified `src/main.ts` has no
  `setGlobalPrefix`; controllers self-prefix (`api/auth`, `api/events`, …), so `/api` 404s.
  Swagger at `/docs` is the only fixed 200. (Task 3)
- **Orchestrator runtime stage runs `npm ci --omit=dev`** instead of copying the builder's
  `node_modules`, keeping the image small for the 3.6 GB disk. (Task 3)
- **Vector DB is config-driven, not hardcoded.** `VECTOR_DB_PROVIDER` stays a first-class
  secret. `chroma` works today (in-memory, wiped on deploy); the next mission implements the
  `pgvector` stub. The data-engine already receives the `DB_*` vars + `host-gateway`, so the
  switch to `pgvector` is a one-line secret flip with no pipeline change. (Vector DB section +
  Tasks 5 & 7)
- **Native Postgres host-side config documented** (`listen_addresses`, `pg_hba.conf`,
  firewall) — required for `host.docker.internal` to connect. (Task 7)

### Placeholder scan

None found — all steps contain exact file content, commands, and expected output.

### Type consistency

No code types across tasks. Environment variable names are used consistently between
`docker-compose.yml` (Task 5) and the workflow `env:` block (Task 6).
