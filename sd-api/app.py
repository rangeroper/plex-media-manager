from fastapi import FastAPI, Form
from diffusers import StableDiffusionPipeline
import torch
from PIL import Image
import io
import base64
import os
import uuid

app = FastAPI()

# Ensure output folder exists
OUTPUT_DIR = "/app/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load SD 3.5
model_id = "stabilityai/stable-diffusion-3.5"
pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16)
pipe = pipe.to("cuda")  # Use GPU

@app.get("/")
def root():
    return {"status": "ok", "model": model_id}

@app.post("/generate")
async def generate(prompt: str = Form(...)):
    # Generate image
    with torch.autocast("cuda"):
        image = pipe(prompt, guidance_scale=7.5).images[0]
    
    # Save image to outputs folder
    filename = f"{uuid.uuid4()}.png"
    file_path = os.path.join(OUTPUT_DIR, filename)
    image.save(file_path)

    # Return base64 and path
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    img_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    return {"image": img_str, "file": f"/outputs/{filename}"}
