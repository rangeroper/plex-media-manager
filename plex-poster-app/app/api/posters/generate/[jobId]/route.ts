// app/api/posters/generate/[jobId]/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getJob, pauseJob, resumeJob } from "@/lib/posters/queue"
import { startWorker, isWorkerActive } from "@/lib/posters/worker"

export const dynamic = "force-dynamic"

/**
 * GET - Fetch job status
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
  }

  try {
    const job = await getJob(jobId)

    if (!job) {
      return NextResponse.json({ error: `Job ${jobId} not found` }, { status: 404 })
    }

    const progress =
      job.totalItems > 0 ? Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100) : 0

    return NextResponse.json({
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
      progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      pausedAt: job.pausedAt,
      errors: job.errors,
      isWorkerActive: isWorkerActive(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[API] Failed to fetch job ${jobId}:`, message)
    return NextResponse.json({ error: "Failed to fetch job", message }, { status: 500 })
  }
}

/**
 * POST - Control job (pause/resume)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { action } = body

    if (!action || !["pause", "resume"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Must be 'pause' or 'resume'" }, { status: 400 })
    }

    const job = await getJob(jobId)
    if (!job) {
      return NextResponse.json({ error: `Job ${jobId} not found` }, { status: 404 })
    }

    if (action === "pause") {
      if (job.status === "paused") {
        return NextResponse.json({
          message: "Job is already paused",
          status: job.status,
        })
      }

      if (job.status === "completed" || job.status === "failed") {
        return NextResponse.json(
          {
            error: `Cannot pause a ${job.status} job`,
            status: job.status,
          },
          { status: 400 },
        )
      }

      console.log(`[API] Pausing job ${jobId}`)
      await pauseJob(jobId)

      return NextResponse.json({
        message: "Job paused (will finish current item)",
        status: "paused",
      })
    } else if (action === "resume") {
      if (job.status !== "paused") {
        return NextResponse.json(
          {
            error: `Cannot resume a ${job.status} job. Only paused jobs can be resumed.`,
            status: job.status,
          },
          { status: 400 },
        )
      }

      console.log(`[API] Resuming job ${jobId}`)
      await resumeJob(jobId)

      // Check if worker is already running
      if (isWorkerActive()) {
        console.log(`[API] Worker already active, job will resume automatically`)
        return NextResponse.json({
          message: "Job resumed (worker already running)",
          status: "running",
        })
      }

      // Start worker
      startWorker(jobId).catch((err) => console.error(`[Worker] Failed to resume job ${jobId}:`, err))

      return NextResponse.json({
        message: "Job resumed and worker started",
        status: "running",
      })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[API] Failed to control job ${jobId}:`, message)
    return NextResponse.json({ error: "Failed to control job", message }, { status: 500 })
  }
}
