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

    const icon = type === "ai-generated" ? Sparkles : type === "fanart" ? ImageIconLucide : ImageIcon

    return (
      <div key={type} className="space-y-3">
        <div className="flex items-center gap-2">
          {icon && <span className="h-4 w-4">{icon({ className: "h-4 w-4" })}</span>}
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="text-xs">
            {items.length}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((poster, idx) => {
            const isSelected = poster.selected || poster.url === currentPoster
            const isChanging = changingPoster === poster.url

            return (
              <button
                key={`${type}-${idx}`}
                onClick={() => !isSelected && handleSetPrimary(poster.url)}
                disabled={isChanging || isSelected}
                className="group relative aspect-[2/3] overflow-hidden rounded-lg border bg-card transition-all hover:ring-2 hover:ring-primary disabled:opacity-50"
              >
                <img
                  src={poster.thumb || poster.url}
                  alt={`${title} poster ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
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
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                    <p className="text-xs text-white truncate">{poster.model}</p>
                    {poster.style && <p className="text-xs text-white/70 truncate">{poster.style}</p>}
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
      {renderPosterSection("Plex Library", "plex", groupedPosters.plex)}
      {renderPosterSection("FanArt", "fanart", groupedPosters.fanart)}
      {renderPosterSection("AI Generated", "ai-generated", groupedPosters["ai-generated"])}
    </div>
  )
}
