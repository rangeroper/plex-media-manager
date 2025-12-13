import { NextRequest, NextResponse } from "next/server"
import { PosterStorage } from "@/lib/posters/storage"

export const dynamic = "force-dynamic"

// GET - Load library-specific settings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ libraryKey: string }> }
) {
  try {
    const { libraryKey } = await params
    console.log('[API] Loading settings for library:', libraryKey)
    const settings = await PosterStorage.getLibrarySettings(libraryKey)
    return NextResponse.json(settings || {})
  } catch (error) {
    console.error("[API] Failed to load library settings:", error)
    return NextResponse.json(
      { error: "Failed to load library settings" },
      { status: 500 }
    )
  }
}

// POST - Save library-specific settings
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ libraryKey: string }> }
) {
  try {
    const { libraryKey } = await params
    const settings = await request.json()
    console.log('[API] Saving settings for library:', libraryKey, settings)
    await PosterStorage.updateLibrarySettings(libraryKey, settings)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Failed to save library settings:", error)
    return NextResponse.json(
      { error: "Failed to save library settings" },
      { status: 500 }
    )
  }
}

// DELETE - Remove library-specific settings
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ libraryKey: string }> }
) {
  try {
    const { libraryKey } = await params
    console.log('[API] Deleting settings for library:', libraryKey)
    await PosterStorage.deleteLibrarySettings(libraryKey)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Failed to delete library settings:", error)
    return NextResponse.json(
      { error: "Failed to delete library settings" },
      { status: 500 }
    )
  }
}