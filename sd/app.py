from flask import Flask, request, jsonify, send_file
from diffusers import StableDiffusionXLPipeline
import torch
import os
from pathlib import Path
from datetime import datetime
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# --- LAZY LOADING: GLOBAL VARIABLES ---
# The model pipeline object will be stored here once loaded.
pipe = None
MODEL_LOADED = False 

MODEL_DIR = os.environ.get("MODEL_DIR", "/app/models/sdxl-turbo")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/app/data/sd-output")
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)


def _load_model_if_needed():
    """
    Initializes the model pipeline if it hasn't been loaded yet.
    This function handles the 'cold start' for image generation.
    """
    global pipe, MODEL_LOADED
    
    if MODEL_LOADED:
        return pipe

    # --- MODEL LOADING LOGIC (Moved from global scope) ---
    logger.info("=" * 80)
    logger.info("⏳ First generation request received. Loading SDXL Turbo model into GPU memory...")
    logger.info(f"📂 Model directory: {MODEL_DIR}")
    start_time = time.time()
    
    try:
        # Load the model from the persisted volume directory
        pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL_DIR,
            torch_dtype=torch.float16
        )
        pipe = pipe.to("cuda")
        
        # Update globals
        MODEL_LOADED = True
        
        load_time = time.time() - start_time
        logger.info(f"✅ Model loaded successfully in {load_time:.2f} seconds")
        logger.info(f"🎮 GPU: {torch.cuda.get_device_name(0)}")
        logger.info("=" * 80)
        
        return pipe

    except Exception as e:
        logger.error(f"❌ ERROR: Failed to load model from {MODEL_DIR}: {e}")
        # Re-raise the exception so the generate endpoint can catch it and return 500
        raise RuntimeError("Model initialization failed.") from e


# Log that the server is ready without the model loaded
logger.info("=" * 80)
logger.info(f"🚀 SD-API server starting... Model will load ON DEMAND (lazy loading enabled).")
logger.info(f"📂 Model directory: {MODEL_DIR}")
logger.info(f"📂 Output directory: {OUTPUT_DIR}")
logger.info(f"🎮 CUDA available: {torch.cuda.is_available()}")
logger.info(f"🚀 API server ready on port 9090")
logger.info("=" * 80)


@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate an image from a text prompt. The model is loaded into memory 
    only on the first call to this endpoint.
    """
    request_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    
    try:
        # 1. Load the model (this will be fast after the first call)
        local_pipe = _load_model_if_needed() 
        
        # 2. Process request data
        data = request.json
        prompt = data.get('prompt')
        if not prompt:
            logger.warning(f"[{request_id}] ❌ Request missing prompt")
            return jsonify({'error': 'prompt is required'}), 400

        negative_prompt = data.get('negative_prompt', '')
        width = data.get('width', 1024)
        height = data.get('height', 1024)
        steps = data.get('num_inference_steps', 4)
        guidance = data.get('guidance_scale', 1.0)
        seed = data.get('seed')

        logger.info("=" * 80)
        logger.info(f"[{request_id}] 📥 NEW GENERATION REQUEST")
        logger.info(f"[{request_id}] 📝 Prompt: {prompt}")
        # ... (other logging as before) ...
        
        # Set seed if provided
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
            logger.info(f"[{request_id}] ✅ Seed set to {seed}")

        logger.info(f"[{request_id}] 🎨 Starting image generation...")
        gen_start = time.time()
        
        # 3. Use the pipeline
        image = local_pipe( # Use the local_pipe variable (which is the loaded model)
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator
        ).images[0]

        gen_time = time.time() - gen_start
        logger.info(f"[{request_id}] ✅ Generation completed in {gen_time:.2f}s")

        # ... (saving logic as before) ...
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        logger.info(f"[{request_id}] 💾 Saving image: {filename}")
        image.save(filepath)
        
        file_size = os.path.getsize(filepath) / (1024 * 1024)
        logger.info(f"[{request_id}] ✅ Saved successfully ({file_size:.2f} MB)")
        logger.info(f"[{request_id}] 📍 Path: {filepath}")
        logger.info(f"[{request_id}] ⏱️  Total time: {gen_time:.2f}s")
        logger.info("=" * 80)

        return jsonify({
            'filename': filename,
            'path': filepath,
            'generation_time': round(gen_time, 2),
            'relative_path': f'/data/sd-output/{filename}'
        })
    
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[{request_id}] ❌ ERROR during generation")
        logger.error(f"[{request_id}] {type(e).__name__}: {str(e)}")
        logger.error("=" * 80)
        return jsonify({'error': str(e)}), 500

@app.route('/image/<filename>')
def get_image(filename):
    # ... (no change needed here) ...
    """Get a generated image by filename"""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        logger.warning(f"🔍 Image not found: {filename}")
        return jsonify({'error': 'Image not found'}), 404
    
    logger.info(f"📤 Serving image: {filename}")
    return send_file(filepath, mimetype='image/png')

@app.route('/health')
def health():
    """Health check endpoint: Reports model status without loading it."""
    logger.info("💓 Health check requested")
    return jsonify({
        'status': 'ready',
        'model_status': 'loaded' if MODEL_LOADED else 'lazy_waiting', # NEW STATUS
        'model': MODEL_DIR,
        'output_dir': OUTPUT_DIR,
        'cuda_available': torch.cuda.is_available(),
        'gpu_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9090, debug=False)