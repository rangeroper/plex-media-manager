import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"

export async function POST(request: NextRequest, { params }: { params: { key: string } }) {
  try {
    const body = await request.json()
    const { plexToken, plexUrl, alternateUrls = [] } = body
    const collectionKey = params.key

    console.log("[v0] Collection items request body:", {
      plexToken: !!plexToken,
      plexUrl,
      alternateUrls,
      collectionKey,
    })

    if (!plexToken || !collectionKey) {
      console.log("[v0] Missing required parameters:", { plexToken: !!plexToken, collectionKey })
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const client = new PlexClient(plexToken)
    const urlsToTry = [plexUrl, ...alternateUrls].filter(Boolean)

    if (urlsToTry.length === 0) {
      return NextResponse.json({ error: "No Plex server URLs provided" }, { status: 400 })
    }

    console.log(`[v0] Fetching items for collection ${collectionKey} using ${urlsToTry.length} URLs`)

    const workingUrl = await client.findWorkingConnection(urlsToTry)

    if (!workingUrl) {
      return NextResponse.json({ error: "Failed to connect to any Plex server URL" }, { status: 500 })
    }

    console.log(`[v0] Connected to: ${workingUrl}`)

    const items = await client.getCollectionItems(workingUrl, `/library/collections/${collectionKey}/children`)

    console.log(`[v0] Fetched ${items.length} items from collection`)

    return NextResponse.json({ items, connectedUrl: workingUrl })
  } catch (error) {
    console.error("[v0] Failed to fetch collection items:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch collection items" },
      { status: 500 },
    )
  }
}
