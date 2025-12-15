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

const GENERATION_TIMEOUT = 120000 // 2 minutes
const DOWNLOAD_TIMEOUT = 30000 // 30 seconds
const HEALTH_CHECK_TIMEOUT = 10000 // 10 seconds
const CONNECTION_RETRY_ATTEMPTS = 5 // Retry connection 5 times
const CONNECTION_RETRY_DELAY = 3000 // Wait 3 seconds between retries
const SD_API_URL = process.env.SD_API_URL || "http://sd-api:9090"

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
 * Retry a fetch operation with exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: any,
  timeoutMs: number,
  maxRetries: number = CONNECTION_RETRY_ATTEMPTS,
  retryDelay: number = CONNECTION_RETRY_DELAY
): Promise<any> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs)
    } catch (error: any) {
      lastError = error
      
      // Check if it's a connection error that we should retry
      const isConnectionError = 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('connect') ||
        error.message?.includes('ECONNREFUSED')

      if (!isConnectionError || attempt === maxRetries) {
        throw error
      }

      console.log(`[StableDiffusion] Connection attempt ${attempt}/${maxRetries} failed. Retrying in ${retryDelay}ms...`)
      await sleep(retryDelay)
      
      // Optional: Exponential backoff
      // retryDelay = Math.min(retryDelay * 1.5, 30000)
    }
  }

  throw lastError || new Error('Failed after retries')
}

/**
 * Generate a poster using the SD API (Single Attempt)
 */
export async function generatePoster(options: GeneratePosterOptions): Promise<Buffer> {
  const { model, style, libraryKey, plexRatingKey } = options

  const prompt = buildPrompt(options)
  const negativePrompt = "blurry, low quality, distorted, text, watermark, signature, logos, words, letters, ugly, deformed"

  console.log(`[StableDiffusion] ==================== GENERATION START ====================`)
  console.log(`[StableDiffusion] Item: ${options.title || plexRatingKey}`)
  console.log(`[StableDiffusion] Library: ${libraryKey}, Rating Key: ${plexRatingKey}`)
  console.log(`[StableDiffusion] Style: ${style}, Model: ${model}`)
  console.log(`[StableDiffusion] Prompt: ${prompt}`)
  console.log(`[StableDiffusion] API URL: ${SD_API_URL}`)

  try {
    // Check SD API health before attempting generation
    console.log(`[StableDiffusion] Checking SD API health before generation...`)
    const healthCheck = await checkSDHealth()
    if (!healthCheck) {
      console.error(`[StableDiffusion] ❌ SD API health check failed before generation`)
      throw new Error("SD API is not healthy - check SD API container logs")
    }
    console.log(`[StableDiffusion] ✓ SD API health check passed`)

    // Generate the image (with retry for connection issues)
    console.log(`[StableDiffusion] Sending generation request...`)
    const res = await fetchWithRetry(
      `${SD_API_URL}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1536,
          num_inference_steps: 14,
          guidance_scale: 3.5,
          seed: null,
        }),
      },
      GENERATION_TIMEOUT
    )

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[StableDiffusion] ❌ SD API HTTP Error`)
      console.error(`[StableDiffusion] Status Code: ${res.status}`)
      console.error(`[StableDiffusion] Status Text: ${res.statusText}`)
      console.error(`[StableDiffusion] Response Body: ${errorText}`)
      console.error(`[StableDiffusion] This usually means:`)
      if (res.status === 500) {
        console.error(`[StableDiffusion]   - Model failed to load (check GPU/VRAM)`)
        console.error(`[StableDiffusion]   - CUDA/GPU driver issues`)
        console.error(`[StableDiffusion]   - Out of memory`)
        console.error(`[StableDiffusion]   - Check sd-api container logs for details`)
      } else if (res.status === 503) {
        console.error(`[StableDiffusion]   - Service unavailable or starting up`)
      } else if (res.status === 404) {
        console.error(`[StableDiffusion]   - Endpoint not found - check SD API version`)
      }
      throw new Error(`SD API returned ${res.status}: ${errorText}`)
    }

    const data = await res.json() as SDAPIResponse

    if (!data.filename) {
      console.error(`[StableDiffusion] ❌ No filename in response`)
      console.error(`[StableDiffusion] Response data:`, JSON.stringify(data, null, 2))
      throw new Error("No filename returned from SD API")
    }

    console.log(`[StableDiffusion] ✓ Image generated: ${data.filename}`)
    console.log(`[StableDiffusion] Generation time: ${data.generation_time}s`)

    // Fetch the generated image
    console.log(`[StableDiffusion] Downloading generated image...`)
    const imageRes = await fetchWithTimeout(
      `${SD_API_URL}/image/${data.filename}`,
      { method: "GET" },
      DOWNLOAD_TIMEOUT
    )
    
    if (!imageRes.ok) {
      console.error(`[StableDiffusion] ❌ Failed to download image`)
      console.error(`[StableDiffusion] Status: ${imageRes.status}`)
      console.error(`[StableDiffusion] Image path: /image/${data.filename}`)
      throw new Error(`Failed to fetch generated image: ${imageRes.status}`)
    }

    const buffer = await imageRes.buffer()
    
    if (!buffer || buffer.length === 0) {
      console.error(`[StableDiffusion] ❌ Empty image buffer received`)
      throw new Error("Empty image buffer received")
    }

    console.log(`[StableDiffusion] ✓ Downloaded ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`)
    console.log(`[StableDiffusion] ==================== GENERATION SUCCESS ====================`)

    return buffer

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stable Diffusion error"
    const stack = error instanceof Error ? error.stack : undefined
    
    console.error(`[StableDiffusion] ==================== GENERATION FAILED ====================`)
    console.error(`[StableDiffusion] ❌ Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`)
    console.error(`[StableDiffusion] ❌ Error Message: ${message}`)
    if (stack) {
      console.error(`[StableDiffusion] Stack Trace:`)
      console.error(stack)
    }
    console.error(`[StableDiffusion] Item: ${options.title || plexRatingKey}`)
    console.error(`[StableDiffusion] ==================== TROUBLESHOOTING TIPS ====================`)
    console.error(`[StableDiffusion] 1. Check if SD API container is running: docker ps`)
    console.error(`[StableDiffusion] 2. Check SD API logs: docker logs plex-poster-sd-api`)
    console.error(`[StableDiffusion] 3. Verify GPU is accessible: nvidia-smi`)
    console.error(`[StableDiffusion] 4. Check SD API health: curl http://sd-api:9090/health`)
    console.error(`[StableDiffusion] 5. Verify HUGGINGFACE_TOKEN is set if required`)
    console.error(`[StableDiffusion] ==================================================================`)
    
    throw new Error(`Stable Diffusion generation failed: ${message}`)
  }
}

/**
 * Load the SD model - signals worker startup to SD API with retries
 */
export async function loadSDModel(): Promise<boolean> {
  console.log("[StableDiffusion] ==================== MODEL LOAD START ====================")
  console.log(`[StableDiffusion] Target API: ${SD_API_URL}`)
  console.log("[StableDiffusion] Signalling worker startup to SD API...")
  
  try {
    const res = await fetchWithRetry(
      `${SD_API_URL}/health`,
      { method: "GET" },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      console.error(`[StableDiffusion] ❌ Health check HTTP error: ${res.status}`)
      const errorText = await res.text().catch(() => 'Unable to read response')
      console.error(`[StableDiffusion] Response: ${errorText}`)
      return false
    }
    
    const data = await res.json() as any
    console.log(`[StableDiffusion] ✓ Health check OK`)
    console.log(`[StableDiffusion] Status: ${data.status}`)
    console.log(`[StableDiffusion] Model Status: ${data.model_status}`)
    console.log(`[StableDiffusion] GPU: ${data.gpu_name || 'Not detected'}`)
    console.log("[StableDiffusion] ==================== MODEL LOAD SUCCESS ====================")
    
    return data.status === 'ready'
  } catch (error) {
    console.error("[StableDiffusion] ==================== MODEL LOAD FAILED ====================")
    console.error(`[StableDiffusion] ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    console.error("[StableDiffusion] Troubleshooting:")
    console.error("[StableDiffusion]   - Verify sd-api container is running")
    console.error("[StableDiffusion]   - Check network connectivity between containers")
    console.error("[StableDiffusion]   - Review sd-api logs: docker logs plex-poster-sd-api")
    console.error("[StableDiffusion] ==================================================================")
    return false
  }
}

/**
 * Unload the SD model from memory
 */
export async function unloadSDModel(): Promise<boolean> {
  console.log("[StableDiffusion] Sending request to UNLOAD model...")
  try {
    const res = await fetchWithRetry(
      `${SD_API_URL}/unload`,
      { method: "POST" },
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
    console.log(`[StableDiffusion] Running health check against ${SD_API_URL}/health...`)
    
    const res = await fetchWithRetry(
      `${SD_API_URL}/health`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      console.error(`[StableDiffusion] ❌ Health check failed: HTTP ${res.status}`)
      const errorText = await res.text().catch(() => 'Unable to read response')
      console.error(`[StableDiffusion] Response: ${errorText}`)
      return false
    }

    const data = await res.json() as any
    console.log(`[StableDiffusion] ✓ Health check passed`)
    console.log(`[StableDiffusion]   Status: ${data.status}`)
    console.log(`[StableDiffusion]   Model Status: ${data.model_status}`)
    console.log(`[StableDiffusion]   GPU: ${data.gpu_name || 'Not detected'}`)
    
    return data.status === 'ready'
  } catch (error) {
    console.error(`[StableDiffusion] ❌ Health check error: ${error instanceof Error ? error.message : 'Unknown'}`)
    if (error instanceof Error && error.stack) {
      console.error(`[StableDiffusion] Stack: ${error.stack}`)
    }
    return false
  }
}

/**
 * Get SD API status information
 */
export async function getSDStatus(): Promise<{
  available: boolean
  gpu?: string
  model_status?: string
  error?: string
}> {
  console.log(`[StableDiffusion] Fetching SD API status from ${SD_API_URL}/health...`)
  
  try {
    const res = await fetchWithRetry(
      `${SD_API_URL}/health`,
      { method: "GET" },
      HEALTH_CHECK_TIMEOUT
    )

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[StableDiffusion] ❌ Status check failed: ${res.status}`)
      console.error(`[StableDiffusion] Response: ${errorText}`)
      return { 
        available: false, 
        error: `SD API is not responding (${res.status}): ${errorText}` 
      }
    }

    const data = await res.json() as any

    console.log(`[StableDiffusion] ✓ Status retrieved`)
    console.log(`[StableDiffusion]   Available: ${data.status === 'ready'}`)
    console.log(`[StableDiffusion]   GPU: ${data.gpu_name || 'Not detected'}`)
    console.log(`[StableDiffusion]   Model Status: ${data.model_status || 'Unknown'}`)

    return {
      available: data.status === 'ready',
      gpu: data.gpu_name,
      model_status: data.model_status,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error(`[StableDiffusion] ❌ Status check error: ${errorMsg}`)
    
    return {
      available: false,
      error: errorMsg,
    }
  }
}