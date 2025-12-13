"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Folder, Film, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

interface Collection {
  ratingKey: string
  title: string
  thumb?: string
  childCount: number
  summary?: string
  libraryTitle?: string
  libraryKey?: string
  libraryType?: string
}

interface Library {
  key: string
  title: string
}

interface CollectionsViewProps {
  plexUrl: string
  plexToken: string
  alternateUrls?: string[]
  libraries?: Library[]
  selectedLibraryKey?: string | null
}

export function CollectionsView({
  plexUrl,
  plexToken,
  alternateUrls = [],
  libraries = [],
  selectedLibraryKey = null,
}: CollectionsViewProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [filteredCollections, setFilteredCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [collectionItems, setCollectionItems] = useState<any[]>([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [workingUrl, setWorkingUrl] = useState<string>(plexUrl)

  useEffect(() => {
    async function fetchCollections() {
      if (!plexUrl || !plexToken) return

      setIsLoading(true)
      try {
        const response = await fetch("/api/plex/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plexToken, plexUrl, alternateUrls }),
        })

        if (response.ok) {
          const data = await response.json()
          console.log("[v0] Collections response:", data)
          console.log("[v0] First collection:", data.collections?.[0])
          setCollections(data.collections || [])
          setFilteredCollections(data.collections || [])
          if (data.connectedUrl) {
            setWorkingUrl(data.connectedUrl)
          }
        } else {
          console.error("[v0] Failed to fetch collections:", await response.text())
        }
      } catch (error) {
        console.error("[v0] Failed to fetch collections:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCollections()
  }, [plexUrl, plexToken, alternateUrls])

  useEffect(() => {
    console.log("[v0] Filtering collections by library:", selectedLibraryKey)
    console.log("[v0] Total collections before filter:", collections.length)

    if (!selectedLibraryKey) {
      setFilteredCollections(collections)
    } else {
      const filtered = collections.filter((collection) => collection.libraryKey === selectedLibraryKey)
      console.log("[v0] Filtered collections count:", filtered.length)
      setFilteredCollections(filtered)
    }
  }, [selectedLibraryKey, collections])

  const handleSelectCollection = async (ratingKey: string) => {
    setSelectedCollection(ratingKey)
    setIsLoadingItems(true)

    try {
      console.log("[v0] Fetching collection items for ratingKey:", ratingKey)

      const response = await fetch(`/api/plex/collections/${ratingKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexToken,
          plexUrl: workingUrl,
          alternateUrls,
          collectionKey: ratingKey, // Pass as collectionKey to match API
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setCollectionItems(data.items || [])
        console.log("[v0] Loaded collection items:", data.items?.length || 0)
      } else {
        const errorText = await response.text()
        console.error("[v0] Failed to fetch collection items:", errorText)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch collection items:", error)
    } finally {
      setIsLoadingItems(false)
    }
  }

  const getImageUrl = (path?: string) => {
    if (!path) return "/abstract-poster.png"
    return `${workingUrl}${path}?X-Plex-Token=${plexToken}`
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (selectedCollection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCollection(null)} className="gap-2">
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Collections
          </Button>
        </div>

        {isLoadingItems ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {collectionItems.map((item) => (
              <Card
                key={item.ratingKey}
                className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 transition-all hover:border-primary/50 hover:shadow-lg"
              >
                <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                  <img
                    src={getImageUrl(item.thumb || item.parentThumb || item.grandparentThumb)}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <h3 className="truncate text-sm font-medium">{item.title}</h3>
                  {item.year && <p className="text-xs text-muted-foreground">{item.year}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Collections</h2>
          <p className="text-sm text-muted-foreground">
            {filteredCollections.length} collection{filteredCollections.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Collection
        </Button>
      </div>

      {filteredCollections.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center space-y-3">
            <Folder className="h-12 w-12 text-muted-foreground/50 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {selectedLibraryKey === null ? "No collections found" : "No collections in this library"}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedLibraryKey === null
                  ? "Create your first collection to get started"
                  : "Try selecting a different library"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredCollections.map((collection) => (
            <Card
              key={collection.ratingKey}
              className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 transition-all hover:border-primary/50 hover:shadow-lg"
              onClick={() => handleSelectCollection(collection.ratingKey)}
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-muted">
                <img
                  src={getImageUrl(collection.thumb) || "/placeholder.svg"}
                  alt={collection.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="flex items-center gap-2 text-white">
                    <Film className="h-4 w-4" />
                    <span className="text-xs font-medium">{collection.childCount} items</span>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <h3 className="truncate font-medium">{collection.title}</h3>
                {collection.libraryTitle && (
                  <p className="mt-1 text-xs text-muted-foreground truncate">{collection.libraryTitle}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
