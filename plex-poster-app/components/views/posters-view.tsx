"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StableDiffusionProvider } from "../posters/ai/stable-diffusion/stable-diffusion-provider"
import { usePosterJobs } from "@/hooks/usePosterJobs"

interface Library {
  key: string
  title: string
  type: string
}

interface GenerationTask {
  id: string
  jobId?: string
  libraryKey: string
  libraryTitle: string
  status: "pending" | "running" | "completed" | "paused" | "failed"
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  progress: number
  startedAt?: string
  completedAt?: string
  provider: "stable-diffusion" | "fanart" | "tmdb" | "imdb"
}

interface PostersViewProps {
  plexUrl: string
  plexToken: string
  libraries?: Library[]
}

type ProviderType = "stable-diffusion" | "fanart" | "tmdb" | "imdb"

const STORAGE_KEY = "plex-poster-active-jobs"

export function PostersView({ plexUrl, plexToken, libraries = [] }: PostersViewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [activeJobIds, setActiveJobIds] = useState<string[]>([])
  const [activeProviders, setActiveProviders] = useState<Record<string, ProviderType>>({})
  const [libraryJobMap, setLibraryJobMap] = useState<Record<string, string>>({})

  const { tasks, isGenerating, totalProgress, totalCompleted, totalFailed } = usePosterJobs(activeJobIds)

  const hasStableDiffusionSelected = Object.values(activeProviders).includes("stable-diffusion")

  useEffect(() => {
    try {
      const savedJobs = localStorage.getItem(STORAGE_KEY)
      if (savedJobs) {
        const parsed = JSON.parse(savedJobs)
        if (parsed.jobIds && Array.isArray(parsed.jobIds)) {
          console.log("[PostersView] Restoring active jobs from storage:", parsed.jobIds)
          setActiveJobIds(parsed.jobIds)
          if (parsed.libraryJobMap) {
            setLibraryJobMap(parsed.libraryJobMap)
          }
        }
      }
    } catch (error) {
      console.error("[PostersView] Failed to load persisted jobs:", error)
    }
  }, [])

  useEffect(() => {
    if (activeJobIds.length > 0) {
      try {
        const data = {
          jobIds: activeJobIds,
          libraryJobMap,
          timestamp: new Date().toISOString(),
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        console.log("[PostersView] Persisted active jobs to storage")
      } catch (error) {
        console.error("[PostersView] Failed to persist jobs:", error)
      }
    } else {
      // Clear storage when no active jobs
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [activeJobIds, libraryJobMap])

  useEffect(() => {
    if (tasks.length > 0) {
      const completedOrFailedIds = tasks
        .filter((t) => t.status === "completed" || t.status === "failed")
        .map((t) => t.id)

      if (completedOrFailedIds.length > 0) {
        // Wait a bit before removing to let users see the final state
        const timeout = setTimeout(() => {
          setActiveJobIds((prev) => prev.filter((id) => !completedOrFailedIds.includes(id)))
        }, 5000) // 5 seconds delay

        return () => clearTimeout(timeout)
      }
    }
  }, [tasks])

  /* Load provider settings */
  useEffect(() => {
    async function loadProviderSettings() {
      setIsLoading(true)
      const providers: Record<string, ProviderType> = {}

      for (const library of libraries) {
        try {
          const res = await fetch(`/api/posters/config/${library.key}`)
          if (res.ok) {
            const data = await res.json()
            if (data.provider) providers[library.key] = data.provider
          }
        } catch (err) {
          console.error(`Failed to load settings for ${library.key}:`, err)
        }
      }

      setActiveProviders(providers)
      setIsLoading(false)
    }

    if (libraries.length) loadProviderSettings()
  }, [libraries])

  /* Provider toggle */
  const handleProviderToggle = async (libraryKey: string, provider: ProviderType) => {
    const next = activeProviders[libraryKey] === provider ? undefined : provider

    setActiveProviders((prev) => {
      const copy = { ...prev }
      next ? (copy[libraryKey] = next) : delete copy[libraryKey]
      return copy
    })

    await fetch(`/api/posters/config/${libraryKey}`, {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: next ? JSON.stringify({ provider: next, settings: {} }) : undefined,
    })
  }

  /* Start generation */
  const handleStartGeneration = async () => {
    console.log("[PostersView] Starting generation...")

    try {
      const configRes = await fetch("/api/posters/config")
      if (!configRes.ok) {
        throw new Error(`Config fetch failed: ${configRes.status}`)
      }

      const posterConfig = await configRes.json()
      console.log("[PostersView] Loaded config:", posterConfig)

      const libs = libraries.filter((l) => posterConfig.librarySettings?.[l.key]?.provider === "stable-diffusion")

      console.log(
        "[PostersView] Libraries to process:",
        libs.map((l) => l.title),
      )

      if (libs.length === 0) {
        console.error("[PostersView] No libraries configured for Stable Diffusion")
        return
      }

      const newJobIds: string[] = []
      const jobMap: Record<string, string> = {}

      for (const lib of libs) {
        const libSettings = posterConfig.librarySettings?.[lib.key]
        const model = libSettings?.settings?.model
        const style = libSettings?.settings?.style

        if (!model || !style) {
          console.error(`[PostersView] Missing model/style for ${lib.title}. Skipping.`)
          continue
        }

        console.log(`[PostersView] Generating for ${lib.title} with model=${model}, style=${style}`)

        const res = await fetch("/api/posters/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryKey: lib.key,
            provider: "stable-diffusion",
            model, // Now sending model
            style, // Now sending style
          }),
        })

        if (!res.ok) {
          console.error(`[PostersView] Generate failed for ${lib.title}:`, res.status)
          const errorText = await res.text()
          console.error("[PostersView] Error response:", errorText)
          continue
        }

        const data = await res.json()
        console.log(`[PostersView] Generation started for ${lib.title}:`, data)

        newJobIds.push(data.jobId)
        jobMap[lib.key] = data.jobId
      }

      setActiveJobIds(newJobIds)
      setLibraryJobMap(jobMap)
      console.log("[PostersView] Jobs started:", newJobIds)
    } catch (err) {
      console.error("[PostersView] Generation failed:", err)
    }
  }

  // Convert hook tasks to GenerationTask format
  const generationTasks: GenerationTask[] = tasks.map((task) => {
    const library = libraries.find((l) => libraryJobMap[l.key] === task.id)
    return {
      id: task.id,
      jobId: task.id,
      libraryKey: task.libraryKey,
      libraryTitle: library?.title || task.libraryKey,
      status: task.status,
      totalItems: task.totalItems,
      completedItems: task.completedItems,
      failedItems: task.failedItems,
      currentItem: task.currentItem,
      progress: task.progress,
      provider: "stable-diffusion",
    }
  })

  /* Loading state */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  /* No libraries */
  if (libraries.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">No libraries found. Please configure your Plex connection.</p>
      </Card>
    )
  }

  /* Main UI */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Poster Management</h2>
        <p className="text-muted-foreground">Configure AI poster generation for your libraries</p>
      </div>

      {/* Library Configuration */}
      <div className="space-y-4">
        {libraries.map((library) => (
          <Card key={library.key} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{library.title}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{library.type}</span>
                  <span>•</span>
                  <span className="font-mono text-xs">Key: {library.key}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={activeProviders[library.key] === "stable-diffusion" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleProviderToggle(library.key, "stable-diffusion")}
                >
                  Stable Diffusion
                </Button>
                <Button
                  variant={activeProviders[library.key] === "fanart" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleProviderToggle(library.key, "fanart")}
                >
                  FanArt
                </Button>
                <Button
                  variant={activeProviders[library.key] === "tmdb" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleProviderToggle(library.key, "tmdb")}
                >
                  TMDB
                </Button>
              </div>
            </div>

            {activeProviders[library.key] && (
              <div className="mt-3 pt-3 border-t">
                <Badge variant="secondary">Active: {activeProviders[library.key]}</Badge>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Stable Diffusion Provider Settings */}
      {hasStableDiffusionSelected && (
        <StableDiffusionProvider
          libraries={libraries.filter((l) => activeProviders[l.key] === "stable-diffusion")}
          onStartGeneration={handleStartGeneration}
          isGenerating={isGenerating}
        />
      )}

      {/* Active Tasks */}
      {generationTasks.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Generation Progress</h3>

          {/* Overall stats */}
          <div className="mb-4 p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm font-bold">{isNaN(totalProgress) ? 0 : totalProgress}%</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground space-y-1">
              <div>Completed: {totalCompleted} items</div>
              {totalFailed > 0 && <div className="text-destructive">Failed: {totalFailed} items</div>}
            </div>
          </div>

          {/* Individual tasks */}
          <div className="space-y-4">
            {generationTasks.map((task) => {
              const taskData = tasks.find((t) => t.id === task.id)
              const displayProgress = isNaN(task.progress) ? 0 : task.progress

              return (
                <div key={task.id} className="space-y-2 p-4 border border-border rounded-lg bg-card/50">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.libraryTitle}</span>
                        <Badge
                          variant={
                            task.status === "completed"
                              ? "default"
                              : task.status === "failed"
                                ? "destructive"
                                : task.status === "paused"
                                  ? "secondary"
                                  : "outline"
                          }
                        >
                          {task.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">Library Key: {task.libraryKey}</p>
                    </div>
                    <span className="text-2xl font-bold">{displayProgress}%</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {task.completedItems} / {task.totalItems} items processed
                      {task.failedItems > 0 && ` (${task.failedItems} failed)`}
                      {taskData?.remainingItems !== undefined && ` • ${taskData.remainingItems} in queue`}
                    </span>
                  </div>

                  {taskData?.currentItem && taskData?.currentItemIndex && (
                    <div className="space-y-1 pt-2 border-t">
                      <p className="text-xs font-medium text-foreground">
                        Processing Item {taskData.currentItemIndex} of {task.totalItems}:
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{taskData.currentItem}</p>
                      {taskData.currentItemRatingKey && (
                        <p className="text-xs text-muted-foreground font-mono">
                          Rating Key: {taskData.currentItemRatingKey}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="w-full bg-secondary rounded-full h-2.5 mt-2">
                    <div
                      className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
