FROM node:20-alpine
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install dependencies inside backend directory
RUN npm ci --prefix backend --production=false

# Copy backend source code
COPY backend/ ./backend/

# Generate Prisma Client
RUN npx prisma generate --schema=backend/prisma/schema.prisma

# Build the backend project
RUN npm run build --prefix backend

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push --schema=backend/prisma/schema.prisma && node backend/dist/index.js"]
