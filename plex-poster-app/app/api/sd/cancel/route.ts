import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const sdApiUrl = process.env.SD_API_URL || "http://sd-api:9090"

    console.log(`[API] Forwarding cancel request to SD API: ${sdApiUrl}/cancel`)

    const response = await fetch(`${sdApiUrl}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[API] SD API cancel failed: ${errorText}`)
      return NextResponse.json({ error: "Failed to cancel generation" }, { status: response.status })
    }

    const data = await response.json()
    console.log(`[API] SD API cancel response:`, data)

    return NextResponse.json(data)
  } catch (error) {
    console.error("[API] Error forwarding cancel request:", error)
    return NextResponse.json({ error: "Failed to communicate with SD API" }, { status: 500 })
  }
}
