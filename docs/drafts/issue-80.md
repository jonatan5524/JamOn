## 3.5 Deployment and CI/CD Pipeline

The JamOn system is deployed through a fully automated two-stage CI/CD pipeline implemented as a GitHub Actions workflow. The pipeline triggers on every push to the `main` branch and additionally supports manual activation via the `workflow_dispatch` event, enabling on-demand re-deployments without code changes. Its structure separates image construction, which executes on GitHub-hosted cloud infrastructure, from service deployment, which runs on the production college server.

*[INSERT DIAGRAM HERE]*

*Figure N: CI/CD pipeline flow — three parallel build jobs on GitHub-hosted runners followed by a single deploy job on the self-hosted `colman` runner.*

**Build Stage**

The build stage comprises three parallel jobs — `build-client`, `build-orchestrator`, and `build-data-engine` — each executing on a GitHub-hosted `ubuntu-latest` runner. Each job builds the corresponding service as a Docker image and pushes the resulting artifact to the GitHub Container Registry (`ghcr.io`). Per-service Docker layer caching is enabled using the GitHub Actions cache backend (`type=gha`), with a distinct cache scope assigned to each service so that cache entries do not collide across concurrent builds, reducing rebuild duration for incremental code changes.

All three build jobs execute on GitHub-hosted infrastructure rather than on the college production server. This decision was driven by a 3.6 GB disk constraint on the college virtual machine: executing `npm ci` or `pip install` during an image build would risk exhausting the available storage. GitHub-hosted runners build and compress the images; the production server receives only the final compressed image layers, whose footprint is substantially smaller. This separation of concerns between build environment and deployment environment is an explicit resource-constraint tradeoff.

The current pipeline does not include a dedicated test job; automated tests are not gated in CI prior to the build stage. This is a known limitation and is a candidate for a future pipeline improvement.

**Self-Hosted Runner and Deploy Job**

The deploy stage executes on a self-hosted runner registered on the college server under the label `colman`. The runner is installed as a system service, ensuring that it remains available across server reboots. The deploy job carries a `needs` declaration referencing all three build jobs (`needs: [build-client, build-orchestrator, build-data-engine]`), guaranteeing that deployment commences only after every image has been successfully constructed and pushed to the registry.

The deploy sequence proceeds as follows. The runner authenticates with `ghcr.io` and pulls all three latest images to the server. It then invokes `docker compose up -d --remove-orphans` to bring all containers up in detached mode and remove any containers no longer defined in the Compose file. A health-check polling loop subsequently inspects each container's status via `docker inspect` at five-second intervals for a maximum of 24 attempts — corresponding to a 120-second timeout — and fails loudly by printing the container's last 50 log lines if any service does not reach the `healthy` state within that window. Finally, dangling and non-latest images are pruned to recover disk space on the constrained server.

**Concurrency Control**

The workflow configures `cancel-in-progress: false` within its concurrency group (`ci-cd-main`). A second push to `main` that arrives while a deployment is already in progress is therefore queued rather than cancelling the active run. This design prevents two deploy jobs from executing concurrently on the single `colman` runner, which could otherwise leave the server in a partial or inconsistent state mid-deployment.

**Production Network Architecture**

In production, the `jamon-client` container runs nginx, which listens on port 443 using a self-signed SSL certificate. Nginx serves the React single-page application at the root path and reverse-proxies the paths `/api/`, `/playlists/`, `/docs`, and `/internal/` to the orchestrator on its internal port 3000. The orchestrator and data-engine containers publish no external ports and are reachable solely by other containers within the Docker Compose default network. PostgreSQL runs natively on the host virtual machine and is accessed by containers via the `host.docker.internal` hostname, which resolves to the Docker bridge gateway IP through the `host-gateway` extra-host entry defined in `docker-compose.yml`.

**Secret Management**

Sensitive credentials — including the Spotify client secret, JWT signing secret, database password, and API keys for Gemini, NVIDIA NIM, Genius, Last.fm, and the college LLM service — are stored as GitHub Secrets and injected into the deploy job environment at runtime. Non-sensitive configuration values, such as public API URLs, database connection parameters, provider selection flags, and LLM model identifiers, are stored as GitHub Variables. No secrets appear in the source code or in `docker-compose.yml`, ensuring that the repository can be inspected without exposing credentials.
