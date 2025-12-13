"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StableDiffusionProvider } from "../posters/ai/stable-diffusion/stable-diffusion-provider"

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
  status: "pending" | "running" | "completed" | "paused" | "error"
  totalItems: number
  processedItems: number
  currentItem?: string
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

export function PostersView({
  plexUrl,
  plexToken,
  libraries = [],
}: PostersViewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [activeProviders, setActiveProviders] = useState<Record<string, ProviderType>>({})

  const hasStableDiffusionSelected = Object.values(activeProviders).includes("stable-diffusion")

  /* Load provider settings */
  useEffect(() => {
    async function loadProviderSettings() {
      setIsLoading(true)
      const providers: Record<string, ProviderType> = {}

      for (const library of libraries) {
        try {
          const res = await fetch(`/api/posters/library/${library.key}`)
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

    setActiveProviders(prev => {
      const copy = { ...prev }
      next ? (copy[libraryKey] = next) : delete copy[libraryKey]
      return copy
    })

    await fetch(`/api/posters/library/${libraryKey}`, {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: next ? JSON.stringify({ provider: next, settings: {} }) : undefined,
    })
  }

  /* Start generation - FIXED */
  const handleStartGeneration = async () => {
    console.log('[PostersView] Starting generation...')
    setIsGenerating(true)
    setShowProgress(true)

    try {
      const configRes = await fetch("/api/posters/config")
      if (!configRes.ok) {
        throw new Error(`Config fetch failed: ${configRes.status}`)
      }
      
      const posterConfig = await configRes.json()
      console.log('[PostersView] Loaded config:', posterConfig)

      const libs = libraries.filter(
        l => posterConfig.librarySettings?.[l.key]?.provider === "stable-diffusion"
      )

      console.log('[PostersView] Libraries to process:', libs.map(l => l.title))

      if (libs.length === 0) {
        console.error('[PostersView] No libraries configured for Stable Diffusion')
        setIsGenerating(false)
        return
      }

      const initialTasks: GenerationTask[] = []

      for (const lib of libs) {
        const settings = posterConfig.librarySettings[lib.key]?.settings || {}
        console.log(`[PostersView] Generating for ${lib.title} with settings:`, settings)

        const res = await fetch("/api/posters/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryKey: lib.key,
            provider: "stable-diffusion",
          }),
        })

        if (!res.ok) {
          console.error(`[PostersView] Generate failed for ${lib.title}:`, res.status)
          const errorText = await res.text()
          console.error('[PostersView] Error response:', errorText)
          continue
        }

        const data = await res.json()
        console.log(`[PostersView] Generation started for ${lib.title}:`, data)

        initialTasks.push({
          id: `task-${data.jobId}`,
          jobId: data.jobId,
          libraryKey: lib.key,
          libraryTitle: lib.title,
          status: "running",
          totalItems: 0,
          processedItems: 0,
          provider: "stable-diffusion",
        })
      }

      setTasks(initialTasks)
      console.log('[PostersView] Initial tasks created:', initialTasks)
    } catch (err) {
      console.error("[PostersView] Generation failed:", err)
      setIsGenerating(false)
    }
  }

  /* Poll job status */
  useEffect(() => {
    if (!showProgress || tasks.length === 0) return

    let cancelled = false

    const pollJobs = async () => {
      try {
        const updatedTasks = await Promise.all(
          tasks.map(async task => {
            if (!task.jobId || (task.status !== "running" && task.status !== "pending")) return task

            try {
              const res = await fetch(`/api/posters/jobs/${task.jobId}`)
              if (!res.ok) return task

              const data = await res.json()

              return {
                ...task,
                status: data.status,
                totalItems: data.totalItems ?? task.totalItems,
                processedItems: data.processedItems ?? task.processedItems,
                currentItem: data.currentItem,
                completedAt: data.completedAt,
              }
            } catch {
              return task
            }
          })
        )

        if (!cancelled) {
          setTasks(updatedTasks)
          
          // Check if all tasks are done
          const allDone = updatedTasks.every(t => 
            t.status === "completed" || t.status === "error"
          )
          if (allDone) {
            setIsGenerating(false)
          }
        }
      } catch (err) {
        console.error("Polling failed:", err)
      }
    }

    const interval = setInterval(pollJobs, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [showProgress, tasks])

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

  /* Main UI - ALWAYS VISIBLE */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Poster Management</h2>
        <p className="text-muted-foreground">Configure AI poster generation for your libraries</p>
      </div>

      {/* Library Configuration */}
      <div className="space-y-4">
        {libraries.map(library => (
          <Card key={library.key} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{library.title}</h3>
                <p className="text-sm text-muted-foreground">{library.type}</p>
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
                <Badge variant="secondary">
                  Active: {activeProviders[library.key]}
                </Badge>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Stable Diffusion Provider Settings */}
      {hasStableDiffusionSelected && (
        <StableDiffusionProvider
          libraries={libraries.filter(l => activeProviders[l.key] === "stable-diffusion")}
          onStartGeneration={handleStartGeneration}
          isGenerating={isGenerating}
        />
      )}

      {/* Active Tasks */}
      {tasks.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Generation Progress</h3>
          <div className="space-y-4">
            {tasks.map(task => (
              <div key={task.id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{task.libraryTitle}</span>
                  <Badge variant={
                    task.status === "completed" ? "default" :
                    task.status === "error" ? "destructive" :
                    "secondary"
                  }>
                    {task.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {task.processedItems} / {task.totalItems} items
                  </span>
                  <span>
                    {task.totalItems
                      ? Math.round((task.processedItems / task.totalItems) * 100)
                      : 0}%
                  </span>
                </div>
                {task.currentItem && (
                  <p className="text-xs text-muted-foreground">
                    Current: {task.currentItem}
                  </p>
                )}
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${task.totalItems ? (task.processedItems / task.totalItems) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Debug Info */}
      <Card className="p-4 bg-muted">
        <details>
          <summary className="cursor-pointer text-sm font-medium">Debug Info</summary>
          <pre className="mt-2 text-xs overflow-auto">
            {JSON.stringify({ 
              libraries: libraries.length,
              libraryKeys: libraries.map(l => l.key),
              activeProviders,
              isGenerating,
              tasksCount: tasks.length,
              plexUrl: plexUrl ? "configured" : "missing"
            }, null, 2)}
          </pre>
        </details>
      </Card>
    </div>
  )
}