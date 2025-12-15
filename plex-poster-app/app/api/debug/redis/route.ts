import { NextResponse } from "next/server"
import { cache } from "@/lib/redis-cache"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Get all keys from Redis
    const keys = await cache.keys("*")
        
    // Get values for each key (limit to first 100 to avoid overload)
    const data: Record<string, any> = {}
    
    for (const key of keys.slice(0, 100)) {
      try {
        const value = await cache.get(key)
        data[key] = value
      } catch (err) {
        data[key] = `Error fetching: ${err}`
      }
    }
    
    return NextResponse.json({
      totalKeys: keys.length,
      keys: keys,
      data: data,
      note: keys.length > 100 ? "Showing first 100 keys only" : "Showing all keys"
    }, { status: 200 })
    
  } catch (error) {
    console.error("[Debug] Redis debug failed:", error)
    return NextResponse.json(
      { error: "Failed to fetch Redis data", message: String(error) },
      { status: 500 }
    )
  }
}