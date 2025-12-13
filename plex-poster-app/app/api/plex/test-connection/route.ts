import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { plexUrl, plexToken } = await request.json()

    if (!plexUrl || !plexToken) {
      return NextResponse.json({ error: "Plex URL and token required" }, { status: 400 })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    try {
      const response = await fetch(`${plexUrl}/?X-Plex-Token=${plexToken}`, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return NextResponse.json({ success: false, error: "Connection failed" }, { status: 200 })
      }

      return NextResponse.json({ success: true })
    } catch (error: any) {
      clearTimeout(timeoutId)
      console.log("[v0] Connection test failed for", plexUrl, error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 200 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to test connection" }, { status: 500 })
  }
}
