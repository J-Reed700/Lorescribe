# Build stage
FROM --platform=linux/amd64 node:20-slim AS builder

# Install system dependencies for build
RUN apt-get update && apt-get install -y \
    ffmpeg \
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
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/src/app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with increased memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"
RUN pnpm install

# Copy the rest of the application
COPY . .

# Production stage
FROM --platform=linux/amd64 node:20-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    libopus-dev \
    opus-tools \
    netcat-openbsd \
    libmp3lame0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation and codecs
RUN ffmpeg -version && \
    ffmpeg -codecs | grep -iE "(libmp3lame|pcm)"

WORKDIR /usr/src/app

# Copy from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/package.json ./

# Create directories for recordings and temp files
RUN mkdir -p /recordings /usr/src/app/temp /usr/src/app/data/transcripts /usr/src/app/data/summaries /usr/src/app/guild-configs && \
    chmod -R 777 /recordings /usr/src/app/temp /usr/src/app/data/transcripts /usr/src/app/data/summaries /usr/src/app/guild-configs

# Set environment variables
ENV PORT=8080

# Command to run the bot
CMD ["node", "src/bot.js"]