import { useState, useEffect, useRef } from "react"

export type JobStatus = "pending" | "running" | "completed" | "paused" | "failed"

export interface PosterJobStatus {
  jobId: string
  status: JobStatus
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  progress: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  errors: Array<{
    ratingKey: string
    title?: string
    error: string
  }>
}

export interface Task {
  id: string
  libraryKey: string
  libraryTitle?: string
  provider: "stable-diffusion"
  status: JobStatus
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  progress: number
  errors: Array<{
    ratingKey: string
    title?: string
    error: string
  }>
}

interface UsePosterJobsOptions {
  pollingInterval?: number
  stopOnComplete?: boolean
}

export function usePosterJobs(
  jobIds: string[],
  options: UsePosterJobsOptions = {}
) {
  const { pollingInterval = 2000, stopOnComplete = true } = options
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch job statuses
  useEffect(() => {
    if (jobIds.length === 0) {
      setTasks([])
      setIsLoading(false)
      return
    }

    async function fetchJobs() {
      const updatedTasks: Task[] = await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const res = await fetch(`/api/posters/generate/${jobId}`)
            
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`)
            }

            const data = await res.json() as PosterJobStatus

            return {
              id: data.jobId,
              libraryKey: data.jobId, // You may want to store libraryKey when creating job
              provider: "stable-diffusion" as const,
              status: data.status,
              totalItems: data.totalItems,
              completedItems: data.completedItems,
              failedItems: data.failedItems,
              currentItem: data.currentItem,
              progress: data.progress,
              errors: data.errors || [],
            }
          } catch (err) {
            console.error(`Failed to fetch job ${jobId}:`, err)
            
            // Return error state
            return {
              id: jobId,
              libraryKey: jobId,
              provider: "stable-diffusion" as const,
              status: "failed" as JobStatus,
              totalItems: 0,
              completedItems: 0,
              failedItems: 0,
              progress: 0,
              errors: [{ ratingKey: jobId, error: "Failed to fetch job status" }],
            }
          }
        })
      )
      
      setTasks(updatedTasks)
      setIsLoading(false)

      // Stop polling if all jobs are done and stopOnComplete is true
      if (stopOnComplete) {
        const allDone = updatedTasks.every(
          (t) => t.status === "completed" || t.status === "failed"
        )
        if (allDone && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    // Initial fetch
    fetchJobs()

    // Start polling
    intervalRef.current = setInterval(fetchJobs, pollingInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobIds, pollingInterval, stopOnComplete])

  const isGenerating = tasks.some(
    (t) => t.status === "running" || t.status === "pending"
  )

  const totalProgress = tasks.length > 0
    ? Math.round(
        tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
      )
    : 0

  const totalCompleted = tasks.reduce((sum, t) => sum + t.completedItems, 0)
  const totalFailed = tasks.reduce((sum, t) => sum + t.failedItems, 0)
  const totalItems = tasks.reduce((sum, t) => sum + t.totalItems, 0)

  return {
    tasks,
    isGenerating,
    isLoading,
    totalProgress,
    totalCompleted,
    totalFailed,
    totalItems,
  }
}

/**
 * Hook for controlling a single job (pause/resume)
 */
export function usePosterJobControl(jobId: string) {
  const [isControlling, setIsControlling] = useState(false)

  const pauseJob = async () => {
    setIsControlling(true)
    try {
      const res = await fetch(`/api/posters/generate/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      })

      if (!res.ok) {
        throw new Error(`Failed to pause job: ${res.status}`)
      }

      return await res.json()
    } catch (error) {
      console.error("Failed to pause job:", error)
      throw error
    } finally {
      setIsControlling(false)
    }
  }

  const resumeJob = async () => {
    setIsControlling(true)
    try {
      const res = await fetch(`/api/posters/generate/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      })

      if (!res.ok) {
        throw new Error(`Failed to resume job: ${res.status}`)
      }

      return await res.json()
    } catch (error) {
      console.error("Failed to resume job:", error)
      throw error
    } finally {
      setIsControlling(false)
    }
  }

  return {
    pauseJob,
    resumeJob,
    isControlling,
  }
}