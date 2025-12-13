import { type NextRequest, NextResponse } from "next/server"
import { PlexAuth } from "@/lib/plex/auth"

const PLEX_CLIENT_ID = "plex-poster-manager"
const PLEX_PRODUCT = "Plex Poster Manager"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, pinId } = body

    if (action === "createPin") {
      const result = await PlexAuth.createPin()
      return NextResponse.json(result)
    } else if (action === "checkPin") {
      const result = await PlexAuth.checkPin(pinId)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[v0] Plex auth error:", error)
    return NextResponse.json({ error: error.message || "Authentication failed" }, { status: 500 })
  }
}
