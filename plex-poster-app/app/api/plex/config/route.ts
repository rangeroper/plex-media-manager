import { NextResponse } from "next/server"
import { PlexStorage } from "@/lib/plex/storage"

export async function GET() {
  try {
    const config = await PlexStorage.loadConfig()
    return NextResponse.json(config)
  } catch (error: any) {
    console.error("[v0] Failed to load config:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const updates = await request.json()
    const config = await PlexStorage.updateConfig(updates)
    return NextResponse.json(config)
  } catch (error: any) {
    console.error("[v0] Failed to update config:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await PlexStorage.clearConfig()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Failed to clear config:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
