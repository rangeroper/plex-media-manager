# Base image with Python and CUDA (for GPU acceleration)
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git wget curl python3 python3-pip python3-venv build-essential \
    ffmpeg libsm6 libxext6 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN python3 -m pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy application files
COPY app.py .
COPY start.sh .
RUN chmod +x start.sh

# Expose web UI port
EXPOSE 9090

# Default entrypoint
ENTRYPOINT ["./start.sh"]