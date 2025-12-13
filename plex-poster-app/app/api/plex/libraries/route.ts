import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"
import { PlexStorage } from "@/lib/plex/storage"
import { cache, CACHE_TTL } from "@/lib/redis-cache"

export async function POST(request: NextRequest) {
  try {
    const { plexUrl, plexToken, alternateUrls, serverId } = await request.json()

    if (!plexToken) {
      return NextResponse.json({ error: "Plex token required" }, { status: 400 })
    }

    const cacheKey = `libraries:${serverId || "default"}`

    const cachedLibraries = await cache.get<{ libraries: any[]; connectedUrl: string }>(cacheKey)
    if (cachedLibraries && cachedLibraries.libraries && Array.isArray(cachedLibraries.libraries)) {
      console.log(`[v0] Returning cached libraries (${cachedLibraries.libraries.length} items)`)
      return NextResponse.json(cachedLibraries)
    }

    const urlsToTry = [plexUrl, ...(alternateUrls || [])].filter(Boolean)

    console.log(`[v0] Fetching libraries with ${urlsToTry.length} URLs:`, urlsToTry)

    const plexClient = new PlexClient(plexToken)

    console.log(`[v0] Starting connection test...`)
    const startTime = Date.now()
    const workingUrl = await plexClient.findWorkingConnection(urlsToTry)
    console.log(`[v0] Connection test took ${Date.now() - startTime}ms`)

    if (!workingUrl) {
      return NextResponse.json({ error: "Could not connect to any Plex server URL" }, { status: 500 })
    }

    console.log(`[v0] Fetching libraries from ${workingUrl}`)
    const libraries = await plexClient.getLibraries(workingUrl)

    if (serverId) {
      const config = await PlexStorage.loadConfig()
      if (config.selectedServer) {
        await PlexStorage.updateConfig({
          selectedServer: {
            ...config.selectedServer,
            url: workingUrl,
          },
        })
      }
    }

    const formattedLibraries = libraries.map((lib: any) => ({
      key: lib.key,
      title: lib.title,
      type: lib.type,
      agent: lib.agent,
      scanner: lib.scanner,
    }))

    const response = { libraries: formattedLibraries, connectedUrl: workingUrl }

    await cache.set(cacheKey, response, { ttl: CACHE_TTL.LIBRARIES })

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[v0] Libraries error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch libraries" }, { status: 500 })
  }
}
