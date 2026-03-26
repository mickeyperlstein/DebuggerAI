FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output only — no TypeScript source needed at runtime
COPY out/ ./out/

EXPOSE 7890

ENV DEBUGAI_PORT=7890

CMD ["node", "out/bin/server.js"]
