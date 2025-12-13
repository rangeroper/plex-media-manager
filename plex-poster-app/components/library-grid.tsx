"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Loader2, ImageIcon } from "lucide-react"
import Link from "next/link"

interface LibraryGridProps {
  plexUrl: string
  plexToken: string
  libraryKey: string | null
}

export function LibraryGrid({ plexUrl, plexToken, libraryKey }: LibraryGridProps) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [connectedUrl, setConnectedUrl] = useState(plexUrl)
  const [offset, setOffset] = useState(0)
  const [totalSize, setTotalSize] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const observerTarget = useRef<HTMLDivElement>(null)
  const ITEMS_PER_PAGE = 100

  useEffect(() => {
    if (plexUrl && plexToken && libraryKey) {
      setItems([])
      setOffset(0)
      setHasMore(true)
      loadItems(0, true)
    }
  }, [plexUrl, plexToken, libraryKey])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMoreItems()
        }
      },
      { threshold: 0.1 },
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, offset])

  const loadItems = async (currentOffset: number, isInitial = false) => {
    if (!libraryKey) return

    if (isInitial) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const serverIdMatch = plexUrl.match(/([a-f0-9]{40})\.plex\.direct/)
      const serverId = serverIdMatch ? serverIdMatch[1] : ""
      const cachedUrl = serverId ? localStorage.getItem(`plex_working_url_${serverId}`) : null
      const urlToUse = cachedUrl || plexUrl

      const response = await fetch("/api/plex/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexUrl: urlToUse,
          plexToken,
          libraryKey,
          serverId,
          offset: currentOffset,
          limit: ITEMS_PER_PAGE,
        }),
      })

      if (response.ok) {
        const data = await response.json()

        setItems((prev) => (isInitial ? data.items : [...prev, ...(data.items || [])]))
        setTotalSize(data.totalSize || 0)
        setHasMore(currentOffset + ITEMS_PER_PAGE < (data.totalSize || 0))

        if (data.connectedUrl && serverId) {
          localStorage.setItem(`plex_working_url_${serverId}`, data.connectedUrl)
          setConnectedUrl(data.connectedUrl)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to load items:", error)
    } finally {
      if (isInitial) {
        setLoading(false)
      } else {
        setLoadingMore(false)
      }
    }
  }

  const loadMoreItems = useCallback(() => {
    const newOffset = offset + ITEMS_PER_PAGE
    setOffset(newOffset)
    loadItems(newOffset, false)
  }, [offset, libraryKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading library content...</p>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <ImageIcon className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">No items found in this library</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Showing {items.length} of {totalSize} items
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <Link
            key={item.key}
            href={`/item/${item.ratingKey}?plexUrl=${encodeURIComponent(connectedUrl)}&plexToken=${plexToken}`}
            className="group relative aspect-[2/3] overflow-hidden rounded-lg border bg-card transition-all hover:ring-2 hover:ring-primary cursor-pointer"
          >
            {item.thumb ? (
              <img
                src={`${connectedUrl}${item.thumb}?X-Plex-Token=${plexToken}`}
                alt={item.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-xs font-medium text-white line-clamp-2">{item.title}</p>
                {item.year && (
                  <p className="text-xs text-white/70 mt-1">{item.year}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div ref={observerTarget} className="flex justify-center py-8">
        {loadingMore && (
          <div className="text-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">Loading more...</p>
          </div>
        )}
        {!hasMore && items.length > 0 && <p className="text-xs text-muted-foreground">All items loaded</p>}
      </div>
    </div>
  )
}