import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"

export async function POST(request: NextRequest) {
  try {
    const { plexToken, plexUrl, alternateUrls = [] } = await request.json()

    if (!plexToken) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const urlsToTry = [plexUrl, ...(alternateUrls || [])].filter(Boolean)

    if (urlsToTry.length === 0) {
      return NextResponse.json({ error: "No Plex server URLs provided" }, { status: 400 })
    }

    console.log(`[v0] Fetching collections with ${urlsToTry.length} URLs`)

    const client = new PlexClient(plexToken)

    const workingUrl = await client.findWorkingConnection(urlsToTry)

    if (!workingUrl) {
      return NextResponse.json({ error: "Failed to connect to any Plex server URL" }, { status: 500 })
    }

    console.log(`[v0] Connected to: ${workingUrl}`)

    const libraries = await client.getLibraries(workingUrl)
    console.log(`[v0] Found ${libraries.length} libraries`)

    const allCollections: any[] = []

    for (const library of libraries) {
      try {
        console.log(`[v0] Fetching collections for library: ${library.title} (${library.key})`)
        const libraryCollections = await client.getCollections(workingUrl, library.key)

        const collectionsWithLibrary = libraryCollections.map((col: any) => ({
          ...col,
          libraryKey: library.key,
          libraryTitle: library.title,
          libraryType: library.type,
        }))

        allCollections.push(...collectionsWithLibrary)
        console.log(`[v0] Found ${libraryCollections.length} collections in ${library.title}`)
      } catch (error) {
        console.error(`[v0] Failed to fetch collections for library ${library.title}:`, error)
        // Continue with other libraries even if one fails
      }
    }

    console.log(`[v0] Total collections fetched: ${allCollections.length}`)

    return NextResponse.json({
      collections: allCollections,
      connectedUrl: workingUrl,
      libraryCount: libraries.length,
    })
  } catch (error) {
    console.error("[v0] Failed to fetch collections:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch collections" },
      { status: 500 },
    )
  }
}
