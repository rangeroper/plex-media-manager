import path from "path"
import fs from "fs"
import fetch from "node-fetch" // or built-in fetch in Node 20+
import { Buffer } from "buffer"

interface GeneratePosterOptions {
  model: string
  style: string
  libraryKey: string
  plexRatingKey: string
}

interface SDResponse {
  images: string[] // array of base64 strings
  info?: any
}

export async function generatePoster(options: GeneratePosterOptions): Promise<Buffer> {
  const { model, style, libraryKey, plexRatingKey } = options

  const prompt = `Movie poster in ${style} style`

  // Create temp folder for poster
  const tmpDir = path.join(process.cwd(), "data", "posters", libraryKey, plexRatingKey, "tmp")
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

  const outputFile = path.join(tmpDir, "poster.png")

  try {
    // Call SD WebUI API
    const res = await fetch(`${process.env.SD_API_URL}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width: 1024,
        height: 1536,
        steps: 20,
        cfg_scale: 7,
        sampler_name: "Euler a",
      }),
    })

    if (!res.ok) throw new Error(`SD API returned ${res.status}`)

    const rawData: unknown = await res.json()

    // Type guard to ensure it matches SDResponse
    if (
      typeof rawData !== "object" ||
      rawData === null ||
      !("images" in rawData) ||
      !Array.isArray((rawData as any).images)
    ) {
      throw new Error("Invalid response from SD API")
    }

    const data: SDResponse = rawData as SDResponse

    if (!data.images || data.images.length === 0) {
      throw new Error("No image returned from SD API")
    }

    const imageBase64 = data.images[0]
    const buffer = Buffer.from(imageBase64, "base64")

    fs.writeFileSync(outputFile, buffer)

    return buffer
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[StableDiffusion] Generation failed:", message)
    throw error
  }
}
