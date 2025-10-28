FROM node:20-alpine AS builder

WORKDIR /app

# Copying package*.json separately before source code enables Docker layer caching:
# - If dependencies haven't changed, Docker reuses the cached npm install layer
# - This significantly speeds up subsequent builds when only source code changes
COPY package*.json ./

# ---- Install ALL dependencies (including devDependencies) ----
# Using 'npm ci' instead of 'npm install' because:
# - It's faster and more reliable for CI/CD environments
# - It installs exact versions from package-lock.json (reproducible builds)
# - It will fail if package.json and package-lock.json are out of sync
# We need devDependencies here because TypeScript compiler is typically a dev dependency
RUN npm ci

# ---- Copy TypeScript configuration and source code ----
# This is done AFTER installing dependencies to maximize cache efficiency
# - tsconfig.json: TypeScript compiler configuration (target, module system, etc.)
# - src/: All TypeScript source files that need to be compiled
COPY tsconfig.json ./
COPY src/ ./src/

# ---- Compile TypeScript to JavaScript ----
# This runs the TypeScript compiler (tsc) as defined in package.json scripts
# Output goes to the dist/ directory as configured in tsconfig.json
RUN npm run build

# ============================================================================
# Production Stage: Create minimal runtime image
# ============================================================================
# Start fresh with a clean Node.js Alpine image (no build artifacts or dev dependencies)
# This multi-stage approach keeps the final image size minimal
FROM node:20-alpine

WORKDIR /app

# ---- Copy dependency manifests ----
# We need package files again to install production dependencies in this stage
COPY package*.json ./

# ---- Install ONLY production dependencies ----
# The --omit=dev flag excludes devDependencies (like TypeScript, @types/* packages)
# This reduces the final image size and attack surface by excluding build-time tools
RUN npm ci --omit=dev

# ---- Copy compiled JavaScript from builder stage ----
# Copy only the dist/ directory containing compiled JavaScript from the first stage
# This avoids including TypeScript source files, node_modules from builder, etc.
COPY --from=builder /app/dist ./dist

# ---- Security: Create and configure non-root user ----
# Running containers as root is a security risk. We create a dedicated user:
# - addgroup: Creates a system group named "nodejs" with GID 1001
# - adduser: Creates a system user named "nodejs" with UID 1001 in the nodejs group
# Using specific UIDs/GIDs ensures consistency across different environments
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# ---- Set proper file ownership ----
# Change ownership of all application files to the nodejs user
# This is necessary because files were copied by root, but will be accessed by nodejs user
RUN chown -R nodejs:nodejs /app

# ---- Switch to non-root user ----
# All subsequent commands and the CMD will run as the nodejs user
# This limits potential damage if the application is compromised
USER nodejs

# ---- Document the application port ----
# EXPOSE doesn't actually publish the port, it's documentation for users
# The actual port mapping is done with 'docker run -p' or in docker-compose.yml
# This tells users and orchestration tools which port the application listens on
EXPOSE 3000

# ---- Set production environment ----
ENV NODE_ENV=production

# ---- Define the startup command ----
CMD ["node", "dist/server-sdk-streamable.js"]

