FROM node:18-alpine AS base
WORKDIR /app

# Copy dependency manifests. package-lock.json may not exist; copying both will
# not fail if package-lock.json is missing.
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --production

# Copy the rest of the source code and configuration
COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

EXPOSE 4000
CMD ["node", "dist/server.js"]
