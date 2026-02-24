# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy all files for building
COPY . .

# Install all dependencies and build the server and storybook
RUN npm ci && npm run build:storybook && npm run build:server

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy all package.json files to satisfy workspaces
COPY packages/client/package.json ./packages/client/
COPY packages/react/package.json ./packages/react/
COPY packages/server/package.json ./packages/server/

# Install only production dependencies for the server
RUN npm ci --omit=dev -w @device-portal/server

# Copy the built server and scripts
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/scripts ./packages/server/scripts

# Copy the built storybook
COPY --from=builder /app/packages/react/storybook-static ./packages/react/storybook-static

# Expose the default port
EXPOSE 8080

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Run the server using the root command
CMD ["npm", "run", "start:server"]
