import { type NextRequest, NextResponse } from "next/server"
import { cache } from "@/lib/redis-cache"

export async function POST(request: NextRequest) {
  try {
    const { type, libraryKey, serverId } = await request.json()

    if (type === "all") {
      await cache.invalidateAll()
      return NextResponse.json({ success: true, message: "All cache invalidated" })
    }

    if (type === "library" && libraryKey) {
      const cacheKey = `items:${serverId || "default"}:${libraryKey}`
      await cache.delete(cacheKey)
      return NextResponse.json({ success: true, message: `Cache invalidated for library ${libraryKey}` })
    }

    if (type === "libraries") {
      const cacheKey = `libraries:${serverId || "default"}`
      await cache.delete(cacheKey)
      return NextResponse.json({ success: true, message: "Libraries cache invalidated" })
    }

    return NextResponse.json({ error: "Invalid invalidation type" }, { status: 400 })
  } catch (error: any) {
    console.error("[v0] Cache invalidation error:", error)
    return NextResponse.json({ error: error.message || "Failed to invalidate cache" }, { status: 500 })
  }
}
