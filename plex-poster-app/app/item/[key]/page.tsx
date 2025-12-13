// app/item/[key]/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, ImageIcon, Calendar, Film, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface ItemDetails {
  key: string
  title: string
  type: string
  thumb?: string
  art?: string
  year?: number
  ratingKey: string
  summary?: string
  rating?: number
  duration?: number
  studio?: string
  contentRating?: string
  originallyAvailableAt?: string
  addedAt?: number
  updatedAt?: number
}

export default function ItemDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const ratingKey = params.key as string // Changed from ratingKey to key
  const plexUrl = searchParams.get("plexUrl") || ""
  const plexToken = searchParams.get("plexToken") || ""

  const [item, setItem] = useState<ItemDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ratingKey && plexUrl && plexToken) {
      loadItemDetails()
    }
  }, [ratingKey, plexUrl, plexToken])

  const loadItemDetails = async () => {
    setLoading(true)
    setError(null)

    console.log("[Item Detail] Loading metadata for:", { ratingKey, plexUrl: plexUrl.substring(0, 50) })

    try {
      const response = await fetch("/api/plex/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexUrl,
          plexToken,
          ratingKey,
        }),
      })

      console.log("[Item Detail] Response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        console.error("[Item Detail] Error response:", errorData)
        throw new Error(errorData.error || "Failed to fetch item details")
      }

      const data = await response.json()
      console.log("[Item Detail] Received metadata:", data.metadata?.title)
      setItem(data.metadata)
    } catch (err: any) {
      setError(err.message || "Failed to load item details")
      console.error("[Item Detail] Error:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return null
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${minutes}m`
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading item details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <p className="text-sm text-muted-foreground">{error || "Item not found"}</p>
            <Link href="/" className="text-sm text-primary hover:underline">
              Return to library
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <div className="grid md:grid-cols-[300px_1fr] gap-8">
        {/* Poster */}
        <div className="space-y-4">
          <div className="aspect-[2/3] overflow-hidden rounded-lg border bg-card">
            {item.thumb ? (
              <img
                src={`${plexUrl}${item.thumb}?X-Plex-Token=${plexToken}`}
                alt={item.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <ImageIcon className="h-16 w-16 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Quick Info Card */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Rating Key:</span>
                <span className="font-mono font-medium text-foreground">{item.ratingKey}</span>
              </div>
              <div className="flex justify-between">
                <span>Type:</span>
                <span className="capitalize text-foreground">{item.type}</span>
              </div>
              {item.year && (
                <div className="flex justify-between">
                  <span>Year:</span>
                  <span className="text-foreground">{item.year}</span>
                </div>
              )}
              {item.contentRating && (
                <div className="flex justify-between">
                  <span>Rated:</span>
                  <span className="text-foreground">{item.contentRating}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{item.title}</h1>
            {item.year && (
              <p className="text-muted-foreground mt-1">
                {item.year}
                {item.duration && ` • ${formatDuration(item.duration)}`}
                {item.studio && ` • ${item.studio}`}
              </p>
            )}
          </div>

          {item.rating && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">{item.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">/10</span>
              </div>
            </div>
          )}

          {item.summary && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t">
            {item.originallyAvailableAt && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Release Date
                </p>
                <p className="text-sm font-medium">
                  {new Date(item.originallyAvailableAt).toLocaleDateString()}
                </p>
              </div>
            )}

            {item.addedAt && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Added to Library</p>
                <p className="text-sm font-medium">
                  {new Date(item.addedAt * 1000).toLocaleDateString()}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Film className="h-3 w-3" />
                Media Type
              </p>
              <p className="text-sm font-medium capitalize">{item.type}</p>
            </div>

            {item.contentRating && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Content Rating</p>
                <p className="text-sm font-medium">{item.contentRating}</p>
              </div>
            )}
          </div>

          {/* Backdrop */}
          {item.art && (
            <div className="pt-4">
              <h2 className="text-lg font-semibold mb-3">Backdrop</h2>
              <div className="aspect-video overflow-hidden rounded-lg border">
                <img
                  src={`${plexUrl}${item.art}?X-Plex-Token=${plexToken}`}
                  alt={`${item.title} backdrop`}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}