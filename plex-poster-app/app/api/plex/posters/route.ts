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
      let posterPath = posterUrl
      if (posterUrl.includes("/library/metadata/")) {
        // Extract path from URL: http://server/path?token -> /path
        const urlObj = new URL(posterUrl)
        posterPath = urlObj.pathname
      }

      await plexClient.setPrimaryPoster(plexUrl, ratingKey, posterPath)
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
