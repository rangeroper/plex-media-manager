import { NextResponse } from "next/server"

const SD_API_URL = process.env.SD_API_URL || "http://sd-api:9090"

export async function GET() {
  try {
    const response = await fetch(`${SD_API_URL}/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error: `SD API error: ${error}` }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[SD Models API] Error fetching models:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch models" },
      { status: 500 },
    )
  }
}
