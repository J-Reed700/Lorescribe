#!/bin/bash
set -e

echo "Waiting for MongoDB to be ready..."
until mongosh --host mongodb --eval "print(\"MongoDB connection successful\")" > /dev/null 2>&1; do
  echo "MongoDB is unavailable - sleeping 2s"
  sleep 2
done
echo "MongoDB is up - executing command"

# Execute the main container command
exec "$@" 