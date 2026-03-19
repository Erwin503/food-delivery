FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY knexfile.js ./
COPY src ./src
COPY migrations ./migrations
COPY seeds ./seeds

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/knexfile.js ./knexfile.js
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/seeds ./seeds

EXPOSE 3000

CMD ["node", "dist/index.js"]
