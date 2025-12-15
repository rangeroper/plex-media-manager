import { NextResponse } from "next/server"

const SD_API_URL = process.env.SD_API_URL || "http://sd-api:9090"

export async function POST() {
  try {
    const response = await fetch(`${SD_API_URL}/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json({ error: error.error || "Failed to unload model" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SD Unload API] Error unloading model:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unload model" },
      { status: 500 },
    )
  }
}
