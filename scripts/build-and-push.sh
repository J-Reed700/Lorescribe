#!/bin/bash

# Exit on error
set -e

# Get the project ID and region from gcloud config
PROJECT_ID=$(gcloud config get-value project)
REGION=$(gcloud config get-value compute/region || echo "us-central1")
IMAGE_NAME="discord-bot"
TAG=$(git rev-parse --short HEAD)
REGISTRY_URL="$REGION-docker.pkg.dev/$PROJECT_ID/discord-bot"

# Build the Docker image
echo "Building Docker image..."
docker build -t $REGISTRY_URL/$IMAGE_NAME:$TAG .
docker tag $REGISTRY_URL/$IMAGE_NAME:$TAG $REGISTRY_URL/$IMAGE_NAME:latest

# Configure Docker to use gcloud as a credential helper
gcloud auth configure-docker $REGION-docker.pkg.dev

# Push the image to Artifact Registry
echo "Pushing image to Artifact Registry..."
docker push $REGISTRY_URL/$IMAGE_NAME:$TAG
docker push $REGISTRY_URL/$IMAGE_NAME:latest

# Output the image URL
echo "Image URL: $REGISTRY_URL/$IMAGE_NAME:$TAG"
echo "Latest Image URL: $REGISTRY_URL/$IMAGE_NAME:latest"

# Update terraform.tfvars with the new image
echo "Updating terraform.tfvars..."
sed -i.bak "s|container_image.*=.*|container_image = \"$REGISTRY_URL/$IMAGE_NAME:$TAG\"|" terraform/terraform.tfvars

echo "Done! You can now run terraform apply in the terraform directory." 