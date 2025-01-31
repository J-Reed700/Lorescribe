#!/bin/bash

# Exit on error
set -e

# Check if project ID is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <project-id>"
    exit 1
fi

PROJECT_ID=$1
IMAGE_NAME="discord-bot"
TAG="latest"

# Configure docker to use gcloud as a credential helper
gcloud auth configure-docker

# Build the image
echo "Building container image..."
docker build -t "gcr.io/$PROJECT_ID/$IMAGE_NAME:$TAG" .

# Push the image
echo "Pushing image to Google Container Registry..."
docker push "gcr.io/$PROJECT_ID/$IMAGE_NAME:$TAG"

echo "Image built and pushed successfully: gcr.io/$PROJECT_ID/$IMAGE_NAME:$TAG"
echo "Use this image name in your DISCORD_BOT_IMAGE environment variable" 