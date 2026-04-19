FROM node:20-alpine

# openssl is needed to generate the self-signed TLS cert on first run
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Directories that must exist inside the image
# (volumes will overlay these at runtime)
RUN mkdir -p uploads/photos certs data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
