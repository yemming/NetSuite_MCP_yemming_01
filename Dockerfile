FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists (Next.js may not create it if empty)
RUN mkdir -p ./public

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production dependencies stage
# We need a clean node_modules with only production dependencies
# because Next.js standalone output might prune dependencies that are dynamically required
FROM base AS prod_deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Apply patches to @suiteinsider/netsuite-mcp to allow environment variable auth injection
# 1. Force hasValidSession to true
# 2. Inject NETSUITE_ACCESS_TOKEN in ensureValidToken
# 3. Inject NETSUITE_ACCOUNT_ID in getAccountId
RUN sed -i 's/return await this.storage.isAuthenticated();/return true;/g' node_modules/@suiteinsider/netsuite-mcp/src/oauth/manager.js && \
    sed -i 's/const session = await this.storage.load();/if (process.env.NETSUITE_ACCESS_TOKEN) return process.env.NETSUITE_ACCESS_TOKEN; const session = await this.storage.load();/g' node_modules/@suiteinsider/netsuite-mcp/src/oauth/manager.js && \
    sed -i 's/return session?.tokens?.accountId;/return process.env.NETSUITE_ACCOUNT_ID || session?.tokens?.accountId;/g' node_modules/@suiteinsider/netsuite-mcp/src/oauth/manager.js

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public directory (will be empty if not present in source, but directory exists after builder stage)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# CRITICAL FIX: Copy FULL production node_modules
# Next.js standalone build prunes dependencies it thinks are unused.
# But since we spawn a child process that uses them, we must ensure they are present.
# We overwrite the standalone node_modules with the full production set.
COPY --from=prod_deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy the sessions directory if it exists (for local dev persistence, though usually empty in build)
# We need to ensure the runner can write to it
RUN mkdir -p /app/sessions && chown nextjs:nodejs /app/sessions

USER nextjs

# Zeabur will provide PORT via WEB_PORT environment variable
# Use PORT if set, otherwise default to 3000
EXPOSE 3000

ENV HOSTNAME "0.0.0.0"
# PORT will be set by Zeabur via WEB_PORT, don't hardcode it

CMD ["node", "server.js"]
