"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Pause, Play, Clock, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react"
import { usePosterJobControl } from "@/hooks/usePosterJobs"
import { formatDistanceToNow } from "date-fns"

interface Job {
  jobId: string
  libraryKey: string
  status: "pending" | "running" | "completed" | "paused" | "failed"
  model: string
  style: string
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  currentItemIndex?: number
  currentItemRatingKey?: string
  remainingItems?: number
  progress: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  pausedAt?: string
  errorCount: number
}

interface JobsViewProps {
  libraries: Array<{ key: string; title: string }>
}

export function JobsView({ libraries }: JobsViewProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch jobs
  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch("/api/posters/jobs")
        if (res.ok) {
          const data = await res.json()
          setJobs(data.jobs || [])
        }
      } catch (error) {
        console.error("Failed to fetch jobs:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchJobs()

    // Poll for updates every 3 seconds
    const interval = setInterval(fetchJobs, 3000)
    return () => clearInterval(interval)
  }, [refreshKey])

  const getLibraryTitle = (libraryKey: string) => {
    const library = libraries.find((lib) => lib.key === libraryKey)
    return library?.title || libraryKey
  }

  const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "pending" || j.status === "paused")
  const completedJobs = jobs.filter((j) => j.status === "completed" || j.status === "failed")

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Job History</h2>
        <p className="text-muted-foreground">Monitor active and past poster generation jobs</p>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Active Jobs</h3>
          {activeJobs.map((job) => (
            <JobCard
              key={job.jobId}
              job={job}
              libraryTitle={getLibraryTitle(job.libraryKey)}
              onUpdate={() => setRefreshKey((k) => k + 1)}
            />
          ))}
        </div>
      )}

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Completed Jobs</h3>
          {completedJobs.map((job) => (
            <JobCard key={job.jobId} job={job} libraryTitle={getLibraryTitle(job.libraryKey)} />
          ))}
        </div>
      )}

      {jobs.length === 0 && (
        <Card className="p-12 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No jobs yet. Start a poster generation to see it here.</p>
        </Card>
      )}
    </div>
  )
}

function JobCard({ job, libraryTitle, onUpdate }: { job: Job; libraryTitle: string; onUpdate?: () => void }) {
  const { pauseJob, resumeJob, isControlling } = usePosterJobControl(job.jobId)
  const [isDeleting, setIsDeleting] = useState(false)

  const handlePauseResume = async () => {
    try {
      if (job.status === "running") {
        await pauseJob()
      } else if (job.status === "paused") {
        await resumeJob()
      }
      onUpdate?.()
    } catch (error) {
      console.error("Failed to control job:", error)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete this job? This will cancel any ongoing generation.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/posters/jobs/${job.jobId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete job")
      }

      onUpdate?.()
    } catch (error) {
      console.error("Failed to delete job:", error)
      alert("Failed to delete job. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  const getStatusIcon = () => {
    switch (job.status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />
      case "failed":
        return <XCircle className="h-4 w-4" />
      case "paused":
        return <Pause className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusBadge = () => {
    const variant =
      job.status === "completed"
        ? "default"
        : job.status === "failed"
          ? "destructive"
          : job.status === "paused"
            ? "secondary"
            : "outline"

    return (
      <Badge variant={variant} className="gap-1.5">
        {getStatusIcon()}
        {job.status}
      </Badge>
    )
  }

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return "N/A"
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return "N/A"
    }
  }

  return (
    <Card className="p-4">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h4 className="font-semibold">{libraryTitle}</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Model: {job.model}</span>
              <span>•</span>
              <span>Style: {job.style}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {(job.status === "running" || job.status === "paused") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseResume}
                disabled={isControlling}
                className="gap-2 bg-transparent"
              >
                {job.status === "running" ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2 bg-transparent text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>

        {/* Progress */}
        {job.status !== "completed" && job.status !== "failed" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {job.completedItems} / {job.totalItems} items
                {job.failedItems > 0 && ` (${job.failedItems} failed)`}
                {job.remainingItems !== undefined && ` • ${job.remainingItems} in queue`}
              </span>
              <span className="font-medium">{job.progress}%</span>
            </div>
            {job.currentItem && job.currentItemIndex && (
              <p className="text-xs text-muted-foreground">
                Processing [{job.currentItemIndex}/{job.totalItems}]: {job.currentItem}
                {job.currentItemRatingKey && ` (${job.currentItemRatingKey})`}
              </p>
            )}
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>Created {formatTimestamp(job.createdAt)}</span>
          {job.startedAt && <span>Started {formatTimestamp(job.startedAt)}</span>}
          {job.completedAt && <span>Completed {formatTimestamp(job.completedAt)}</span>}
          {job.errorCount > 0 && <span className="text-destructive">{job.errorCount} errors</span>}
        </div>
      </div>
    </Card>
  )
}
