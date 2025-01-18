FROM node:18-slim

# Install system dependencies
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
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Copy package files first
COPY package.json pnpm-lock.yaml ./

# Install dependencies with increased memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"
RUN pnpm install


# Copy the rest of the application
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set entrypoint and default command
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["pnpm", "start"]