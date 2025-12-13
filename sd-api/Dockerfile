# Use official PyTorch runtime with CUDA
FROM pytorch/pytorch:2.2.0-cuda11.8-cudnn8-runtime

WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    diffusers[torch] \
    transformers \
    accelerate \
    safetensors \
    fastapi \
    uvicorn \
    pillow \
    python-multipart

# Copy FastAPI app
COPY app.py .

# Expose port for API
EXPOSE 8000

# Run FastAPI
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
