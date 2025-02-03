#!/bin/bash

# Ensure guild-configs directory exists
mkdir -p /root/Lorescribe/guild-configs
chmod 777 /root/Lorescribe/guild-configs

# Run Docker container with volume mount
docker run -it --rm \
  -p 8080:8080 \
  --env-file .env \
  -v /root/Lorescribe/guild-configs:/usr/src/app/guild-configs \
  lorescribe 