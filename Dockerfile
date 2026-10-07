# --- build stage ---
FROM docker.io/node:26-bookworm-slim AS builder
WORKDIR /app

# Manifests before source: npm ci re-runs only when dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve stage ---
# nginx-unprivileged runs as uid 101 on port 8080 and keeps its pid and temp
# files under /tmp, which lets the pod run with a read-only root.
FROM docker.io/nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 8080
