# --- build stage ---
FROM docker.io/node:26-bookworm-slim AS builder
WORKDIR /app

# Manifests before source: npm ci re-runs only when dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# --- serve stage ---
# One Node process: SvelteKit's pages, API and static files, plus the game's sockets (server/index.ts).
# tsx runs the server's TypeScript directly; the engine's extensionless imports need it.
FROM docker.io/node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/lib ./src/lib

# The image's unprivileged user (uid 1000).
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/index.ts"]
