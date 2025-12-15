// app/api/posters/generate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { cache } from "@/lib/redis-cache"
import { createPosterJob } from "@/lib/posters/queue"
import { startWorker } from "@/lib/posters/worker"

export const dynamic = "force-dynamic"

interface PlexItem {
  ratingKey: string
  title?: string
  year?: number
  type?: string
  [key: string]: any
}

interface RedisLibraryData {
  items: PlexItem[]
  connectedUrl: string
  totalSize: number
}

export async function POST(request: NextRequest) {
  console.log("[API] /api/posters/generate - POST request received")
  
  try {
    const body = await request.json()
    console.log("[API] Request body:", body)
    
    const { libraryKey, provider, model, style, serverId = "default" } = body

    if (!libraryKey || !provider) {
      console.error("[API] Missing required parameters:", { libraryKey, provider })
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // Use defaults for model and style if not provided
    const finalModel = model || "sdxl-turbo"
    const finalStyle = style || "cinematic"

    // 1. Fetch items from Redis
    const redisKey = `items:${serverId}:${libraryKey}:0:100`
    console.log(`[API] Looking for Redis key: ${redisKey}`)
    
    let rawData = await cache.get(redisKey)
    
    // Fallback keys
    if (!rawData) {
      const fallbackKey = `items:${serverId}:${libraryKey}`
      console.log(`[API] Trying fallback key: ${fallbackKey}`)
      rawData = await cache.get(fallbackKey)
    }
    
    if (!rawData) {
      const simpleKey = `items:${libraryKey}`
      console.log(`[API] Trying simple key: ${simpleKey}`)
      rawData = await cache.get(simpleKey)
    }
    
    if (!rawData) {
      console.error(`[API] No items found in Redis for library ${libraryKey}`)
      return NextResponse.json(
        { error: `No items found in Redis for library ${libraryKey}. Please load the library first.` },
        { status: 404 }
      )
    }

    // Parse the data
    let libraryData: RedisLibraryData
    
    if (typeof rawData === 'string') {
      console.log('[API] Parsing data from JSON string')
      libraryData = JSON.parse(rawData)
    } else {
      console.log('[API] Data already parsed as object')
      libraryData = rawData as RedisLibraryData
    }

    // Extract items array
    const items = libraryData.items
    
    if (!Array.isArray(items)) {
      console.error('[API] Items is not an array:', typeof items)
      return NextResponse.json(
        { error: 'Invalid data format: items is not an array' },
        { status: 500 }
      )
    }

    console.log(`[API] Found ${items.length} items in library (totalSize: ${libraryData.totalSize})`)

    if (!items.length) {
      return NextResponse.json(
        { error: `Library ${libraryKey} is empty` },
        { status: 404 }
      )
    }

    // Validate items have required fields
    const validItems = items.filter(item => item && item.ratingKey)
    
    if (validItems.length === 0) {
      console.error('[API] No valid items with ratingKey found')
      return NextResponse.json(
        { error: 'No valid items found in library data' },
        { status: 500 }
      )
    }

    if (validItems.length < items.length) {
      console.warn(`[API] ${items.length - validItems.length} items missing ratingKey`)
    }

    console.log(`[API] Creating job for ${validItems.length} valid items`)

    // 2. Create job and enqueue all items
    const job = await createPosterJob(
      libraryKey,
      validItems.map(item => ({
        ratingKey: item.ratingKey,
        title: item.title,
        year: item.year?.toString(),
        type: item.type,
      })),
      finalModel,
      finalStyle
    )

    console.log(`[API] Created job ${job.jobId} with ${validItems.length} items`)

    // 3. Start worker (fire-and-forget)
    startWorker(job.jobId).catch(err =>
      console.error(`[Worker] Failed to start worker for job ${job.jobId}:`, err)
    )

    // 4. Return job info
    return NextResponse.json({
      jobId: job.jobId,
      total: validItems.length,
      message: `Started generation for ${validItems.length} items`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[API] Poster generation failed:", message, error)
    return NextResponse.json(
      { error: "Poster generation failed", message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: "ok",
    message: "Poster generation endpoint is available",
    methods: ["POST"]
  })
}