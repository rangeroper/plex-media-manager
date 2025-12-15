"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Trash2, HardDrive, Lock, RefreshCw, CheckCircle2, XCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface SDModel {
  key: string
  id: string
  downloaded: boolean
  loaded_in_memory: boolean
  requires_auth: boolean
  pipeline_class: string
}

interface ModelsResponse {
  models: SDModel[]
}

interface DownloadState {
  modelKey: string
  status: "downloading" | "complete" | "error"
  message?: string
}

const MODEL_NAMES: Record<string, string> = {
  "sd-3.5-large": "Stable Diffusion 3.5 Large",
  "sd-3.5-medium": "Stable Diffusion 3.5 Medium",
  "sdxl-turbo": "SDXL Turbo",
  "sd-1.5": "Stable Diffusion 1.5",
}

const MODEL_DESCRIPTIONS: Record<string, string> = {
  "sd-3.5-large": "Best quality, slowest generation. Requires gated model access.",
  "sd-3.5-medium": "Good quality, balanced performance. Requires gated model access.",
  "sdxl-turbo": "Fast generation, good quality. No authentication required.",
  "sd-1.5": "Classic model, fastest generation. Good for quick iterations.",
}

const DOWNLOAD_STATE_KEY = "sd-models-download-state"

export function ModelsView() {
  const [models, setModels] = useState<SDModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({})
  const [deletingModel, setDeletingModel] = useState<string | null>(null)
  const [unloading, setUnloading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(DOWNLOAD_STATE_KEY)
    if (stored) {
      try {
        setDownloadStates(JSON.parse(stored))
      } catch (e) {
        console.error("Failed to parse download states:", e)
      }
    }
  }, [])

  useEffect(() => {
    if (Object.keys(downloadStates).length > 0) {
      localStorage.setItem(DOWNLOAD_STATE_KEY, JSON.stringify(downloadStates))

      // Auto-cleanup completed/error states after delay
      const timer = setTimeout(() => {
        setDownloadStates((prev) => {
          const updated = { ...prev }
          let hasChanges = false

          for (const key in updated) {
            if (updated[key].status === "complete" || updated[key].status === "error") {
              delete updated[key]
              hasChanges = true
            }
          }

          return hasChanges ? updated : prev
        })
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [downloadStates])

  const fetchModels = async () => {
    try {
      setError(null)
      const response = await fetch("/api/sd/models")

      if (!response.ok) {
        throw new Error("Failed to fetch models")
      }

      const data: ModelsResponse = await response.json()
      setModels(data.models)

      setDownloadStates((prev) => {
        const updated = { ...prev }
        for (const model of data.models) {
          if (model.downloaded && updated[model.key]?.status === "downloading") {
            delete updated[model.key]
          }
        }
        return updated
      })
    } catch (err) {
      console.error("Error fetching models:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch models")
    } finally {
      setLoading(false)
    }
  }

  const downloadModel = async (modelKey: string) => {
    try {
      setDownloadStates((prev) => ({
        ...prev,
        [modelKey]: { modelKey, status: "downloading" },
      }))
      setError(null)

      const response = await fetch("/api/sd/models/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelKey }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to download model")
      }

      setDownloadStates((prev) => ({
        ...prev,
        [modelKey]: { modelKey, status: "complete" },
      }))

      await fetchModels()

      setTimeout(() => {
        setDownloadStates((prev) => {
          const updated = { ...prev }
          delete updated[modelKey]
          return updated
        })
      }, 3000)
    } catch (err) {
      console.error("Error downloading model:", err)
      const errorMsg = err instanceof Error ? err.message : "Failed to download model"
      setError(errorMsg)

      setDownloadStates((prev) => ({
        ...prev,
        [modelKey]: { modelKey, status: "error", message: errorMsg },
      }))
    }
  }

  const deleteModel = async (modelKey: string) => {
    if (
      !confirm(
        `Are you sure you want to delete ${MODEL_NAMES[modelKey]}? This will free up disk space but you'll need to download it again to use it.`,
      )
    ) {
      return
    }

    try {
      setDeletingModel(modelKey)
      setError(null)

      const response = await fetch("/api/sd/models/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelKey }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete model")
      }

      await fetchModels()
    } catch (err) {
      console.error("Error deleting model:", err)
      setError(err instanceof Error ? err.message : "Failed to delete model")
    } finally {
      setDeletingModel(null)
    }
  }

  const unloadModel = async () => {
    try {
      setUnloading(true)
      setError(null)

      const response = await fetch("/api/sd/unload", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to unload model")
      }

      await fetchModels()
    } catch (err) {
      console.error("Error unloading model:", err)
      setError(err instanceof Error ? err.message : "Failed to unload model")
    } finally {
      setUnloading(false)
    }
  }

  useEffect(() => {
    fetchModels()
  }, [])

  const loadedModel = models.find((m) => m.loaded_in_memory)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading models...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Model Management</h1>
          <p className="text-muted-foreground mt-1">
            Download and manage Stable Diffusion models for poster generation
          </p>
        </div>
        <Button onClick={fetchModels} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loadedModel && (
        <Alert>
          <HardDrive className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>{MODEL_NAMES[loadedModel.key]}</strong> is currently loaded in GPU memory
            </span>
            <Button onClick={unloadModel} disabled={unloading} size="sm" variant="outline">
              {unloading ? "Unloading..." : "Unload from Memory"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {models.map((model) => {
          const downloadState = downloadStates[model.key]
          const isDownloading = downloadState?.status === "downloading"

          return (
            <Card key={model.key} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold">{MODEL_NAMES[model.key] || model.key}</h3>
                    <div className="flex items-center gap-2">
                      {isDownloading ? (
                        <Badge variant="secondary" className="gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Downloading...
                        </Badge>
                      ) : model.downloaded ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Downloaded
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Not Downloaded
                        </Badge>
                      )}
                      {model.loaded_in_memory && (
                        <Badge variant="secondary" className="gap-1">
                          <HardDrive className="h-3 w-3" />
                          In GPU Memory
                        </Badge>
                      )}
                      {model.requires_auth && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
                          Gated Model
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{MODEL_DESCRIPTIONS[model.key] || ""}</p>
                  <p className="text-xs text-muted-foreground">Model ID: {model.id}</p>
                  {model.requires_auth && !model.downloaded && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                      Requires HUGGINGFACE_TOKEN environment variable to download
                    </p>
                  )}
                  {downloadState?.status === "error" && (
                    <p className="text-xs text-red-600 dark:text-red-500 mt-2">Error: {downloadState.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {!model.downloaded ? (
                    <Button onClick={() => downloadModel(model.key)} disabled={isDownloading}>
                      <Download className="h-4 w-4 mr-2" />
                      {isDownloading ? "Downloading..." : "Download"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => deleteModel(model.key)}
                      disabled={deletingModel === model.key || model.loaded_in_memory}
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deletingModel === model.key ? "Deleting..." : "Delete"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">About Model Management</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Models are downloaded to persistent storage and only loaded into GPU memory when needed</li>
          <li>• Gated models require a HuggingFace token with access permissions</li>
          <li>• Models are automatically loaded when generation starts and unloaded when all jobs complete</li>
          <li>• You can manually unload models to free GPU memory immediately</li>
        </ul>
      </div>
    </div>
  )
}
