# =============================================================================
# KV Manager - Cloudflare Workers Deployment
# =============================================================================
# Multi-stage build for optimal image size and security
# Production-ready image: ~150MB
# =============================================================================

# -----------------
# Stage 1: Builder
# -----------------
FROM node:20-alpine AS builder

WORKDIR /app

# Upgrade npm to latest version to fix CVE-2024-21538 (cross-spawn vulnerability)
# Note: npm@11.6.2 includes glob@11.0.3 and tar@7.5.1 which have known vulnerabilities
# (CVE-2025-64756, CVE-2025-64118). However, these vulnerabilities are in npm's CLI
# dependencies and do not affect our application code. The npm team has not yet released
# a patched version. See SECURITY.md for details.
RUN npm install -g npm@latest

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# -----------------
# Stage 2: Runtime
# -----------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Upgrade npm to latest version to fix CVE-2024-21538 (cross-spawn vulnerability)
# Note: npm@11.6.2 includes glob@11.0.3 and tar@7.5.1 which have known vulnerabilities
# (CVE-2025-64756, CVE-2025-64118). However, these vulnerabilities are in npm's CLI
# dependencies and do not affect our application code. The npm team has not yet released
# a patched version. See SECURITY.md for details.
RUN npm install -g npm@latest

# Install runtime dependencies only
# Security Notes:
# - Application dependencies: glob@11.1.0, tar@7.5.2 (patched via package.json overrides)
# - npm CLI dependencies: glob@11.0.3, tar@7.5.1 (vulnerabilities do not affect app code)
# - curl 8.14.1-r2 has CVE-2025-10966 (MEDIUM) with no fix available yet (Alpine base package)
# - busybox 1.37.0-r19 has CVE-2025-46394 & CVE-2024-58251 (LOW) with no fixes available yet (Alpine base package)
# Alpine base package vulnerabilities (curl, busybox) are accepted risks with no available patches
RUN apk add --no-cache \
    curl \
    ca-certificates

# Create non-root user for security
# Note: Alpine Linux uses GID 1000 for 'users' group, so we use a different GID
RUN addgroup -g 1001 app && \
    adduser -D -u 1001 -G app app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/wrangler.toml.example ./wrangler.toml.example

# Set ownership to non-root user
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose Wrangler dev server port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

# Default command: Run Wrangler in development mode
# Override with specific commands for production deployment
CMD ["npx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]

