import { useState, useEffect, useRef } from "react"

export type JobStatus = "pending" | "running" | "completed" | "paused" | "error"

export interface PosterJob {
  jobId: string
  libraryKey: string
  plexRatingKey: string
  model: string
  style: string
  status: JobStatus
  totalItems: number
  processedItems: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface Task {
  id: string
  libraryTitle: string
  provider: "stable-diffusion"
  status: JobStatus
  totalItems: number
  processedItems: number
}

export function usePosterJobs(jobIds: string[], pollingInterval = 2000) {
  const [tasks, setTasks] = useState<Task[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize tasks with default pending state
  useEffect(() => {
    const initialTasks: Task[] = jobIds.map((jobId) => ({
      id: jobId,
      libraryTitle: jobId, // Replace with actual library name if available
      provider: "stable-diffusion",
      status: "pending",
      totalItems: 1,
      processedItems: 0,
    }))
    setTasks(initialTasks)
  }, [jobIds])

  // Poll job status
  useEffect(() => {
    async function fetchJobs() {
      const updatedTasks: Task[] = await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const res = await fetch(`/api/posters/generate/${jobId}`)
            const data = await res.json()
            if (data.success && data.job) {
              const job = data.job as PosterJob
              return {
                id: job.jobId,
                libraryTitle: job.plexRatingKey,
                provider: "stable-diffusion" as const,
                status: job.status,
                totalItems: job.totalItems,
                processedItems: job.processedItems,
              }
            }
          } catch (err) {
            console.error("Failed to fetch job", jobId, err)
          }
          // fallback to previous state if fetch fails
          const existing = tasks.find((t) => t.id === jobId)
          return existing || {
            id: jobId,
            libraryTitle: jobId,
            provider: "stable-diffusion" as const,
            status: "error" as JobStatus,
            totalItems: 1,
            processedItems: 0,
          }
        })
      )
      setTasks(updatedTasks)
    }

    // Initial fetch
    fetchJobs()

    // Polling
    intervalRef.current = setInterval(fetchJobs, pollingInterval)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobIds, pollingInterval, tasks])

  const isGenerating = tasks.some((t) => t.status === "running" || t.status === "pending")

  return { tasks, isGenerating }
}
