#!/bin/bash

echo "========================================="
echo "Telegram Session Generator (Docker)"
echo "========================================="

# Build image
docker build -f Dockerfile.session -t telegram-session-generator .

# Run interactively
docker run -it --rm \
  --name telegram-session-gen \
  telegram-session-generator