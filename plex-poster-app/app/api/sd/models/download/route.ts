import { NextResponse } from "next/server"

const SD_API_URL = process.env.SD_API_URL || "http://sd-api:9090"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { model } = body

    if (!model) {
      return NextResponse.json({ error: "Model key is required" }, { status: 400 })
    }

    const response = await fetch(`${SD_API_URL}/models/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    })

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json({ error: error.error || "Failed to download model" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SD Download API] Error downloading model:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download model" },
      { status: 500 },
    )
  }
}
