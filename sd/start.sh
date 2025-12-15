#!/bin/bash
set -e

export MODEL_NAME="stabilityai/sdxl-turbo"
export MODEL_DIR="/app/models/sdxl-turbo"

# --- 1. MODEL DOWNLOAD/PERSISTENCE CHECK ---
# We keep the model download check here. 
# This runs only on first startup to get the files onto the sd-models volume, 
# but DOES NOT load them into VRAM.

mkdir -p "$MODEL_DIR"

python3 -u - <<PYTHON
from diffusers import StableDiffusionXLPipeline
from pathlib import Path
import os
import sys
# NOTE: We DO NOT import torch here to avoid unnecessary memory overhead 
# for a simple file check.

model_dir = Path(os.environ["MODEL_DIR"])
model_name = os.environ["MODEL_NAME"]
# Check if the directory is empty or if the primary checkpoint file is missing
# Assuming StableDiffusionXLPipeline saves a pytorch_model.bin or similar
# Checking for ANY file is usually enough since the mount happens at startup.
if not any(model_dir.iterdir()):
    print(f"🚀 Downloading {model_name} to {model_dir}...", flush=True)
    print("⏳ This may take a while depending on your connection...", flush=True)
    print("💾 Downloading ~18-20GB of model files...", flush=True)
    sys.stdout.flush()
    
    # We use .from_pretrained() with local_files_only=False (default) to download
    # but we DO NOT save the returned pipe object or move it to CUDA/GPU here.
    # The actual pipe object initialization (and resource usage) is in app.py.
    
    # Use the download capabilities of from_pretrained and save it locally
    StableDiffusionXLPipeline.from_pretrained(
        model_name,
        token=os.environ.get("HUGGINGFACE_TOKEN"),
        # We don't specify torch_dtype or .to('cuda') here, only download
    ).save_pretrained(model_dir) 
    
    print("✅ Download complete and saved to persistent volume!", flush=True)
else:
    print(f"✅ Model files already exist at {model_dir}")
PYTHON

# --- 2. START THE API SERVER ---
# The server starts fast and then waits for the first request 
# to trigger the GPU loading inside app.py.
echo "🚀 Starting API server. Model loading is set to ON-DEMAND..."
python3 app.py