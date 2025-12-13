import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"
import { cache, CACHE_TTL } from "@/lib/redis-cache"

export async function POST(request: NextRequest) {
  try {
    const { plexUrl, plexToken, libraryKey, serverId, alternateUrls, offset = 0, limit = 100 } = await request.json()

    if (!plexToken) {
      return NextResponse.json({ error: "Plex token required" }, { status: 400 })
    }

    if (!libraryKey) {
      return NextResponse.json({ error: "Library key is required" }, { status: 400 })
    }

    const cacheKey = `items:${serverId || "default"}:${libraryKey}:${offset}:${limit}`

    const cachedItems = await cache.get<{ items: any[]; connectedUrl: string; totalSize: number }>(cacheKey)

    if (cachedItems?.items && Array.isArray(cachedItems.items) && cachedItems.items.length > 0) {
      console.log(
        `[v0] Returning cached items for library ${libraryKey} (${cachedItems.items.length} items, offset: ${offset})`,
      )
      return NextResponse.json(cachedItems)
    }

    const plexClient = new PlexClient(plexToken)
    const urlsToTry = [plexUrl, ...(alternateUrls || [])].filter(Boolean)

    console.log(`[v0] Fetching items for library ${libraryKey} (offset: ${offset}, limit: ${limit})...`)
    const startTime = Date.now()
    const workingUrl = await plexClient.findWorkingConnection(urlsToTry)

    if (!workingUrl) {
      return NextResponse.json({ error: "Could not connect to any Plex server URL" }, { status: 500 })
    }

    const result = await plexClient.getLibraryItems(workingUrl, libraryKey, { offset, limit })
    console.log(`[v0] Fetched ${result.items.length} of ${result.totalSize} items in ${Date.now() - startTime}ms`)

    const formattedItems = result.items.map((item: any) => ({
      key: item.key,
      title: item.title,
      type: item.type,
      thumb: item.thumb,
      art: item.art,
      year: item.year,
      ratingKey: item.ratingKey,
    }))

    const response = { items: formattedItems, connectedUrl: workingUrl, totalSize: result.totalSize }

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.ITEMS })

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[v0] Items error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch items" }, { status: 500 })
  }
}
