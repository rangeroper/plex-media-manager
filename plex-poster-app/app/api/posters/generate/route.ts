// app/api/posters/generate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { cache } from "@/lib/redis-cache"
import { v4 as uuidv4 } from "uuid"
import { createPosterJob, runPosterJob } from "@/lib/posters/stable-diffusion/worker"

export const dynamic = "force-dynamic"

interface PlexItem {
  ratingKey: string
  title?: string
  type?: string
  [key: string]: any
}

export async function POST(request: NextRequest) {
  console.log("[API] /api/posters/generate - POST request received")
  
  try {
    const body = await request.json()
    console.log("[API] Request body:", body)
    
    const { libraryKey, provider, model, style, serverId = "default" } = body

    if (!libraryKey || !provider || !model || !style) {
      console.error("[API] Missing required parameters:", { libraryKey, provider, model, style })
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // 1. Try to fetch items from Redis using the correct key format
    // Format: items:serverId:libraryKey:offset:limit
    const redisKey = `items:${serverId}:${libraryKey}:0:100`
    console.log(`[API] Looking for Redis key: ${redisKey}`)
    
    let rawItems = (await cache.get(redisKey)) as string | null
    
    // Fallback: try without pagination
    if (!rawItems) {
      const fallbackKey = `items:${serverId}:${libraryKey}`
      console.log(`[API] Trying fallback key: ${fallbackKey}`)
      rawItems = (await cache.get(fallbackKey)) as string | null
    }
    
    // Fallback: try simple key
    if (!rawItems) {
      const simpleKey = `items:${libraryKey}`
      console.log(`[API] Trying simple key: ${simpleKey}`)
      rawItems = (await cache.get(simpleKey)) as string | null
    }
    
    if (!rawItems) {
      console.error(`[API] No items found in Redis for library ${libraryKey}`)
      console.error(`[API] Tried keys: ${redisKey}, items:${serverId}:${libraryKey}, items:${libraryKey}`)
      return NextResponse.json(
        { error: `No items found in Redis for library ${libraryKey}. Please load the library first.` },
        { status: 404 }
      )
    }

    const items: PlexItem[] = JSON.parse(rawItems)
    console.log(`[API] Found ${items.length} items in library`)

    if (!items.length) {
      return NextResponse.json(
        { error: `Library ${libraryKey} is empty` },
        { status: 404 }
      )
    }

    // 2. Create a master job ID for tracking this library's generation
    const masterJobId = uuidv4()
    console.log(`[API] Created master job: ${masterJobId}`)

    // 3. Create individual poster jobs for each item
    const individualJobs = []
    
    for (const item of items) {
      const job = await createPosterJob(
        libraryKey,
        item.ratingKey,
        model,
        style
      )

      individualJobs.push(job.jobId)
      console.log(`[API] Created job ${job.jobId} for item ${item.ratingKey} (${item.title || 'unknown'})`)

      // Fire-and-forget the job runner
      runPosterJob(job).catch(err =>
        console.error(`[Worker] Job ${job.jobId} failed:`, err)
      )
    }

    // 4. Create a master job tracker for the UI
    const masterJob = {
      jobId: masterJobId,
      libraryKey,
      status: "running",
      totalItems: items.length,
      processedItems: 0,
      createdAt: new Date().toISOString(),
      individualJobs,
    }

    await cache.set(`job:${masterJobId}`, JSON.stringify(masterJob))
    console.log(`[API] Saved master job to Redis`)

    // 5. Return the master jobId for UI polling
    return NextResponse.json({
      jobId: masterJobId,
      total: items.length,
      message: `Started generation for ${items.length} items`,
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

// Optional: Add GET to check if route exists
export async function GET() {
  return NextResponse.json({ 
    status: "ok",
    message: "Poster generation endpoint is available",
    methods: ["POST"]
  })
}