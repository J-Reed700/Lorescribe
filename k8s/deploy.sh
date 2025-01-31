#!/bin/bash

# Exit on error
set -e

# Find and source the .env file
if [ -f "../.env" ]; then
    echo "Loading environment variables from ../.env"
    source "../.env"
elif [ -f ".env" ]; then
    echo "Loading environment variables from .env"
    source ".env"
else
    echo "Error: No .env file found in current or parent directory"
    exit 1
fi

# Check if required environment variables are set
required_vars=(
  "DISCORD_TOKEN"
  "OPENAI_API_KEY"
  "DISCORD_CLIENT_ID"
  "DISCORD_BOT_IMAGE"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "Error: $var is not set"
    exit 1
  fi
done

# Generate Redis password if not set
if [ -z "$REDIS_PASSWORD" ]; then
  echo "Generating secure Redis password..."
  # Generate a password without special characters
  REDIS_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  echo "Generated Redis password. Please save this for future reference:"
  echo "$REDIS_PASSWORD"
fi

# Set default values
PROJECT_ID=${PROJECT_ID:-"lorescribe"}

# Create base64 encoded secrets for Discord bot
DISCORD_TOKEN_B64=$(echo -n "$DISCORD_TOKEN" | base64 | tr -d '\n')
OPENAI_API_KEY_B64=$(echo -n "$OPENAI_API_KEY" | base64 | tr -d '\n')

# Create Kubernetes secrets
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: discord-bot-secrets
type: Opaque
data:
  DISCORD_TOKEN: $DISCORD_TOKEN_B64
  OPENAI_API_KEY: $OPENAI_API_KEY_B64
EOF

# Use different delimiter for sed to avoid issues with slashes in URLs
sed -e "s|\${PROJECT_ID}|$PROJECT_ID|g" \
    -e "s|DISCORD_TOKEN_VALUE|$DISCORD_TOKEN|g" \
    -e "s|OPENAI_API_KEY_VALUE|$OPENAI_API_KEY|g" \
    -e "s|DISCORD_CLIENT_ID_VALUE|$DISCORD_CLIENT_ID|g" \
    -e "s|DISCORD_BOT_IMAGE_VALUE|$DISCORD_BOT_IMAGE|g" \
    discord-bot.yaml > discord-bot-final.yaml

sed -e "s|REDIS_PASSWORD_VALUE|$REDIS_PASSWORD|g" \
    redis.yaml > redis-final.yaml

# Apply the Kubernetes manifests
kubectl apply -f redis-final.yaml
kubectl apply -f discord-bot-final.yaml

# Clean up temporary files
rm -f discord-bot-final.yaml redis-final.yaml

# Wait for the Discord bot to be ready
echo "Waiting for Discord bot to be ready..."
kubectl wait --for=condition=ready pod/discord-bot-0 --timeout=300s
kubectl wait --for=condition=ready pod -l app=discord-bot --timeout=300s


echo "Deployment complete!" 