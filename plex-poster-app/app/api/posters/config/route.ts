// app/api/posters/config/route.ts
import { NextRequest, NextResponse } from "next/server"
import { PosterStorage } from "@/lib/posters/storage"

export const dynamic = "force-dynamic"

// GET: Fetch current poster config
export async function GET(request: NextRequest) {
  try {
    const config = await PosterStorage.loadConfig()
    return NextResponse.json(config)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[API] Failed to load config:", message)
    return NextResponse.json(
      { error: "Failed to load config", message },
      { status: 500 }
    )
  }
}

// POST: Update poster config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updated = await PosterStorage.updateConfig(body)
    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[API] Failed to update config:", message)
    return NextResponse.json(
      { error: "Failed to update config", message },
      { status: 500 }
    )
  }
}