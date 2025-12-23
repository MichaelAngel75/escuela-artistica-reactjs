# ---------- BUILD STAGE ----------
FROM node:22-alpine AS build

WORKDIR /app

# Copy package metadata and install deps
COPY package*.json ./
RUN npm install

# Copy the rest of the source (client, server, shared, index.html, configs, etc.)
COPY . .

# Build frontend (Vite) + backend (esbuild) into /app/dist
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:22-alpine

WORKDIR /app

# Copy only what is needed to run
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Install only production dependencies
RUN npm install  
#--omit=dev

ENV NODE_ENV=production
ENV ACADEMY_NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start the bundled server (dotenv not needed inside container if you use env vars)
CMD ["node", "dist/index.js"]