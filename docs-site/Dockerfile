# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json package-lock.json* ./

# Install all deps (including devDependencies for TypeScript + Docusaurus build)
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY docusaurus.config.ts sidebars.ts ./
COPY src ./src/
COPY docs ./docs/
COPY blog ./blog/
COPY static ./static/

# Build for production
RUN npm run build

# ─── Stage 2: Serve with nginx ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/docs.conf

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
