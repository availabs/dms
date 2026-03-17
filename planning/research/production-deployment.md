# Production Deployment Research

Research document covering deployment options for AVAIL DMS — a React SPA with a Node.js Express server, WebSocket support, and dual-database (PostgreSQL/SQLite) backend.

**Date:** 2026-03-16

---

## 1. Current Architecture Summary

### What Needs to Run

AVAIL DMS has three deployment modes:

1. **SPA-only** (current Netlify setup) — Static client files served by a CDN, API hosted separately at `graph.availabs.org`.
2. **Server-only** — Express server on port 3001 providing the Falcor API (`/graph`), sync endpoints (`/sync/*`), upload endpoints (`/dama-admin/*`), auth endpoints, and WebSocket at `/sync/subscribe`. No client serving.
3. **SSR mode** — The Express server also serves the client. In dev, Vite runs in middleware mode with HMR. In production, pre-built client and server bundles are served from `dist/`.

### Process Architecture

```
┌─────────────────────────────────────────────┐
│  Express Server (PORT, default 3001)        │
│                                             │
│  Routes:                                    │
│    POST /graph          — Falcor JSON Graph │
│    /auth/*              — Login/signup/JWT   │
│    /dama-admin/*        — File uploads       │
│    /sync/bootstrap      — Full data snapshot │
│    /sync/delta          — Incremental sync   │
│    POST /sync/push      — Client mutations   │
│    ws:///sync/subscribe — WebSocket          │
│                                             │
│  Optional SSR:                              │
│    /* (catch-all)       — Server-rendered HTML│
│    Static assets from dist/client/          │
│                                             │
│  Databases:                                 │
│    DMS data   — SQLite file or PostgreSQL   │
│    Auth data  — SQLite file or PostgreSQL   │
│    Yjs states — Same DB as DMS data         │
└─────────────────────────────────────────────┘
```

### Key Dependencies

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 24.x (current dev) | Uses `--env-file-if-exists` (Node 22+). Minimum: Node 22. |
| better-sqlite3 | 11.x | Native C++ addon, requires build tools for install |
| pg | 8.x | Optional dependency — only needed for PostgreSQL mode |
| ws | 8.x | WebSocket server, attaches to HTTP server |
| busboy | 1.x | Multipart file upload parsing |
| yjs | 13.x | Collaborative editing (optional, loaded lazily) |
| Vite | 7.x | Client build toolchain, SSR dev server |
| React | 19.x | With React Compiler babel plugin |
| TailwindCSS | 4.x | Via `@tailwindcss/vite` plugin |

### Environment Variables

**Client (VITE_ prefix, baked into build):**

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DMS_APP` | `wcdb` | DMS application name |
| `VITE_DMS_TYPE` | `prod` | DMS site type |
| `VITE_DMS_BASE_URL` | `/list` | Base URL path |
| `VITE_DMS_AUTH_PATH` | `/auth` | Auth route path |
| `VITE_API_HOST` | `https://graph.availabs.org` | Falcor API endpoint |
| `VITE_DMS_PG_ENVS` | _(empty)_ | Comma-separated PG env names (dataset integration) |
| `VITE_DMS_SYNC` | _(empty)_ | Enable sync on client |

**Server-only:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP listen port |
| `DMS_DB_ENV` | `dms-sqlite` | DB config name (maps to `src/db/configs/{name}.config.json`) |
| `DMS_AUTH_DB_ENV` | `auth-sqlite` | Auth DB config name |
| `DMS_SPLIT_MODE` | `legacy` | Table splitting mode: `legacy` or `per-app` |
| `DMS_SSR` | _(unset)_ | Set to `1` to enable SSR |
| `DMS_LOG_REQUESTS` | `0` | Enable request logging to JSONL |
| `DMS_HEAP_SNAPSHOT_MB` | `0` | Heap snapshot threshold for OOM diagnosis |
| `DMS_SYNC_AUTH` | _(unset)_ | Require JWT on sync endpoints |
| `DMS_SYNC_COMPACT_DAYS` | `30` | Change log retention |
| `DMS_SYNC_COMPACT_INTERVAL_HOURS` | `24` | Compaction frequency |
| `JWT_SECRET` | _(required)_ | Secret for JWT signing/verification |
| `NODE_ENV` | _(unset)_ | Set to `production` for SSR prod mode |

**SMTP (optional):**

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | Mail server host |
| `SMTP_PORT` | Mail server port (default 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender address |

### Database Config Files

Database connections are configured via JSON files in `src/dms/packages/dms-server/src/db/configs/`. The `DMS_DB_ENV` and `DMS_AUTH_DB_ENV` env vars reference the filename (minus `.config.json`).

SQLite config:
```json
{ "type": "sqlite", "role": ["dms", "auth"], "filename": "../data/dms.sqlite" }
```

PostgreSQL config:
```json
{ "type": "postgres", "role": "dms", "host": "localhost", "port": 5432,
  "database": "dms_db", "user": "postgres", "password": "secret" }
```

The `role` field determines which schema init scripts run on first connection (`dms`, `auth`, or `dama`).

### Build Outputs

```bash
npm run build          # Client SPA → dist/
npm run build:ssr      # Client → dist/client/ AND Server bundle → dist/server/entry-ssr.js
```

### Ports and Paths

| Port/Path | Service |
|-----------|---------|
| `:3001` | Express server (configurable via `PORT`) |
| `/graph` | Falcor API (POST for mutations, GET for reads) |
| `/sync/subscribe` | WebSocket endpoint |
| `/sync/bootstrap`, `/sync/delta`, `/sync/push` | REST sync endpoints |
| `/dama-admin/:pgEnv/*` | Upload/publish/validate endpoints |
| `/auth/*` | JWT auth endpoints |

---

## 2. Bare Metal / Own Hardware

Best for: teams with existing infrastructure, maximum control, lowest latency to databases.

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx build-essential

# Install Node.js 22+ (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL (if not using SQLite)
sudo apt install -y postgresql postgresql-contrib
```

### Directory Layout

```
/opt/dms-site/
├── current/              # Symlink to active release
├── releases/
│   ├── 2026-03-16-abc/   # Release directories
│   └── 2026-03-17-def/
├── shared/
│   ├── .env              # Shared env file
│   ├── data/             # SQLite databases (if using SQLite)
│   ├── uploads/          # Uploaded files
│   └── logs/             # Application logs
└── dist/                 # Built assets (or inside current/)
```

### systemd Service

```ini
# /etc/systemd/system/dms-server.service
[Unit]
Description=AVAIL DMS Server
After=network.target postgresql.service

[Service]
Type=simple
User=dms
Group=dms
WorkingDirectory=/opt/dms-site/current/src/dms/packages/dms-server
EnvironmentFile=/opt/dms-site/shared/.env
ExecStart=/usr/bin/node --env-file-if-exists=/opt/dms-site/shared/.env src/index.js
Restart=always
RestartSec=5

# Resource limits
MemoryMax=2G
CPUQuota=200%

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/dms-site/shared/data /opt/dms-site/shared/logs /opt/dms-site/shared/uploads

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dms-server

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dms-server
sudo systemctl start dms-server
sudo journalctl -u dms-server -f  # Follow logs
```

### nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/dms
upstream dms_backend {
    server 127.0.0.1:3001;
    keepalive 32;
}

server {
    listen 80;
    server_name dms.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dms.example.com;

    ssl_certificate /etc/letsencrypt/live/dms.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dms.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 500M;  # Match Express body limits

    # --- SSR mode: proxy everything to the server ---

    # Static assets (if SSR — server serves dist/client/ but nginx can do it faster)
    location /assets/ {
        alias /opt/dms-site/current/dist/client/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Static images
    location /img/ {
        alias /opt/dms-site/current/public/img/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # WebSocket upgrade
    location /sync/subscribe {
        proxy_pass http://dms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;  # Keep WS connections alive
        proxy_send_timeout 86400s;
    }

    # API and all other routes (SSR catch-all)
    location / {
        proxy_pass http://dms_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;  # Match GRAPH_TIMEOUT
    }
}

# --- SPA-only mode alternative (no SSR, separate API) ---
# server {
#     listen 443 ssl http2;
#     server_name dms.example.com;
#     root /opt/dms-site/current/dist;
#     index index.html;
#
#     location /assets/ {
#         expires 1y;
#         add_header Cache-Control "public, immutable";
#     }
#
#     location / {
#         try_files $uri $uri/ /index.html;
#     }
# }
```

```bash
sudo ln -s /etc/nginx/sites-available/dms /etc/nginx/sites-enabled/
sudo certbot --nginx -d dms.example.com
sudo nginx -t && sudo systemctl reload nginx
```

### PostgreSQL Setup

```bash
sudo -u postgres createuser dms_user
sudo -u postgres createdb dms_db -O dms_user
sudo -u postgres createdb dms_auth -O dms_user
sudo -u postgres psql -c "ALTER USER dms_user WITH PASSWORD 'secure_password';"
```

The DMS server auto-initializes schemas on first connection (via SQL files in `src/db/sql/`).

### Backup Strategy

```bash
# PostgreSQL daily backup (add to crontab)
0 3 * * * pg_dump -Fc dms_db > /opt/dms-site/backups/dms_db_$(date +\%Y\%m\%d).dump
0 3 * * * pg_dump -Fc dms_auth > /opt/dms-site/backups/dms_auth_$(date +\%Y\%m\%d).dump

# SQLite backup (if using SQLite)
0 3 * * * sqlite3 /opt/dms-site/shared/data/dms.sqlite ".backup /opt/dms-site/backups/dms_$(date +\%Y\%m\%d).sqlite"

# Keep last 30 days
0 4 * * * find /opt/dms-site/backups -mtime +30 -delete

# Image backup
0 3 * * * rsync -a /opt/dms-site/current/public/img/ /opt/dms-site/backups/img/
```

### Log Management

```bash
# /etc/logrotate.d/dms-server
/opt/dms-site/shared/logs/*.jsonl {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

The server also logs to systemd journal, which handles rotation via `journalctl --vacuum-time=30d`.

---

## 3. Docker

### Dockerfile (Multi-Stage Build)

```dockerfile
# ---- Stage 1: Build client ----
FROM node:22-bookworm-slim AS client-build

WORKDIR /app

# Copy package files for caching
COPY package*.json ./
COPY src/dms/packages/dms-server/package*.json ./src/dms/packages/dms-server/

# Install client deps (includes devDependencies for build)
RUN npm ci

# Copy source
COPY . .

# Build client + SSR bundle
RUN npm run build:ssr

# ---- Stage 2: Server runtime ----
FROM node:22-bookworm-slim AS server

# better-sqlite3 needs these at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server package files and install production deps
COPY src/dms/packages/dms-server/package*.json ./src/dms/packages/dms-server/
RUN cd src/dms/packages/dms-server && npm ci --production

# Copy server source
COPY src/dms/packages/dms-server/src/ ./src/dms/packages/dms-server/src/

# Copy built client assets + SSR bundle from build stage
COPY --from=client-build /app/dist/ ./dist/

# Copy SSR entry and render code (needed by server for SSR)
COPY src/dms/packages/dms/src/render/ ./src/dms/packages/dms/src/render/
COPY src/entry-ssr.jsx ./src/entry-ssr.jsx
COPY src/themes/ ./src/themes/
COPY src/dms/packages/dms/src/index.js ./src/dms/packages/dms/src/index.js

# Copy public assets
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p src/dms/packages/dms-server/src/db/data && \
    chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/graph',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'get',paths:[['dms','data','test+test','length']]})}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/dms/packages/dms-server/src/index.js"]
```

**Note:** This Dockerfile is a starting point. The actual COPY paths for SSR dependencies (themes, DMS library modules) will need adjustment based on what the SSR bundle imports at runtime vs. what was inlined during build. The SSR build should bundle most things, but `linkedom` and other Node-native deps remain external.

### docker-compose.yml (Production)

```yaml
services:
  dms-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      PORT: 3001
      NODE_ENV: production
      DMS_DB_ENV: dms-postgres
      DMS_AUTH_DB_ENV: auth-postgres
      DMS_SSR: 1
      DMS_APP: myapp
      DMS_TYPE: site
      JWT_SECRET: ${JWT_SECRET}
      DMS_SYNC_AUTH: 1
    volumes:
      # SQLite data persistence (if using SQLite instead of Postgres)
      # - dms-data:/app/src/dms/packages/dms-server/src/db/data
      - dms-uploads:/app/uploads
      - dms-images:/app/public/img
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 2G

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dms
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: dms_db
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dms"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  dms-uploads:
  dms-images:
  # dms-data:  # Uncomment for SQLite mode
```

### docker-compose.override.yml (Development)

```yaml
services:
  dms-server:
    build:
      target: client-build  # Use build stage with dev deps
    command: ["npm", "run", "server:dev"]
    volumes:
      - .:/app
      - /app/node_modules
      - /app/src/dms/packages/dms-server/node_modules
    environment:
      NODE_ENV: development
      DMS_LOG_REQUESTS: 1
    ports:
      - "3001:3001"
      - "5173:5173"  # Vite dev server
```

### SQLite with Docker

When using SQLite in Docker, the database file must be on a named volume to persist across container restarts:

```yaml
volumes:
  - dms-data:/app/src/dms/packages/dms-server/src/db/data
```

The DB config JSON file needs to reference the path relative to the `configs/` directory:
```json
{ "type": "sqlite", "role": ["dms"], "filename": "../data/dms.sqlite" }
```

---

## 4. Fly.io

Good fit for this project: supports long-running processes, WebSockets, persistent volumes, managed Postgres.

### fly.toml

```toml
app = "avail-dms"
primary_region = "ewr"  # US East (New Jersey)

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3001"
  NODE_ENV = "production"
  DMS_SSR = "1"
  DMS_APP = "myapp"
  DMS_TYPE = "site"
  DMS_SYNC_AUTH = "1"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 250
    soft_limit = 200

[[vm]]
  size = "shared-cpu-2x"
  memory = "1gb"

# Persistent volume for SQLite databases and uploads
[mounts]
  source = "dms_data"
  destination = "/data"
  initial_size = "10gb"
```

### Setup Commands

```bash
# Create app
fly apps create avail-dms

# Create persistent volume (for SQLite mode)
fly volumes create dms_data --region ewr --size 10

# Set secrets
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly secrets set POSTGRES_PASSWORD="secure_password"

# Deploy
fly deploy

# For PostgreSQL mode instead of SQLite:
fly postgres create --name avail-dms-db --region ewr
fly postgres attach avail-dms-db --app avail-dms
```

### Key Considerations for Fly.io

**SQLite mode:** Fly persistent volumes are tied to a single machine. This means you can only run one instance. This is fine for moderate traffic. The `auto_stop_machines` / `auto_start_machines` settings handle scale-to-zero.

**PostgreSQL mode:** Use Fly Postgres (managed) or attach to an external database. This allows multiple instances, but WebSocket connections will only reach their originating machine (see scaling section below).

**WebSocket support:** Fly natively supports WebSocket connections through its proxy. No special configuration needed — the `http_service` section handles both HTTP and WebSocket traffic. Connections are routed to the machine that accepted the initial HTTP upgrade.

**Volume path mapping:** When using mounts, update the SQLite DB config to reference the mounted path. You may need a startup script or an environment variable override for the filename path in the config JSON.

**Deployment:** Fly performs rolling deploys. With a single machine (SQLite mode), there will be brief downtime during deploys. With Postgres + multiple machines, zero-downtime is achievable.

---

## 5. Netlify

### Current Setup (SPA-Only)

The project already deploys to Netlify as a static SPA:

```toml
# netlify.toml (current)
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Deploy commands reference four Netlify sites by ID:
- `npm run deploy` — primary site
- `npm run deploy-b3nson` — b3nson site
- `npm run deploy-wcdb` — wcdb site
- `npm run deploy-dmsdocs` — dmsdocs site

The client `VITE_API_HOST` is set to `https://graph.availabs.org` to point at an external API server. The Netlify site is purely a static file host.

### Limitations

Netlify is a **static hosting platform**. It cannot run:
- The Express server (long-running process)
- WebSocket connections (Netlify Functions are request/response only)
- SQLite databases (no persistent filesystem)
- File uploads (no writable storage)

### Possible with Netlify Functions

You could theoretically port the Falcor API to Netlify Functions (serverless), but this would require:
1. Rewriting the Express server as individual Lambda functions
2. Replacing SQLite with a cloud database (Netlify does not provide persistent filesystem)
3. Removing WebSocket support (serverless functions are stateless and short-lived)
4. Reworking file uploads to go through an external service (S3, Cloudflare R2)

**Verdict:** Netlify is viable only for the SPA-only deployment mode where the API server is hosted elsewhere. Not realistic for the full stack.

---

## 6. Cloudflare Workers

### Feasibility Assessment

Cloudflare Workers run in a V8 isolate environment that is fundamentally different from Node.js. Here is the gap analysis:

| Feature | DMS Server Needs | Workers Runtime | Gap |
|---------|-----------------|-----------------|-----|
| Node.js APIs | `fs`, `path`, `child_process` | Limited Node compat layer | `better-sqlite3` is a native C++ addon — cannot run in Workers |
| SQLite | better-sqlite3 | D1 (Cloudflare's SQLite) | D1 has a different API, would require a full adapter rewrite |
| PostgreSQL | `pg` library | Hyperdrive (TCP proxy) | Possible with Hyperdrive, but `pg` library compatibility is uncertain |
| WebSocket | `ws` library (server) | Durable Objects WebSocket | Major architectural change — need to rewrite sync as Durable Objects |
| File uploads | busboy, multipart | R2 (object storage) | Upload routes would need rewriting for R2 |
| Express | Express.js framework | Hono/itty-router | Full server rewrite |
| Request body | 500MB JSON/raw limits | 100MB limit (Workers) | Dataset uploads may exceed limits |
| Long-running | 120s graph timeout | 30s CPU limit (paid) | Complex graph queries may time out |

### What Would Need to Change

1. **Database layer:** Replace `better-sqlite3` with D1 API. Rewrite the entire `db/adapters/` layer. The SQLite adapter's synchronous API (`db.prepare().all()`) is incompatible with D1's async API.
2. **Server framework:** Replace Express with a Workers-compatible framework (Hono).
3. **WebSocket/sync:** Rewrite using Durable Objects. Each app or editing session becomes a Durable Object instance managing its own WebSocket connections and Yjs state.
4. **File uploads:** Route through R2 instead of local filesystem.
5. **Auth:** JWT works, but `bcryptjs` may need replacement (CPU-intensive hashing in Workers can hit limits).
6. **Falcor:** The custom falcor-router/falcor-express middleware assumes Express. Would need a full port.

**Verdict:** Not feasible without a near-complete rewrite of the server. The native SQLite dependency alone is a dealbreaker. Cloudflare Workers + D1 + Durable Objects is architecturally interesting for a greenfield project but the migration cost for DMS is prohibitive.

---

## 7. AWS

### Option A: EC2 (Similar to Bare Metal)

The simplest AWS deployment — identical to the bare metal approach but on EC2.

```
Internet → Route 53 → ALB → EC2 (Node.js + nginx)
                              └── RDS PostgreSQL
```

- **EC2 instance:** t3.medium (2 vCPU, 4GB RAM) is a good starting point
- **RDS PostgreSQL:** db.t3.micro for small sites, db.t3.small for production
- **EBS volume:** For SQLite databases and uploads (if not using S3)
- **ALB:** Application Load Balancer handles SSL termination and WebSocket upgrades
- Use the same systemd + nginx config from section 2

### Option B: ECS/Fargate (Containerized)

Better for teams already using AWS container services.

```
Internet → Route 53 → ALB → ECS Service (Fargate)
                              └── RDS PostgreSQL
                              └── EFS (shared filesystem, if needed)
                              └── S3 (images/uploads)
```

**Task Definition (key parts):**

```json
{
  "family": "dms-server",
  "containerDefinitions": [{
    "name": "dms-server",
    "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/dms-server:latest",
    "portMappings": [{ "containerPort": 3001, "protocol": "tcp" }],
    "environment": [
      { "name": "PORT", "value": "3001" },
      { "name": "NODE_ENV", "value": "production" },
      { "name": "DMS_SSR", "value": "1" },
      { "name": "DMS_DB_ENV", "value": "dms-postgres" }
    ],
    "secrets": [
      { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:dms/jwt-secret" }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "node -e \"fetch('http://localhost:3001/').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))\""],
      "interval": 30,
      "timeout": 5,
      "retries": 3
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/dms-server",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "memory": 2048,
    "cpu": 1024
  }],
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc"
}
```

### ALB Configuration for WebSockets

AWS ALB natively supports WebSocket connections. Key settings:

- **Target group:** Protocol HTTP, health check on `/` (or `/graph`)
- **Idle timeout:** Set ALB idle timeout to 3600s (1 hour) to keep WebSocket connections alive
- **Stickiness:** Enable if running multiple instances (see scaling section)

```
# ALB Listener Rules:
# Rule 1: Path /sync/subscribe → Target Group (with sticky sessions)
# Rule 2: Default → Target Group
```

### S3 for Images

Instead of serving images from `public/img/` on the server:

```
# Upload pipeline: Server → S3 bucket
# Serving: CloudFront CDN → S3 origin

# CloudFront distribution:
#   Origin 1: S3 bucket (images, uploads)
#   Origin 2: ALB (API, SSR)
#   Behavior: /img/* → S3 origin
#   Behavior: /assets/* → S3 origin (static client assets)
#   Behavior: default → ALB origin
```

This offloads static asset serving from the Node.js process and provides global CDN caching.

### RDS PostgreSQL

```bash
# Create via AWS CLI
aws rds create-db-instance \
  --db-instance-identifier dms-db \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 16 \
  --master-username dms \
  --master-user-password "${POSTGRES_PASSWORD}" \
  --allocated-storage 20 \
  --backup-retention-period 7 \
  --multi-az  # For production high availability
```

---

## 8. Kubernetes

For teams already running Kubernetes clusters. More operational overhead but maximum flexibility.

### Deployment

```yaml
# dms-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dms-server
  labels:
    app: dms-server
spec:
  replicas: 2  # Only with PostgreSQL — SQLite requires replicas: 1
  selector:
    matchLabels:
      app: dms-server
  template:
    metadata:
      labels:
        app: dms-server
    spec:
      containers:
        - name: dms-server
          image: registry.example.com/dms-server:latest
          ports:
            - containerPort: 3001
          env:
            - name: PORT
              value: "3001"
            - name: NODE_ENV
              value: "production"
            - name: DMS_SSR
              value: "1"
            - name: DMS_DB_ENV
              value: "dms-postgres"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: dms-secrets
                  key: jwt-secret
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
          # Volume mounts for SQLite mode only:
          # volumeMounts:
          #   - name: dms-data
          #     mountPath: /app/src/dms/packages/dms-server/src/db/data
      # Volumes for SQLite mode only:
      # volumes:
      #   - name: dms-data
      #     persistentVolumeClaim:
      #       claimName: dms-data-pvc
```

### Service

```yaml
# dms-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: dms-server
spec:
  selector:
    app: dms-server
  ports:
    - port: 80
      targetPort: 3001
  type: ClusterIP
```

### Ingress (with WebSocket support)

```yaml
# dms-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dms-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # Enable WebSocket
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
    nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr"  # Sticky for WS
    # Large body support for uploads
    nginx.ingress.kubernetes.io/proxy-body-size: "500m"
spec:
  tls:
    - hosts:
        - dms.example.com
      secretName: dms-tls
  rules:
    - host: dms.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dms-server
                port:
                  number: 80
```

### StatefulSet for SQLite Mode

If using SQLite, you need a StatefulSet (not Deployment) to ensure stable persistent volume binding:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: dms-server
spec:
  replicas: 1  # Must be 1 for SQLite
  serviceName: dms-server
  selector:
    matchLabels:
      app: dms-server
  template:
    # ... same as Deployment template above, with volumeMounts
  volumeClaimTemplates:
    - metadata:
        name: dms-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

### Horizontal Scaling

With PostgreSQL, you can scale to multiple replicas. However, WebSocket connections are stateful — a client's WS connection goes to one specific pod. Two approaches:

1. **Client reconnection (current approach):** If a WS connection drops, the client reconnects and re-subscribes. Any changes missed during disconnection are caught up via `/sync/delta`. This works well because the sync protocol is designed for exactly this scenario.

2. **Redis pub/sub backplane:** Add Redis and use it to broadcast change notifications across pods. Each pod's `notifyChange` publishes to Redis, and each pod subscribes to receive notifications from other pods. This ensures all WS clients see all changes regardless of which pod they're connected to. Not currently implemented but would be needed for large-scale multi-pod deployments.

---

## 9. CI/CD

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

env:
  NODE_VERSION: '22'

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive  # DMS is a git submodule

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - run: npm ci

      - run: npm run lint

      - name: Server tests
        working-directory: src/dms/packages/dms-server
        run: |
          npm ci
          npm test

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - run: npm ci

      # Build SPA
      - name: Build client
        env:
          VITE_DMS_APP: ${{ vars.DMS_APP }}
          VITE_DMS_TYPE: ${{ vars.DMS_TYPE }}
          VITE_API_HOST: ${{ vars.API_HOST }}
          VITE_DMS_BASE_URL: ${{ vars.DMS_BASE_URL || '/list' }}
          VITE_DMS_AUTH_PATH: ${{ vars.DMS_AUTH_PATH || '/auth' }}
          VITE_DMS_PG_ENVS: ${{ vars.DMS_PG_ENVS }}
        run: npm run build:ssr

      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  # --- Deploy to Netlify (SPA-only) ---
  deploy-netlify:
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v3
        with:
          publish-dir: dist/client
          production-deploy: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}

  # --- Deploy Docker image (server/SSR) ---
  deploy-docker:
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Build and push Docker image
        run: |
          docker build -t dms-server:${{ github.sha }} .
          docker tag dms-server:${{ github.sha }} registry.example.com/dms-server:latest
          docker push registry.example.com/dms-server:latest

  # --- Deploy to Fly.io ---
  deploy-fly:
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Database Migrations

The DMS server auto-initializes schemas on first connection. There is no separate migration framework. Schema changes are handled by the SQL init scripts in `src/db/sql/`.

For manual schema changes in production:
1. Write the migration SQL
2. Test against a copy of the production database
3. Apply via `psql` (PostgreSQL) or `sqlite3` (SQLite) before deploying the new code
4. Use the `dms db:copy` script to make a backup first:
   ```bash
   cd src/dms/packages/dms-server
   node src/scripts/copy-db.js --source dms-prod --target dms-prod-backup
   ```

### Environment Management

Use GitHub repository variables and secrets:
- **Variables** (non-sensitive): `DMS_APP`, `DMS_TYPE`, `API_HOST`, `DMS_BASE_URL`
- **Secrets** (sensitive): `JWT_SECRET`, `POSTGRES_PASSWORD`, `NETLIFY_AUTH_TOKEN`, `FLY_API_TOKEN`

For multiple environments (staging/production), use GitHub environments:
```yaml
deploy-staging:
  environment: staging
  # Uses staging-specific variables and secrets

deploy-production:
  environment: production
  # Uses production-specific variables and secrets
```

---

## 10. Considerations

### WebSocket Scaling

The WebSocket server (`ws.js`) maintains in-memory state:
- `appSubscribers` — Map of app name to Set of connected WebSocket clients
- `rooms` — Map of item ID to Set of clients in a collaborative editing session
- `yjsDocs` — Map of item ID to Yjs document instances

This state is **per-process**. When running multiple instances:

- **Single instance (SQLite mode):** No issue. All clients connect to the same process.
- **Multiple instances (PostgreSQL mode):** Clients on different instances won't see each other's WebSocket notifications. The sync protocol handles this gracefully — clients that miss a WS notification will catch up on their next `/sync/delta` poll. But real-time collaboration (Yjs) requires all collaborators to be on the same instance.

**Solutions for multi-instance:**
1. **Sticky sessions** (simplest) — Route all connections from the same client to the same instance. ALB/nginx can do this via cookies or IP hash. Downside: uneven load distribution.
2. **Redis pub/sub** — Publish all `notifyChange` events to Redis, subscribe on all instances. Yjs rooms would need a shared state store (Redis or database).
3. **Accept the limitation** — For most DMS deployments, a single instance handles the load fine. The WebSocket heartbeat (30s ping) and safeSend (1MB buffer limit) prevent OOM from zombie connections.

### SQLite Limitations in Multi-Instance

SQLite is a single-file database with file-level locking. It **cannot** be shared across multiple processes or containers safely. Using SQLite in production means:

- **Single instance only** — No horizontal scaling
- **Persistent volume required** — Docker volume, Fly volume, or EBS
- **Backup via `.backup` command** — Not via file copy (risk of corruption mid-write)
- **Performance is excellent for single-instance** — SQLite handles thousands of concurrent reads and moderate writes well. WAL mode (which better-sqlite3 enables by default) allows concurrent reads during writes.

**When to switch to PostgreSQL:**
- Need multiple server instances
- Database size exceeds available memory (SQLite is fastest when the DB fits in OS page cache)
- Need point-in-time recovery
- Want managed database with automated backups (RDS, Fly Postgres, etc.)

### Image Storage

Current approach: images in `public/img/` as static files committed to the repo or managed outside git.

**Options for production:**

1. **Local filesystem** (bare metal / single Docker instance) — Simplest. Mount the directory as a volume. Back up separately.
2. **S3 / R2 / GCS** — Upload to object storage, serve via CDN. Requires changes to the upload pipeline to write to S3 instead of local disk. Best for multi-instance deployments.
3. **Database BLOBs** — Store images as base64 in the DMS data_items table. Already partially used (Lexical editor stores inline images as base64). Not great for large images.

### Database Migrations

The DMS server uses auto-initializing schemas — SQL files in `src/db/sql/` run on first connection if the tables don't exist. There is no versioned migration framework (no Knex, no Prisma, no Flyway).

**For production schema changes:**
1. Review the SQL diff carefully
2. Back up the database
3. Apply changes manually via `psql` or `sqlite3`
4. Deploy new code

Consider adding a migration table and versioned SQL files if schema changes become frequent.

### Secrets Management

| Platform | Mechanism |
|----------|-----------|
| Bare metal | `.env` file with restricted permissions (`chmod 600`) |
| Docker | Docker secrets or environment variables via compose |
| Fly.io | `fly secrets set KEY=VALUE` (encrypted at rest) |
| AWS ECS | AWS Secrets Manager + IAM roles |
| Kubernetes | K8s Secrets (base64, or use sealed-secrets / external-secrets) |

**Critical secrets:**
- `JWT_SECRET` — Must be consistent across deploys (changing it invalidates all sessions)
- Database passwords
- SMTP credentials

### Monitoring and Observability

The server already has built-in observability:
- **Request logging** (`DMS_LOG_REQUESTS=1`) — Writes JSONL to `logs/` directory
- **WebSocket stats** — Logs heap, RSS, connection counts, broadcast stats every 30s
- **Heap snapshots** (`DMS_HEAP_SNAPSHOT_MB`) — Automatic V8 heap dump for OOM diagnosis

**Additional recommendations for production:**

1. **Health check endpoint** — The server responds at `/` with a status message. For deeper health checks, probe `/graph` with a simple query.
2. **Process monitoring** — systemd restart-on-failure, Docker `restart: unless-stopped`, or k8s liveness probes
3. **Log aggregation** — Ship JSONL logs to CloudWatch, Datadog, or Grafana Loki
4. **Uptime monitoring** — External service (UptimeRobot, Pingdom) hitting the health endpoint
5. **Memory alerts** — The server's stats reporter tracks heap usage. Set alerts on RSS exceeding 80% of available memory.

### Recommended Deployment for Different Scenarios

| Scenario | Recommendation |
|----------|---------------|
| **Demo / personal site** | Fly.io with SQLite + persistent volume. Cheapest, simplest. |
| **Small team, few sites** | Bare metal or EC2 with SQLite. Single server, low ops overhead. |
| **Production, moderate traffic** | EC2 or Fly.io with PostgreSQL (RDS or Fly Postgres). SSR enabled. |
| **Production, high traffic** | ECS/Fargate or Kubernetes with PostgreSQL. Multiple instances, ALB with sticky sessions. Redis pub/sub for WS if needed. |
| **Static site only (no server features)** | Netlify (current setup). API hosted separately. |

### Cost Estimates (Rough, 2026)

| Platform | Config | Monthly Cost |
|----------|--------|-------------|
| Fly.io | shared-cpu-2x, 1GB RAM, 10GB volume | ~$15-25 |
| Fly.io + Postgres | Above + Fly Postgres (dev single node) | ~$30-50 |
| EC2 | t3.medium + 20GB EBS | ~$30-40 |
| EC2 + RDS | Above + db.t3.micro PostgreSQL | ~$45-65 |
| ECS Fargate | 1 vCPU, 2GB RAM, always-on | ~$35-50 |
| Netlify | SPA only (free tier) | $0 |
