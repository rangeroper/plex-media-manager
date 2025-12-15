// app/api/posters/jobs/route.ts
import { NextResponse } from "next/server"
import { getAllJobs } from "@/lib/posters/queue"

export const dynamic = "force-dynamic"

/**
 * GET - Fetch all jobs (active and historical)
 */
export async function GET() {
  try {
    const jobs = await getAllJobs()

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        jobId: job.jobId,
        libraryKey: job.libraryKey,
        status: job.status,
        model: job.model,
        style: job.style,
        totalItems: job.totalItems,
        completedItems: job.completedItems,
        failedItems: job.failedItems,
        currentItem: job.currentItem,
        currentItemIndex: job.currentItemIndex,
        currentItemRatingKey: job.currentItemRatingKey,
        remainingItems: job.remainingItems,
        progress: job.totalItems > 0 ? Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100) : 0,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        pausedAt: job.pausedAt,
        errorCount: job.errors.length,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[API] Failed to fetch jobs:`, message)
    return NextResponse.json({ error: "Failed to fetch jobs", message }, { status: 500 })
  }
}
