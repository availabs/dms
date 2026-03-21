# Deploy: Simple Docker Server

Run the DMS server in a Docker container connecting to an external PostgreSQL database. The container exposes a single port (default 5555) that you put your own nginx in front of.

This uses the `dms` repo directly — no need for a site template repo.

## Prerequisites

- Docker installed on the host
- A running PostgreSQL server accessible over the network
- Git access to the dms repository

## Quick Start

```bash
# 1. Clone the dms repo
git clone <dms-repo-url> dms
cd dms/packages/dms-server

# 2. Create database config files
cd src/db/configs/

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

cd ../../..

# 3. Create .env file
cat > .env << 'EOF'
PORT=5555
DMS_DB_ENV=dms-prod
DMS_AUTH_DB_ENV=auth-prod
JWT_SECRET=<generate-with: openssl rand -hex 32>
DMS_SPLIT_MODE=per-app
EOF

# 4. Build and run
docker build -t dms-server .
docker run -d \
  --name dms-server \
  --env-file .env \
  -p 5555:5555 \
  --restart unless-stopped \
  dms-server
```

## PostgreSQL Setup

On your PostgreSQL server, create the databases and user:

```bash
sudo -u postgres psql << 'SQL'
CREATE USER dms_user WITH PASSWORD 'your-password';
CREATE DATABASE dms_db OWNER dms_user;
CREATE DATABASE dms_auth OWNER dms_user;
SQL
```

The DMS server auto-initializes schemas (`dms.data_items`, auth tables, etc.) on first connection. No manual schema setup is needed.

## Database Config Files

Config files live in `src/db/configs/` and are referenced by name (without `.config.json`). The `DMS_DB_ENV` and `DMS_AUTH_DB_ENV` env vars select which config to use.

For PostgreSQL connecting over the network:

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
- `splitMode`: `"per-app"` for new databases (each app gets its own schema). Omit or set `"legacy"` for existing databases that haven't been migrated.
- You can use the same PostgreSQL server/database for both DMS and auth by setting `"role": ["dms", "auth"]` in a single config file and pointing both env vars at it.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | HTTP listen port |
| `DMS_DB_ENV` | Yes | `dms-sqlite` | Name of DB config file (without `.config.json`) |
| `DMS_AUTH_DB_ENV` | Yes | `auth-sqlite` | Name of auth DB config file |
| `JWT_SECRET` | Yes | — | Secret for JWT signing. Generate with `openssl rand -hex 32`. Must stay consistent across restarts. |
| `DMS_SPLIT_MODE` | No | `legacy` | Fallback split mode (config file value takes precedence) |
| `DMS_SYNC_AUTH` | No | — | Set to `1` to require JWT on sync endpoints |
| `DMS_SYNC_COMPACT_DAYS` | No | `30` | Change log retention (days) |
| `DMS_LOG_REQUESTS` | No | `0` | Set to `1` to log all Falcor requests |

## Updating

When there are code changes, pull and rebuild:

```bash
cd dms/packages/dms-server

# Pull latest
git pull

# Rebuild (uses cached node_modules layer if package.json unchanged)
docker build -t dms-server .

# Restart
docker stop dms-server && docker rm dms-server
docker run -d \
  --name dms-server \
  --env-file .env \
  -p 5555:5555 \
  --restart unless-stopped \
  dms-server
```

When only server JS files changed (no dependency changes), the rebuild uses the cached `npm install` layer and completes in seconds.

## nginx Configuration

Point your nginx at port 5555. Key requirements: WebSocket upgrade for `/sync/subscribe`, large body size for uploads, long timeouts for WebSocket connections.

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

    # WebSocket
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

    # All other routes
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

## Endpoints Exposed

| Path | Method | Description |
|------|--------|-------------|
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
docker logs dms-server
```
Usually a database connection issue. Check that:
- PostgreSQL is reachable from the Docker container (use `--network host` if PG is on localhost)
- Config file credentials are correct
- Database exists

**Connection refused from container to localhost PG:**
Docker containers can't reach `localhost` on the host. Either:
- Use `--network host` flag on `docker run`
- Use the host's LAN IP in the config file
- Use `host.docker.internal` (Docker Desktop only)

**Schema not initializing:**
The server creates schemas on first connection. Check logs for SQL errors. The `role` field in the config must be `"dms"` or `"auth"` (or both as an array).

**JWT_SECRET missing:**
The server will start but auth endpoints will fail. Always set this in `.env`.
