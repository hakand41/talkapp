# Ultra-lightweight Alpine container for TalkApp with Node 22+ (Built-in node:sqlite)
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source files
COPY server.js ./
COPY db.js ./
COPY ssl-helper.js ./
COPY public ./public

# Create data directory for SQLite, Uploads and SSL
RUN mkdir -p /app/data/uploads /app/ssl

# Expose WebRTC Signaling & HTTP/HTTPS ports
EXPOSE 3000 443

ENV PORT=3000
ENV NODE_ENV=production

# Start signaling server
CMD ["node", "server.js"]
