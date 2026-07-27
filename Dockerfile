# --- deps: install dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: build the Next.js app ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: minimal production image ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/uploads ./uploads
COPY --from=builder ["/app/bng subscriber uploads", "./bng subscriber uploads/"]
COPY --from=builder ["/app/bng utilisation uploads", "./bng utilisation uploads/"]
COPY --from=builder ["/app/bras data uploads", "./bras data uploads/"]
COPY --from=builder ["/app/transport flow uploads", "./transport flow uploads/"]

EXPOSE 3001
CMD ["node", "server.js"]
