#!/bin/bash

echo "Starting Stable Diffusion API..."

# Models will be downloaded when first requested via the API

# Create necessary directories
mkdir -p /app/models
mkdir -p /app/data/sd-output

# Start the Flask API
echo "Starting Flask API on port 9090..."
python /app/app.py
