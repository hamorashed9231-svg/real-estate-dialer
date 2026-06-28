FROM node:20-alpine

# Install OpenSSL library needed by Prisma Engine on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install dependencies inside backend directory
RUN npm ci --prefix backend --production=false

# Copy backend source code
COPY backend/ ./backend/

# Generate Prisma Client (uses the locally installed Prisma v5 CLI to avoid v7 conflicts)
RUN ./backend/node_modules/.bin/prisma generate --schema=backend/prisma/schema.prisma

# Build the backend project
RUN npm run build --prefix backend

EXPOSE 5000

CMD ["sh", "-c", "./backend/node_modules/.bin/prisma db push --schema=backend/prisma/schema.prisma && node backend/dist/index.js"]
