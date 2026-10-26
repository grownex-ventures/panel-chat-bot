FROM node:22-slim AS base

WORKDIR /app

# Install curl for optional container healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Run as non-root user for security
USER node

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
