// lib/posters/stable-diffusion.ts
import fetch from "node-fetch"
import { Buffer } from "buffer"

interface GeneratePosterOptions {
  model: string
  style: string
  libraryKey: string
  plexRatingKey: string
  title?: string
  year?: string
  type?: string
}

interface SDAPIResponse {
  filename: string
  path: string
  generation_time: number
  relative_path: string
}

// MAX_RETRIES and RETRY_DELAY removed here.
const GENERATION_TIMEOUT = 120000 // 2 minutes
const DOWNLOAD_TIMEOUT = 30000 // 30 seconds
const HEALTH_CHECK_TIMEOUT = 10000 // 10 seconds
const SD_API_URL = process.env.SD_API_URL || "http://sd-api:9090" // Define API URL once

/**
 * Build a detailed prompt for movie/show poster generation
 */
function buildPrompt(options: GeneratePosterOptions): string {
  const { title, year, type, style } = options
  
  const mediaType = type === 'show' ? 'TV series' : 'film'
  const titleStr = title ? `${title}${year ? ` (${year})` : ''}` : 'media'
  
  return `alternative ${mediaType} poster artwork for ${titleStr}, ${style} style, dramatic composition, high contrast lighting, cinematic atmosphere, stylized illustrated realism, community fan-made poster art, no text, no logos, no watermarks, professional poster design, ultra detailed`
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  }
}

/**
 * Generate a poster using the SD API (Single Attempt)
 */
export async function generatePoster(options: GeneratePosterOptions): Promise<Buffer> {
  const { model, style, libraryKey, plexRatingKey } = options

  const prompt = buildPrompt(options)
  const negativePrompt = "blurry, low quality, distorted, text, watermark, signature, logos, words, letters, ugly, deformed"

  console.log(`[StableDiffusion] Generating poster for ${options.title || plexRatingKey}`)
  console.log(`[StableDiffusion] Prompt: ${prompt}`)

  try {
    // Generate the image
    const res = await fetchWithTimeout(
      `${SD_API_URL}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1536, // Movie poster aspect ratio
          num_inference_steps: 14,
          guidance_scale: 3.5,
          seed: null, // Random seed each time
        }),
      },
      GENERATION_TIMEOUT
    )

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[StableDiffusion] SD API error: ${res.status}`, errorText)
      throw new Error(`SD API returned ${res.status}: ${errorText}`)
    }

    const data = await res.json() as SDAPIResponse

    if (!data.filename) {
      throw new Error("No filename returned from SD API")
    }

    console.log(`[StableDiffusion] Image generated: ${data.filename} (${data.generation_time}s)`)

    // Fetch the generated image
    const imageRes = await fetchWithTimeout(
      `${SD_API_URL}/image/${data.filename}`,
      { method: "GET" },
      DOWNLOAD_TIMEOUT
    )
    
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch generated image: ${imageRes.status}`)
    }

    const buffer = await imageRes.buffer()
    
    if (!buffer || buffer.length === 0) {
      throw new Error("Empty image buffer received")
    }

    console.log(`[StableDiffusion] Downloaded ${buffer.length} byte image`)

    return buffer

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stable Diffusion error"
    console.error("[StableDiffusion] Generation failed:", message)
    // Re-throw for the caller (worker/queue) to handle
    throw new Error(`Stable Diffusion generation failed: ${message}`)
  }
}

/**
 * NEW: Instruct the SD API service to load the model into memory.
 * This is primarily a signal; the actual resource-intensive load happens
 * on the first /generate call inside the Python app.
 */
export async function loadSDModel(): Promise<boolean> {
  console.log("[StableDiffusion] Signalling worker startup to SD API.")
  try {
    // We call /health to ensure the API container is awake, but rely on
    // the lazy-load inside the /generate endpoint for the GPU resource allocation.
    const res = await fetchWithTimeout(
      `${SD_API_URL}/health`,
      { method: "GET" },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      console.error(`[StableDiffusion] LOAD check failed: ${res.status}`)
      return false
    }
    
    // The health check response will confirm the API is ready to receive requests.
    const data = await res.json() as any
    console.log(`[StableDiffusion] Health check OK. Model status: ${data.model_status}.`)
    return data.status === 'ready'
  } catch (error) {
    console.error("[StableDiffusion] Model LOAD signal error:", error)
    return false
  }
}

/**
 * NEW: Instruct the SD API service to unload the model from memory.
 */
export async function unloadSDModel(): Promise<boolean> {
  console.log("[StableDiffusion] Sending request to UNLOAD model...")
  try {
    // This requires the new /unload endpoint in the Python app.
    const res = await fetchWithTimeout(
      `${SD_API_URL}/unload`,
      { method: "POST" }, // Use POST/PUT/DELETE for state change
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      console.error(`[StableDiffusion] UNLOAD request failed: ${res.status}`)
      return false
    }

    console.log("[StableDiffusion] Model UNLOAD request sent successfully.")
    return true
  } catch (error) {
    console.error("[StableDiffusion] Model UNLOAD error:", error)
    return false
  }
}

/**
 * Check if SD API is healthy and ready
 */
export async function checkSDHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${SD_API_URL}/health`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      console.error(`[StableDiffusion] Health check failed: ${res.status}`)
      return false
    }

    const data = await res.json() as any
    console.log(`[StableDiffusion] Health check OK - Model Status: ${data.model_status}`)
    return data.status === 'ready'
  } catch (error) {
    console.error("[StableDiffusion] Health check error:", error)
    return false
  }
}

/**
 * Get SD API status information
 */
export async function getSDStatus(): Promise<{
  available: boolean
  gpu?: string
  model_status?: string // Added model_status to return value
  error?: string
}> {
  try {
    const res = await fetchWithTimeout(
      `${SD_API_URL}/health`,
      { method: "GET" },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      const errorText = await res.text()
      return { available: false, error: `SD API is not responding (${res.status}): ${errorText}` }
    }

    const data = await res.json() as any

    return {
      available: data.status === 'ready',
      gpu: data.gpu_name,
      model_status: data.model_status,
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}