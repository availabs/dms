# Deploy: SSR Docker Server

Run a full DMS site with server-side rendering in a Docker container. The container builds the frontend, serves pre-rendered HTML for fast initial loads, and connects to an external PostgreSQL database. Put nginx in front for TLS and static assets.

Unlike the simple server deployment (API only), SSR requires the **site template repo** (e.g., `dms-site`) — not just the `dms` submodule — because it needs to build the frontend and includes site-specific themes, entry points, and configuration.

## Prerequisites

- Docker installed on the host
- A running PostgreSQL server accessible over the network
- Git access to the site template repository (e.g., `dms-site`)
- Data already loaded in the database (pages, patterns, etc.)

## Quick Start

```bash
# 1. Clone the site template repo
git clone --recurse-submodules <site-repo-url> dms-site
cd dms-site

# 2. Create database config files
cd src/dms/packages/dms-server/src/db/configs/

cat > dms-prod.config.json << 'EOF'
{
  "type": "postgres",
  "role": "dms",
  "host": "your-pg-host",
  "port": 5432,
  "database": "dms_db",
  "user": "dms_user",
  "password": "your-password",
  "splitMode": "per-app"
}
EOF

cat > auth-prod.config.json << 'EOF'
{
  "type": "postgres",
  "role": "auth",
  "host": "your-pg-host",
  "port": 5432,
  "database": "dms_auth",
  "user": "dms_user",
  "password": "your-password"
}
EOF

cd ../../../../../..

# 3. Create .env file in the repo root
cat > .env << 'EOF'
PORT=5555
NODE_ENV=production
DMS_DB_ENV=dms-prod
DMS_AUTH_DB_ENV=auth-prod
JWT_SECRET=<generate-with: openssl rand -hex 32>
DMS_SPLIT_MODE=per-app

# SSR settings
DMS_SSR=1
DMS_APP=your-app-name
DMS_TYPE=your-site-type
DMS_BASE_URL=/list
EOF

# 4. Create the Dockerfile (see below) at the repo root

# 5. Build and run
docker build -t dms-ssr .
docker run -d \
  --name dms-ssr \
  --env-file .env \
  -p 5555:5555 \
  --restart unless-stopped \
  dms-ssr
```

## Dockerfile

Create this file at the **root of the site template repo** (next to `package.json`):

```dockerfile
# DMS Site — SSR Docker image
# Multi-stage build: install deps + build frontend, then run server with SSR.
#
# Build:  docker build -t dms-ssr .
# Run:    docker run -d --env-file .env -p 5555:5555 --name dms-ssr dms-ssr

# ── Stage 1: Build frontend ──────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy everything (site template + dms submodule)
COPY . .

# Install ALL dependencies (including devDependencies for the build)
RUN npm install

# Install server dependencies
RUN cd src/dms/packages/dms-server && npm install --omit=dev

# Build client bundle and SSR server entry
RUN npm run build:ssr

# ── Stage 2: Production runtime ──────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app

# Copy the built frontend
COPY --from=builder /app/dist/ ./dist/

# Copy the server and its node_modules
COPY --from=builder /app/src/dms/packages/dms-server/ ./src/dms/packages/dms-server/

# Copy the DMS library source (SSR handler, render utils)
COPY --from=builder /app/src/dms/packages/dms/src/render/ ./src/dms/packages/dms/src/render/
COPY --from=builder /app/src/dms/packages/dms/src/index.js ./src/dms/packages/dms/src/index.js

# Copy SSR entry point
COPY --from=builder /app/src/entry-ssr.jsx ./src/entry-ssr.jsx

# Copy root package.json (needed for module resolution)
COPY --from=builder /app/package.json ./

# Install only linkedom for SSR DOM stubs (already in dist but needs runtime)
RUN cd src/dms/packages/dms-server && npm install --omit=dev 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=5555

EXPOSE 5555

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5555) + '/graph', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'get',paths:[['dms','data','_ping+_ping','length']]})}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "--max-http-header-size=1048576", "src/dms/packages/dms-server/src/index.js"]
```

> **Note:** The multi-stage build keeps the final image smaller by discarding devDependencies and build tooling. The first build will take a few minutes (Vite build + TailwindCSS); subsequent rebuilds use Docker layer caching if `package.json` hasn't changed.

## How SSR Works

1. The **build step** (`npm run build:ssr`) produces two outputs:
   - `dist/client/` — Static JS/CSS assets served to browsers
   - `dist/server/entry-ssr.js` — Server-side render function

2. At startup, the server detects `DMS_SSR=1` and calls `mountSSR()` which:
   - Loads the SSR entry point (`dist/server/entry-ssr.js`)
   - Sets up Vite middleware (dev) or serves static files from `dist/client/` (production)
   - Intercepts page requests, renders HTML server-side, and injects `window.__dmsSSRData`

3. The browser receives pre-rendered HTML with data already embedded. React **hydrates** the existing DOM instead of rendering from scratch, giving users instant page loads.

## SSR Environment Variables

These are in addition to the standard server env vars (see simple server doc):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DMS_SSR` | Yes | — | Set to `1` to enable SSR |
| `DMS_APP` | Yes | — | App name (e.g., `avail-dms`, `transportny`) |
| `DMS_TYPE` | Yes | — | Site type (e.g., `site`, `pattern-admin`) |
| `DMS_BASE_URL` | No | `/list` | Base URL path for the site |
| `DMS_AUTH_PATH` | No | `/auth` | Path for auth pages |
| `DMS_PG_ENVS` | No | — | Comma-separated list of PG env names for dataset patterns |

**Finding your DMS_APP and DMS_TYPE:** These must match the `app` and `type` values of your site row in the database. Use the DMS CLI:

```bash
dms raw list <app> <type>    # List rows to find your site
dms site tree                # Show the site structure
```

Or query directly:

```sql
SELECT DISTINCT app, type FROM data_items WHERE type NOT LIKE '%|%' LIMIT 20;
```

## Standard Server Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP listen port |
| `DMS_DB_ENV` | Yes | `dms-sqlite` | Name of DB config file (without `.config.json`) |
| `DMS_AUTH_DB_ENV` | Yes | `auth-sqlite` | Name of auth DB config file |
| `JWT_SECRET` | Yes | — | Secret for JWT signing. Generate with `openssl rand -hex 32` |
| `DMS_SPLIT_MODE` | No | `legacy` | Fallback split mode (config file value takes precedence) |

## PostgreSQL Setup

On your PostgreSQL server, create the databases and user:

```bash
sudo -u postgres psql << 'SQL'
CREATE USER dms_user WITH PASSWORD 'your-password';
CREATE DATABASE dms_db OWNER dms_user;
CREATE DATABASE dms_auth OWNER dms_user;
SQL
```

The DMS server auto-initializes schemas on first connection. No manual schema setup is needed.

## Database Config Files

Config files live in `src/dms/packages/dms-server/src/db/configs/` and are referenced by name (without `.config.json`).

```json
{
  "type": "postgres",
  "role": "dms",
  "host": "10.0.0.5",
  "port": 5432,
  "database": "dms_db",
  "user": "dms_user",
  "password": "your-password",
  "splitMode": "per-app"
}
```

- `role`: `"dms"` for the main database, `"auth"` for the auth database
- `splitMode`: `"per-app"` for new databases. Omit or set `"legacy"` for existing databases that haven't been migrated.

## Updating

When there are code or content changes, rebuild and restart:

```bash
cd dms-site

# Pull latest (including submodule)
git pull --recurse-submodules

# Rebuild (re-runs frontend build)
docker build -t dms-ssr .

# Restart
docker stop dms-ssr && docker rm dms-ssr
docker run -d \
  --name dms-ssr \
  --env-file .env \
  -p 5555:5555 \
  --restart unless-stopped \
  dms-ssr
```

If only database content changed (pages, sections), just restart the container — SSR renders from the database at request time, so no rebuild is needed:

```bash
docker restart dms-ssr
```

## nginx Configuration

Point your nginx at port 5555. For SSR, the server handles all routes (including `/*` page routes), so nginx should proxy everything except static assets and images.

```nginx
upstream dms_backend {
    server 127.0.0.1:5555;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name dms.example.com;

    ssl_certificate /etc/letsencrypt/live/dms.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dms.example.com/privkey.pem;

    client_max_body_size 500M;

    # Static images (served by nginx directly, not the container)
    location /img/ {
        alias /path/to/img/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # WebSocket for real-time sync
    location /sync/subscribe {
        proxy_pass http://dms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # All routes — SSR handles page rendering + API
    location / {
        proxy_pass http://dms_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
    }
}
```

## Endpoints

SSR adds page-rendering routes on top of the standard API endpoints:

| Path | Method | Description |
|------|--------|-------------|
| `/*` | GET | Server-rendered HTML pages |
| `/assets/*` | GET | Static JS/CSS bundles (from Vite build) |
| `/graph` | POST/GET | Falcor JSON Graph API |
| `/auth/*` | Various | Login, signup, JWT refresh |
| `/sync/bootstrap` | GET | Full data snapshot for offline sync |
| `/sync/delta` | GET | Incremental changes since revision |
| `/sync/push` | POST | Client mutations |
| `/sync/subscribe` | WebSocket | Real-time change notifications |
| `/dama-admin/*` | Various | File upload, publish, validate |

## Troubleshooting

**Container won't start / exits immediately:**
```bash
docker logs dms-ssr
```
Check for:
- Database connection errors (PG not reachable from container)
- Missing `DMS_APP` or `DMS_TYPE` — SSR needs these to know which site to render
- Missing config files — ensure `dms-prod.config.json` and `auth-prod.config.json` exist

**Pages render but show loading spinners:**
SSR is working but client hydration failed. Check browser console for errors. Common cause: `DMS_APP`/`DMS_TYPE` don't match the actual values in the database.

**"No configuration file found for environment 'dms-sqlite'":**
The server defaults to SQLite if `DMS_DB_ENV` is not set. Make sure your `.env` file sets `DMS_DB_ENV` and `DMS_AUTH_DB_ENV` to your PostgreSQL config names.

**Connection refused from container to localhost PG:**
Docker containers can't reach `localhost` on the host. Either:
- Use `--network host` flag on `docker run`
- Use the host's LAN IP in the config file
- Use `host.docker.internal` (Docker Desktop only)

**Build fails during `npm run build:ssr`:**
The frontend build requires all dependencies (including devDependencies). Make sure the builder stage runs `npm install` (not `npm install --omit=dev`).

**SSR renders wrong site / blank pages:**
Verify `DMS_APP` and `DMS_TYPE` match exactly what's in the database. These are case-sensitive. Use `dms site tree` to confirm.
