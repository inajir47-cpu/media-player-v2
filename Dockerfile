FROM node:20-alpine
WORKDIR /app

# Install backend dependencies first (better layer caching)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy the full project (backend serves the frontend from the project root)
COPY . .

ENV PORT=3101
EXPOSE 3101
WORKDIR /app/backend
CMD ["node", "server.mjs"]
