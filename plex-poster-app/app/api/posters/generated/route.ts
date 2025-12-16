import { type NextRequest, NextResponse } from "next/server"
import { PosterStorage } from "@/lib/posters/storage"
import { promises as fs } from "fs"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const libraryKey = searchParams.get("libraryKey")
    const ratingKey = searchParams.get("ratingKey")

    if (!libraryKey || !ratingKey) {
      return NextResponse.json({ error: "Missing libraryKey or ratingKey" }, { status: 400 })
    }

    const posters = await PosterStorage.getGeneratedPostersForItem(libraryKey, ratingKey)

    // Convert file paths to data URLs for frontend display
    const postersWithData = await Promise.all(
      posters.map(async (poster) => {
        try {
          const buffer = await fs.readFile(poster.path)
          const base64 = buffer.toString("base64")
          const dataUrl = `data:image/png;base64,${base64}`

          return {
            url: dataUrl,
            thumb: dataUrl,
            created: poster.created,
            model: poster.model,
            style: poster.style,
            filename: poster.filename,
          }
        } catch (error) {
          console.error(`[Generated Posters API] Failed to read poster file:`, error)
          return null
        }
      }),
    )

    // Filter out any failed reads
    const validPosters = postersWithData.filter((p) => p !== null)

    return NextResponse.json({ posters: validPosters })
  } catch (error: any) {
    console.error("[Generated Posters API] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
