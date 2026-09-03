# ============================================================================
# Build stage: compile TypeScript to JavaScript
# ============================================================================
FROM node:24-alpine AS builder

WORKDIR /app

# Copying package*.json separately before the source enables Docker layer
# caching: if dependencies did not change, the npm install layer is reused.
COPY package*.json ./

# 'npm ci' installs the exact versions from package-lock.json (reproducible
# builds) and fails if package.json and the lockfile are out of sync.
# devDependencies are needed here because the TypeScript compiler is one.
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# Compiles to dist/ and copies src/data alongside it (see the "build" script).
RUN npm run build

# ============================================================================
# Production stage: minimal runtime image
# ============================================================================
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

# --omit=dev excludes devDependencies (TypeScript, @types/*, Biome …), which
# reduces both the image size and the attack surface.
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Running as root is a security risk, so the app gets its own user. Fixed
# UID/GID keep file ownership consistent across environments.
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Files were copied by root but are read by the nodejs user.
RUN chown -R nodejs:nodejs /app

USER nodejs

# Documentation only — the actual mapping happens via 'docker run -p'.
EXPOSE 3000

# Switches the resource identifier to MCP_RESOURCE_ID (see scalekit-config.ts).
ENV NODE_ENV=production

# No --env-file here: the container platform (Azure App Service settings,
# 'docker run -e', …) provides the environment variables.
CMD ["node", "dist/server-sdk-streamable.js"]
