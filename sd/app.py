from flask import Flask, request, jsonify, send_file, Response
from diffusers import StableDiffusionXLPipeline, StableDiffusion3Pipeline, DiffusionPipeline
import torch
import os
from pathlib import Path
from datetime import datetime
import logging
import time
import gc
import json
from huggingface_hub import snapshot_download

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

AVAILABLE_MODELS = {
    "sd-3.5-large": {
        "id": "stabilityai/stable-diffusion-3.5-large",
        "class": "StableDiffusion3Pipeline",
        "requires_auth": True,
        "default_steps": 28,
        "default_guidance": 4.5,
        "needs_optimization": True
    },
    "sd-3.5-medium": {
        "id": "stabilityai/stable-diffusion-3.5-medium",
        "class": "StableDiffusion3Pipeline",
        "requires_auth": True,
        "default_steps": 28,
        "default_guidance": 4.5,
        "needs_optimization": True
    },
    "sdxl-turbo": {
        "id": "stabilityai/sdxl-turbo",
        "class": "StableDiffusionXLPipeline",
        "requires_auth": False,
        "default_steps": 4,
        "default_guidance": 1.0
    },
    "sd-1.5": {
        "id": "runwayml/stable-diffusion-v1-5",
        "class": "DiffusionPipeline",
        "requires_auth": False,
        "default_steps": 50,
        "default_guidance": 7.5
    }
}

STYLE_PRESETS = {
    "cinematic": "cinematic style, dramatic composition, high contrast lighting, cinematic atmosphere, stylized illustrated realism",
    "cartoon": "cartoon style, bold outlines, vibrant colors, stylized character design, animated look",
    "anime": "anime style, manga art, cel shaded, vibrant colors, detailed line art, Japanese animation aesthetic",
    "photorealistic": "photorealistic, hyper detailed, 8k resolution, realistic lighting, professional photography",
    "artistic": "artistic style, painterly, expressive brushstrokes, fine art aesthetic, gallery quality",
    "film-noir": "film noir style, black and white, dramatic shadows, high contrast, classic cinema aesthetic",
    "vibrant": "vibrant colors, saturated, bold palette, eye-catching, colorful composition"
}

current_pipeline = None
current_model_key = None
MODEL_LOADED = False 
MODELS_BASE_DIR = "/app/models"
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/app/data/sd-output")
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
Path(MODELS_BASE_DIR).mkdir(parents=True, exist_ok=True)


def get_model_dir(model_key: str) -> str:
    """Get the directory path for a specific model"""
    return os.path.join(MODELS_BASE_DIR, model_key)


def is_model_downloaded(model_key: str) -> bool:
    """Check if a model has been downloaded"""
    model_dir = get_model_dir(model_key)
    if not os.path.exists(model_dir):
        return False
    # Check if directory has files
    return len(list(Path(model_dir).iterdir())) > 0


def _load_model_into_memory(model_key: str):
    """
    Load a specific model into GPU memory.
    Unloads any existing model first.
    """
    global current_pipeline, current_model_key, MODEL_LOADED
    
    # If the requested model is already loaded, skip
    if MODEL_LOADED and current_model_key == model_key:
        logger.info(f"✓ Model '{model_key}' is already loaded in GPU memory")
        return current_pipeline
    
    # Unload existing model if any
    if MODEL_LOADED and current_model_key:
        logger.info(f"🧹 Unloading current model '{current_model_key}' to load '{model_key}'...")
        _unload_model_from_memory()
    
    # Check if model is downloaded
    if not is_model_downloaded(model_key):
        raise RuntimeError(f"Model '{model_key}' is not downloaded. Please download it first via /models/download")
    
    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        raise RuntimeError(f"Unknown model: {model_key}")
    
    model_dir = get_model_dir(model_key)
    
    logger.info("=" * 80)
    logger.info(f"⏳ Loading model '{model_key}' into GPU memory...")
    logger.info(f"📂 Model directory: {model_dir}")
    logger.info(f"🎯 Pipeline class: {model_config['class']}")
    start_time = time.time()
    
    try:
        # Determine if this is a large model requiring CPU offloading
        is_large_model = model_key in ['sd-3.5-large', 'sd-3.5-medium']
        
        if is_large_model:
            logger.info(f"🧠 Large model detected - enabling aggressive memory optimizations for 16GB VRAM")
        
        load_kwargs = {
            "torch_dtype": torch.float16
        }
        
        # Try fp16 variant first for compatible models
        try:
            if model_config['class'] == 'StableDiffusion3Pipeline':
                current_pipeline = StableDiffusion3Pipeline.from_pretrained(
                    model_dir,
                    variant="fp16",
                    **load_kwargs
                )
            elif model_config['class'] == 'StableDiffusionXLPipeline':
                current_pipeline = StableDiffusionXLPipeline.from_pretrained(
                    model_dir,
                    variant="fp16",
                    **load_kwargs
                )
            else:  # DiffusionPipeline
                current_pipeline = DiffusionPipeline.from_pretrained(
                    model_dir,
                    **load_kwargs
                )
            logger.info("✓ Loaded fp16 variant")
        except (OSError, ValueError) as e:
            # fp16 variant not available, load full precision
            logger.info(f"⚠️ fp16 variant not available, loading full precision model")
            if model_config['class'] == 'StableDiffusion3Pipeline':
                current_pipeline = StableDiffusion3Pipeline.from_pretrained(
                    model_dir,
                    **load_kwargs
                )
            elif model_config['class'] == 'StableDiffusionXLPipeline':
                current_pipeline = StableDiffusionXLPipeline.from_pretrained(
                    model_dir,
                    **load_kwargs
                )
            else:  # DiffusionPipeline
                current_pipeline = DiffusionPipeline.from_pretrained(
                    model_dir,
                    **load_kwargs
                )
        
        if model_config.get('needs_optimization', False):
            logger.info(f"⚙️ Applying memory optimizations for {model_key}...")
            
            # For SD3 models, use model_cpu_offload instead of sequential to avoid timestep bugs
            if 'sd-3' in model_key.lower():
                logger.info("⚙️ Using model CPU offload for SD3 (more stable)")
                current_pipeline.enable_model_cpu_offload()
            else:
                logger.info("⚙️ Using sequential CPU offload for maximum memory savings")
                current_pipeline.enable_sequential_cpu_offload()
            
            # Enable attention slicing to reduce memory usage
            logger.info("  - Enabling attention slicing")
            current_pipeline.enable_attention_slicing(slice_size="auto")
            
            if hasattr(current_pipeline, 'enable_vae_slicing'):
                logger.info("  - Enabling VAE slicing")
                current_pipeline.enable_vae_slicing()
            else:
                logger.info("  - VAE slicing not available for this pipeline (SD3)")
            
            # Enable memory efficient attention if available (xformers or PyTorch 2.0)
            try:
                current_pipeline.enable_xformers_memory_efficient_attention()
                logger.info("  - Enabled xformers memory efficient attention")
            except Exception:
                # xformers not available, use PyTorch 2.0 scaled dot product attention
                try:
                    current_pipeline.unet.set_attn_processor(None)  # Use default PyTorch 2.0 SDPA
                    logger.info("  - Using PyTorch 2.0 scaled dot product attention")
                except Exception:
                    logger.info("  - Memory efficient attention not available")
        else:
            # For smaller models, just move to GPU
            current_pipeline = current_pipeline.to("cuda")
        
        # Update globals
        MODEL_LOADED = True
        current_model_key = model_key
        
        load_time = time.time() - start_time
        logger.info(f"✅ Model '{model_key}' loaded successfully in {load_time:.2f} seconds")
        logger.info(f"🎮 GPU: {torch.cuda.get_device_name(0)}")
        
        # Log GPU memory usage
        if torch.cuda.is_available():
            memory_allocated = torch.cuda.memory_allocated(0) / 1024**3
            memory_reserved = torch.cuda.memory_reserved(0) / 1024**3
            memory_free = (torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated(0)) / 1024**3
            logger.info(f"💾 GPU Memory: {memory_allocated:.2f} GB allocated, {memory_reserved:.2f} GB reserved, {memory_free:.2f} GB free")
        
        logger.info("=" * 80)
        
        return current_pipeline

    except Exception as e:
        logger.error(f"❌ Failed to load model '{model_key}': {e}")
        raise RuntimeError(f"Model initialization failed for '{model_key}'") from e


def _unload_model_from_memory():
    """Unload the current model from GPU memory"""
    global current_pipeline, current_model_key, MODEL_LOADED
    
    if not MODEL_LOADED:
        logger.info("ℹ️ No model currently loaded in memory")
        return
    
    logger.info("=" * 80)
    logger.info(f"🧹 Unloading model '{current_model_key}' from GPU memory...")
    
    try:
        # Delete the pipeline
        if current_pipeline is not None:
            del current_pipeline
            current_pipeline = None
        
        # Clear CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        
        # Force garbage collection
        gc.collect()
        
        MODEL_LOADED = False
        old_model = current_model_key
        current_model_key = None
        
        # Log memory after unload
        if torch.cuda.is_available():
            memory_allocated = torch.cuda.memory_allocated(0) / 1024**3
            memory_reserved = torch.cuda.memory_reserved(0) / 1024**3
            logger.info(f"💾 GPU Memory after unload: {memory_allocated:.2f} GB allocated, {memory_reserved:.2f} GB reserved")
        
        logger.info(f"✅ Model '{old_model}' unloaded successfully and GPU memory cleared")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"❌ Error unloading model: {e}")
        raise


# Log that the server is ready
logger.info("=" * 80)
logger.info("🚀 SD-API server starting (NO models pre-loaded)")
logger.info(f"📂 Models base directory: {MODELS_BASE_DIR}")
logger.info(f"📂 Output directory: {OUTPUT_DIR}")
logger.info(f"🎮 CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    logger.info(f"🎮 GPU: {torch.cuda.get_device_name(0)}")
logger.info(f"📋 Available models: {', '.join(AVAILABLE_MODELS.keys())}")
logger.info("🚀 API server ready on port 9090")
logger.info("=" * 80)


@app.route('/generate', methods=['POST'])
def generate():
    """Generate an image from a text prompt with specified model and style"""
    request_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    
    try:
        data = request.json
        
        model_key = data.get('model', 'sdxl-turbo')
        style_key = data.get('style', 'cinematic')
        prompt = data.get('prompt')
        
        if not prompt:
            logger.warning(f"[{request_id}] ❌ Request missing prompt")
            return jsonify({'error': 'prompt is required'}), 400
        
        # Validate model
        if model_key not in AVAILABLE_MODELS:
            return jsonify({'error': f'Invalid model: {model_key}'}), 400
        
        style_modifier = STYLE_PRESETS.get(style_key, STYLE_PRESETS['cinematic'])
        enhanced_prompt = f"{prompt}, {style_modifier}"
        
        # Load the requested model
        local_pipe = _load_model_into_memory(model_key)
        
        # Get model defaults
        model_config = AVAILABLE_MODELS[model_key]
        
        # Process request parameters
        negative_prompt = data.get('negative_prompt', 'blurry, low quality, distorted, text, watermark')
        width = data.get('width', 1024)
        height = data.get('height', 1536)
        steps = data.get('num_inference_steps', model_config['default_steps'])
        guidance = data.get('guidance_scale', model_config['default_guidance'])
        seed = data.get('seed')

        logger.info("=" * 80)
        logger.info(f"[{request_id}] 📥 NEW GENERATION REQUEST")
        logger.info(f"[{request_id}] 🎨 Model: {model_key}")
        logger.info(f"[{request_id}] 🎭 Style: {style_key}")
        logger.info(f"[{request_id}] 📝 Enhanced Prompt: {enhanced_prompt}")
        logger.info(f"[{request_id}] ⚙️ Parameters: {width}x{height}, {steps} steps, guidance {guidance}")
        
        # Set seed if provided
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda").manual_seed(seed)
            logger.info(f"[{request_id}] 🎲 Seed: {seed}")

        logger.info(f"[{request_id}] 🎨 Starting image generation...")
        gen_start = time.time()
        
        # Generate image
        image = local_pipe(
            prompt=enhanced_prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance,
            generator=generator
        ).images[0]

        gen_time = time.time() - gen_start
        logger.info(f"[{request_id}] ✅ Generation completed in {gen_time:.2f}s")

        # Save image
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
            'model_used': model_key,
            'style_used': style_key,
            'relative_path': f'/data/sd-output/{filename}'
        })
    
    except Exception as e:
        logger.error("=" * 80)
        logger.error(f"[{request_id}] ❌ ERROR during generation")
        logger.error(f"[{request_id}] {type(e).__name__}: {str(e)}")
        logger.error("=" * 80)
        return jsonify({'error': str(e)}), 500


@app.route('/unload', methods=['POST'])
def unload():
    """Unload the current model from GPU memory"""
    try:
        _unload_model_from_memory()
        return jsonify({'success': True, 'message': 'Model unloaded successfully'})
    except Exception as e:
        logger.error(f"Error in /unload: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/models', methods=['GET'])
def list_models():
    """List all available models with download status"""
    models_info = []
    
    for model_key, config in AVAILABLE_MODELS.items():
        is_downloaded = is_model_downloaded(model_key)
        is_loaded = MODEL_LOADED and current_model_key == model_key
        
        models_info.append({
            'key': model_key,
            'id': config['id'],
            'downloaded': is_downloaded,
            'loaded_in_memory': is_loaded,
            'requires_auth': config['requires_auth'],
            'pipeline_class': config['class']
        })
    
    return jsonify({'models': models_info})


@app.route('/models/download', methods=['POST'])
def download_model():
    """Download a model to local storage with progress streaming"""
    try:
        data = request.json
        model_key = data.get('model')
        
        if not model_key or model_key not in AVAILABLE_MODELS:
            return jsonify({'error': 'Invalid or missing model key'}), 400
        
        if is_model_downloaded(model_key):
            return jsonify({
                'success': True,
                'message': f'Model {model_key} is already downloaded',
                'already_downloaded': True
            })
        
        model_config = AVAILABLE_MODELS[model_key]
        model_dir = get_model_dir(model_key)
        
        logger.info("=" * 80)
        logger.info(f"📥 Starting download for model: {model_key}")
        logger.info(f"🔗 Model ID: {model_config['id']}")
        logger.info(f"📂 Target directory: {model_dir}")
        logger.info("=" * 80)
        
        def generate_progress():
            """Generator function for SSE progress updates"""
            try:
                start_time = time.time()
                
                # Send initial progress
                yield f"data: {json.dumps({'status': 'starting', 'progress': 0, 'message': f'Initializing download for {model_key}...'})}\n\n"
                
                # Get HuggingFace token if required
                hf_token = os.environ.get("HUGGINGFACE_TOKEN") if model_config['requires_auth'] else None
                
                yield f"data: {json.dumps({'status': 'downloading', 'progress': 10, 'message': 'Downloading model files from HuggingFace...'})}\n\n"
                
                def progress_callback(progress_info):
                    # This is called periodically during download
                    pass  # Progress info from HF is complex, we'll simulate progress
                
                # Download model files using snapshot_download
                logger.info(f"⏳ Downloading model files...")
                snapshot_download(
                    repo_id=model_config['id'],
                    local_dir=model_dir,
                    token=hf_token,
                    local_dir_use_symlinks=False
                )
                
                yield f"data: {json.dumps({'status': 'downloading', 'progress': 70, 'message': 'Model files downloaded, initializing pipeline...'})}\n\n"
                
                # Verify the download by loading the pipeline
                logger.info(f"✓ Verifying downloaded model...")
                if model_config['class'] == 'StableDiffusion3Pipeline':
                    pipeline = StableDiffusion3Pipeline.from_pretrained(model_dir, torch_dtype=torch.float16)
                elif model_config['class'] == 'StableDiffusionXLPipeline':
                    pipeline = StableDiffusionXLPipeline.from_pretrained(model_dir, torch_dtype=torch.float16)
                else:
                    pipeline = DiffusionPipeline.from_pretrained(model_dir, torch_dtype=torch.float16)
                
                yield f"data: {json.dumps({'status': 'saving', 'progress': 90, 'message': 'Finalizing model installation...'})}\n\n"
                
                # Clean up pipeline from memory (don't keep it loaded)
                del pipeline
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                download_time = time.time() - start_time
                
                logger.info("=" * 80)
                logger.info(f"✅ Model {model_key} downloaded successfully in {download_time:.2f}s")
                logger.info(f"📂 Saved to: {model_dir}")
                logger.info("=" * 80)
                
                # Send completion
                yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'message': f'Model {model_key} downloaded successfully', 'download_time': round(download_time, 2)})}\n\n"
                
            except Exception as e:
                logger.error(f"❌ Error during download: {e}")
                yield f"data: {json.dumps({'status': 'error', 'progress': 0, 'message': str(e)})}\n\n"
        
        return Response(generate_progress(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"❌ Error downloading model: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/models/delete', methods=['POST'])
def delete_model():
    """Delete a downloaded model"""
    try:
        data = request.json
        model_key = data.get('model')
        
        if not model_key or model_key not in AVAILABLE_MODELS:
            return jsonify({'error': 'Invalid or missing model key'}), 400
        
        # Don't allow deleting currently loaded model
        if MODEL_LOADED and current_model_key == model_key:
            return jsonify({'error': 'Cannot delete currently loaded model. Unload it first.'}), 400
        
        model_dir = get_model_dir(model_key)
        
        if not os.path.exists(model_dir):
            return jsonify({'success': True, 'message': 'Model was not downloaded'})
        
        logger.info(f"🗑️ Deleting model: {model_key} from {model_dir}")
        
        import shutil
        shutil.rmtree(model_dir)
        
        logger.info(f"✅ Model {model_key} deleted successfully")
        
        return jsonify({'success': True, 'message': f'Model {model_key} deleted successfully'})
        
    except Exception as e:
        logger.error(f"❌ Error deleting model: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/image/<filename>')
def get_image(filename):
    """Get a generated image by filename"""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        logger.warning(f"🔍 Image not found: {filename}")
        return jsonify({'error': 'Image not found'}), 404
    
    logger.info(f"📤 Serving image: {filename}")
    return send_file(filepath, mimetype='image/png')


@app.route('/health')
def health():
    """Health check endpoint with detailed model status"""
    logger.info("💓 Health check requested")
    
    gpu_info = None
    if torch.cuda.is_available():
        memory_allocated = torch.cuda.memory_allocated(0) / 1024**3
        memory_reserved = torch.cuda.memory_reserved(0) / 1024**3
        memory_free = (torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated(0)) / 1024**3
        gpu_info = {
            'name': torch.cuda.get_device_name(0),
            'memory_allocated_gb': round(memory_allocated, 2),
            'memory_reserved_gb': round(memory_reserved, 2),
            'memory_free_gb': round(memory_free, 2)
        }
    
    return jsonify({
        'status': 'ready',
        'model_loaded': MODEL_LOADED,
        'current_model': current_model_key,
        'available_models': list(AVAILABLE_MODELS.keys()),
        'cuda_available': torch.cuda.is_available(),
        'gpu': gpu_info
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9090, debug=False)
