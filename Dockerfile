# Build natively on the builder so ARM64 only receives portable JS and production dependencies.
FROM --platform=$BUILDPLATFORM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 DATA_DIRECTORY=/data XDG_CACHE_HOME=/data/.cache \
    PATH="/opt/media/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ffmpeg aria2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-media.txt ./
RUN python3 -m venv /opt/media && /opt/media/bin/python -m pip install --no-cache-dir -r requirements-media.txt
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080 6881/tcp 6881/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/server/index.js"]
