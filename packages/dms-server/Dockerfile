# DMS Server — Docker image for API server mode
# Connects to an external PostgreSQL database over the network.
#
# Build:  docker build -t dms-server .
# Run:    docker run -d --env-file .env -p 5555:5555 --name dms-server dms-server
#
# Before building, create your database config files in src/db/configs/
# See docs/deploy-simple-docker-server.md for details.

FROM node:22-bookworm-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy server source (includes db configs)
COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=5555

EXPOSE 5555

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5555) + '/graph', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'get',paths:[['dms','data','_ping+_ping','length']]})}).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "--max-http-header-size=1048576", "src/index.js"]
