"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, ImageIcon, Calendar, Film, ArrowLeft, Star, Users, Play, Clock, Building } from "lucide-react"
import Link from "next/link"
import { ItemPosterGallery } from "@/components/item-poster-gallery"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PlexItemDetailed, PosterSource } from "@/lib/plex/types"

export default function ItemDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const ratingKey = params.key as string
  const plexUrl = searchParams.get("plexUrl") || ""
  const plexToken = searchParams.get("plexToken") || ""

  const [item, setItem] = useState<PlexItemDetailed | null>(null)
  const [posters, setPosters] = useState<PosterSource[]>([])
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

    try {
      const [metadataRes, postersRes, generatedRes] = await Promise.all([
        fetch("/api/plex/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plexUrl, plexToken, ratingKey }),
        }),
        fetch("/api/plex/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plexUrl, plexToken, ratingKey, action: "list" }),
        }),
        fetch(`/api/posters/generated?libraryKey=${searchParams.get("libraryKey") || ""}&ratingKey=${ratingKey}`),
      ])

      if (!metadataRes.ok) {
        const errorData = await metadataRes.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(errorData.error || "Failed to fetch item details")
      }

      const metadata = await metadataRes.json()
      setItem(metadata.metadata)

      const allPosters: PosterSource[] = []

      if (postersRes.ok) {
        const posterData = await postersRes.json()
        allPosters.push(...(posterData.posters || []))
      }

      if (generatedRes.ok) {
        const generatedData = await generatedRes.json()
        const aiPosters = (generatedData.posters || []).map((p: any) => ({
          type: "ai-generated" as const,
          url: p.url,
          thumb: p.thumb,
          selected: false,
          model: p.model || "Unknown",
          style: p.style,
          created: p.created,
        }))
        allPosters.push(...aiPosters)
      }

      setPosters(allPosters)
    } catch (err: any) {
      setError(err.message || "Failed to load item details")
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

  const mainCast = item.Role?.slice(0, 10) || []
  const directors = item.Director?.map((d) => d.tag).join(", ") || "Unknown"
  const writers = item.Writer?.map((w) => w.tag).join(", ") || "Unknown"
  const genres = item.Genre?.map((g) => g.tag) || []

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        {/* Poster Sidebar */}
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
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              {item.rating && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold">{item.rating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
              )}
              {item.contentRating && (
                <Badge variant="outline" className="text-xs">
                  {item.contentRating}
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-2">
              {item.duration && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(item.duration)}</span>
                </div>
              )}
              {item.studio && (
                <div className="flex items-center gap-2">
                  <Building className="h-3 w-3" />
                  <span>{item.studio}</span>
                </div>
              )}
              {item.viewCount !== undefined && (
                <div className="flex items-center gap-2">
                  <Play className="h-3 w-3" />
                  <span>{item.viewCount} views</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight leading-tight">{item.title}</h1>
            {item.tagline && <p className="text-lg text-muted-foreground italic mt-1">{item.tagline}</p>}
            {item.year && (
              <p className="text-muted-foreground mt-2">
                {item.year}
                {item.duration && ` • ${formatDuration(item.duration)}`}
                {item.studio && ` • ${item.studio}`}
              </p>
            )}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {genres.map((genre) => (
                  <Badge key={genre} variant="secondary">
                    {genre}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Overview */}
          {item.summary && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Overview</h2>
              <p className="text-muted-foreground leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Tabs for organized content */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="cast">Cast</TabsTrigger>
              <TabsTrigger value="posters">Posters</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {item.originallyAvailableAt && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      Release Date
                    </p>
                    <p className="text-sm font-medium">{new Date(item.originallyAvailableAt).toLocaleDateString()}</p>
                  </div>
                )}

                {directors && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Director(s)</p>
                    <p className="text-sm font-medium">{directors}</p>
                  </div>
                )}

                {writers && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Writer(s)</p>
                    <p className="text-sm font-medium">{writers}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Film className="h-3 w-3" />
                    Media Type
                  </p>
                  <p className="text-sm font-medium capitalize">{item.type}</p>
                </div>

                {item.addedAt && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Added to Library</p>
                    <p className="text-sm font-medium">{new Date(item.addedAt * 1000).toLocaleDateString()}</p>
                  </div>
                )}

                {item.audienceRating && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Audience Rating</p>
                    <p className="text-sm font-medium">{item.audienceRating}/10</p>
                  </div>
                )}
              </div>

              {/* Backdrop */}
              {item.art && (
                <div className="pt-4">
                  <h3 className="text-sm font-semibold mb-3">Backdrop</h3>
                  <div className="aspect-video overflow-hidden rounded-lg border">
                    <img
                      src={`${plexUrl}${item.art}?X-Plex-Token=${plexToken}`}
                      alt={`${item.title} backdrop`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="cast" className="mt-6">
              {mainCast.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {mainCast.map((actor, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="aspect-[2/3] overflow-hidden rounded-lg border bg-muted">
                        {actor.thumb ? (
                          <img
                            src={`${plexUrl}${actor.thumb}?X-Plex-Token=${plexToken}`}
                            alt={actor.tag}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Users className="h-12 w-12 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">{actor.tag}</p>
                        {actor.role && <p className="text-xs text-muted-foreground">{actor.role}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cast information available</p>
              )}
            </TabsContent>

            <TabsContent value="posters" className="mt-6">
              <ItemPosterGallery
                posters={posters}
                plexUrl={plexUrl}
                plexToken={plexToken}
                ratingKey={ratingKey}
                currentPoster={item.thumb}
                onPosterChange={loadItemDetails}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
