// app/api/plex/metadata/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"
import { cache, CACHE_TTL } from "@/lib/redis-cache"

export async function POST(request: NextRequest) {
  try {
    const { plexUrl, plexToken, ratingKey } = await request.json()

    console.log("[Metadata API] Request:", { ratingKey, plexUrl: plexUrl?.substring(0, 50) })

    if (!plexToken) {
      return NextResponse.json({ error: "Plex token required" }, { status: 400 })
    }

    if (!ratingKey) {
      return NextResponse.json({ error: "Rating key is required" }, { status: 400 })
    }

    if (!plexUrl) {
      return NextResponse.json({ error: "Plex URL is required" }, { status: 400 })
    }

    // Try cache first
    const cacheKey = `metadata:${ratingKey}`
    const cachedMetadata = await cache.get<any>(cacheKey)

    if (cachedMetadata) {
      console.log(`[Metadata API] Returning cached metadata for rating key ${ratingKey}`)
      return NextResponse.json({ metadata: cachedMetadata })
    }

    // Fetch from Plex using the client
    const plexClient = new PlexClient(plexToken)
    console.log(`[Metadata API] Fetching metadata for rating key ${ratingKey}...`)

    const metadata = await plexClient.getItemMetadata(plexUrl, ratingKey)

    const posters = await plexClient.getItemPosters(plexUrl, ratingKey)

    const enrichedMetadata = {
      ...metadata,
      posters,
    }

    console.log(`[Metadata API] Successfully fetched metadata for: ${metadata.title}`)

    // Cache the metadata
    await cache.set(cacheKey, enrichedMetadata, { ttl: CACHE_TTL.METADATA })

    return NextResponse.json({ metadata: enrichedMetadata })
  } catch (error: any) {
    console.error("[Metadata API] Error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch metadata" }, { status: 500 })
  }
}
