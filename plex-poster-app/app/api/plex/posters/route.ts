import { type NextRequest, NextResponse } from "next/server"
import { PlexClient } from "@/lib/plex/client"

export async function POST(request: NextRequest) {
  try {
    const { plexUrl, plexToken, ratingKey, action, posterUrl } = await request.json()

    if (!plexToken || !plexUrl || !ratingKey) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const plexClient = new PlexClient(plexToken)

    if (action === "set-primary" && posterUrl) {
      await plexClient.setPrimaryPoster(plexUrl, ratingKey, posterUrl)
      return NextResponse.json({ success: true })
    }

    if (action === "list") {
      const posters = await plexClient.getItemPosters(plexUrl, ratingKey)
      return NextResponse.json({ posters })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[Posters API] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
