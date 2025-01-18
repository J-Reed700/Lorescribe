FROM node:18-slim

# Install system dependencies and MongoDB tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libopus-dev \
    opus-tools \
    build-essential \
    python3 \
    libsodium-dev \
    libtool \
    autoconf \
    automake \
    pkg-config \
    make \
    g++ \
    git \
    gnupg \
    wget \
    && wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add - \
    && echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list \
    && apt-get update \
    && apt-get install -y mongodb-mongosh \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Copy package files first
COPY package.json pnpm-lock.yaml ./

# Install dependencies with increased memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"
RUN pnpm install 
RUN pnpm add opusscript
RUN pnpm rebuild

# Copy the rest of the application
COPY . .

# Add MongoDB connection check script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set entrypoint to wait for MongoDB
ENTRYPOINT ["docker-entrypoint.sh"]

# Set default command
CMD ["pnpm", "start"]