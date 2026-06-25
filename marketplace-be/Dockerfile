# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency files first (better layer caching)
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code, scripts and seed files
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY test-data/ ./test-data/

# Build the NestJS application
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy dependency files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy scripts and seed data needed at runtime
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/test-data ./test-data

# Copy contracts ABIs (defaults, will be overwritten by shared volume at runtime)
COPY src/contracts ./dist/contracts

# Copy i18n translation files (not copied by nest build)
COPY src/i18n ./dist/i18n

# Create directories for uploads and logs
RUN mkdir -p uploads logs /shared

EXPOSE 3000

# Run production server
CMD ["node", "dist/main"]