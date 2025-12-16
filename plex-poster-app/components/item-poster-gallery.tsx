"use client"

import { useState } from "react"
import { ImageIcon, Sparkles, ImageIcon as ImageIconLucide, Check, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { PosterSource } from "@/lib/plex/types"

interface ItemPosterGalleryProps {
  posters: PosterSource[]
  plexUrl: string
  plexToken: string
  ratingKey: string
  currentPoster?: string
  onPosterChange?: () => void
}

export function ItemPosterGallery({
  posters,
  plexUrl,
  plexToken,
  ratingKey,
  currentPoster,
  onPosterChange,
}: ItemPosterGalleryProps) {
  const [changingPoster, setChangingPoster] = useState<string | null>(null)

  const handleSetPrimary = async (posterUrl: string) => {
    setChangingPoster(posterUrl)
    try {
      const response = await fetch("/api/plex/posters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexUrl,
          plexToken,
          ratingKey,
          action: "set-primary",
          posterUrl,
        }),
      })

      if (!response.ok) throw new Error("Failed to set poster")

      onPosterChange?.()
    } catch (error) {
      console.error("Failed to set primary poster:", error)
    } finally {
      setChangingPoster(null)
    }
  }

  const groupedPosters = posters.reduce(
    (acc, poster) => {
      acc[poster.type].push(poster)
      return acc
    },
    { plex: [], fanart: [], "ai-generated": [] } as Record<PosterSource["type"], PosterSource[]>,
  )

  const renderPosterSection = (title: string, type: PosterSource["type"], items: PosterSource[]) => {
    if (items.length === 0) return null

    const IconComponent = type === "ai-generated" ? Sparkles : type === "fanart" ? ImageIconLucide : ImageIcon

    return (
      <div key={type} className="space-y-4 p-4 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2">
          <IconComponent className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold">{title}</h3>
          <Badge variant="secondary" className="text-xs">
            {items.length}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((poster, idx) => {
            const isSelected = poster.selected || poster.url === currentPoster
            const isChanging = changingPoster === poster.url

            return (
              <button
                key={`${type}-${idx}`}
                onClick={() => !isSelected && handleSetPrimary(poster.url)}
                disabled={isChanging || isSelected}
                className="group relative aspect-[2/3] overflow-hidden rounded-lg border-2 bg-card transition-all hover:ring-2 hover:ring-primary hover:border-primary disabled:opacity-50"
              >
                <img
                  src={poster.thumb || poster.url}
                  alt={`${title} poster ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    console.error(`[PosterGallery] Failed to load image:`, poster.url)
                    e.currentTarget.src = "/placeholder.svg?height=600&width=400"
                  }}
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center border-2 border-primary">
                    <div className="bg-primary text-primary-foreground rounded-full p-2">
                      <Check className="h-5 w-5" />
                    </div>
                  </div>
                )}
                {isChanging && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                {poster.model && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-2">
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-yellow-400" />
                      <p className="text-xs font-medium text-white truncate">{poster.model}</p>
                    </div>
                    {poster.style && <p className="text-xs text-white/80 truncate mt-0.5">{poster.style}</p>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderPosterSection("Plex Library Posters", "plex", groupedPosters.plex)}
      {renderPosterSection("FanArt Posters", "fanart", groupedPosters.fanart)}
      {renderPosterSection("AI Generated Posters", "ai-generated", groupedPosters["ai-generated"])}

      {posters.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No posters available for this item</p>
        </div>
      )}
    </div>
  )
}
