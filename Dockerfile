FROM node:24-alpine

WORKDIR /app

# Install production dependencies first to take advantage of layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY test ./test
COPY config.xml ./config.xml

USER node

ENTRYPOINT ["node", "src/cli.js"]
