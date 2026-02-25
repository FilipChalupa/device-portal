# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy all files for building
COPY . .

# Install all dependencies and build everything
RUN npm ci && npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy all package.json files for all workspaces to satisfy symlinks
# We use individual COPY for clarity and to ensure directories exist
COPY packages/client/package.json ./packages/client/
COPY packages/react/package.json ./packages/react/
COPY packages/server/package.json ./packages/server/
COPY packages/constants/package.json ./packages/constants/

# Install ONLY production dependencies for the server (and its workspace dependencies like constants)
# Note: npm ci --omit=dev -w @device-portal/server might not correctly link workspaces if not careful,
# but it should if package.json files are there.
RUN npm ci --omit=dev -w @device-portal/server

# Copy built outputs for everything the server needs at runtime
# Ensure they are copied to the correct paths so symlinks work
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/scripts ./packages/server/scripts
COPY --from=builder /app/packages/constants/dist ./packages/constants/dist
COPY --from=builder /app/packages/react/storybook-static ./packages/react/storybook-static

# Expose the default port
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Run the server using the root command
CMD ["npm", "run", "start:server"]
