# DMS Server — Docker image with DAMA/GIS support
# Includes GDAL for GIS dataset processing, Sharp for image processing,
# and all native build dependencies.
#
# Build:  docker build -t dms-server .
# Run:    docker run -d --env-file .env -p 5555:5555 -v dms-data:/app/var --name dms-server dms-server
#
# Environment variables (see documentation for full list):
#   PORT                        Server port (default: 5555)
#   DMS_DB_ENV                  DMS database config name
#   DMS_AUTH_DB_ENV             Auth database config name
#   DAMA_SERVER_URL             Public URL for tile metadata (e.g., https://dmsserver.availabs.org)
#   DMS_STORAGE_TYPE            Storage backend: 'local' (default) or 's3'
#   AWS_*                       S3 credentials (when DMS_STORAGE_TYPE=s3)

FROM node:22-bookworm-slim

WORKDIR /app

# Native dependencies:
#   gdal-bin + libgdal-dev  — ogr2ogr CLI + gdal-async Node bindings
#   build-essential + python3 — native addon compilation (gdal-async, sharp, better-sqlite3)
#   zip — download file creation
RUN apt-get update && apt-get install -y \
      gdal-bin \
      libgdal-dev \
      build-essential \
      python3 \
      zip \
      --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files first for layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy server source (includes db configs)
COPY src/ ./src/

# Persistent storage: host ID, upload temp files, local file storage
VOLUME /app/var

ENV NODE_ENV=production
ENV PORT=5555

EXPOSE 5555

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5555) + '/graph', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'get',paths:[['dms','data','_ping+_ping','length']]})}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "--max-http-header-size=1048576", "src/index.js"]
