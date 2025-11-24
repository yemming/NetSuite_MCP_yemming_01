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
