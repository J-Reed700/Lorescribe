#!/bin/sh
set -e

# Function to wait for Redis to be ready
wait_for_redis() {
    echo "Waiting for Redis to be ready..."
    until nc -z redis 6379; do
        echo "Redis is unavailable - sleeping"
        sleep 1
    done
    echo "Redis is up - executing command"
}

# Wait for Redis before starting the application
wait_for_redis

# Execute the main command
exec "$@" 