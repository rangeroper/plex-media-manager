// app/api/posters/jobs/[jobId]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getPosterJob } from "@/lib/posters/stable-diffusion/worker"
import { cache } from "@/lib/redis-cache"

export const dynamic = "force-dynamic"

// Fetch job status - handles both individual and master jobs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params // ← FIX: await the params
  
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
  }

  try {
    console.log(`[API] Fetching job status for: ${jobId}`)
    
    // Try to fetch as individual job first
    const job = await getPosterJob(jobId)
    
    if (job) {
      console.log(`[API] Found individual job ${jobId}:`, job.status)
      // Individual job
      return NextResponse.json({
        status: job.status,
        totalItems: job.totalItems,
        processedItems: job.processedItems,
        currentItem: job.currentItem,
        completedAt: job.completedAt,
        error: job.error,
      })
    }

    // Try to fetch as master job
    console.log(`[API] Checking for master job: ${jobId}`)
    const rawMasterJob = await cache.get<string>(`job:${jobId}`)
    
    if (!rawMasterJob) {
      console.error(`[API] Job ${jobId} not found in cache`)
      return NextResponse.json({ error: `Job ${jobId} not found` }, { status: 404 })
    }

    const masterJob = JSON.parse(rawMasterJob)
    console.log(`[API] Found master job with ${masterJob.individualJobs?.length || 0} individual jobs`)

    // Aggregate status from individual jobs
    let completedCount = 0
    let currentItem = ""
    let hasError = false

    for (const individualJobId of masterJob.individualJobs || []) {
      const individualJob = await getPosterJob(individualJobId)
      if (individualJob) {
        if (individualJob.status === "completed") {
          completedCount++
        } else if (individualJob.status === "error") {
          hasError = true
        } else if (individualJob.status === "running" && individualJob.currentItem) {
          currentItem = individualJob.currentItem
        }
      }
    }

    const allCompleted = completedCount === (masterJob.individualJobs?.length || 0)
    const status = hasError ? "error" : allCompleted ? "completed" : "running"

    console.log(`[API] Master job status: ${status}, ${completedCount}/${masterJob.totalItems} completed`)

    return NextResponse.json({
      status,
      totalItems: masterJob.totalItems,
      processedItems: completedCount,
      currentItem,
      completedAt: allCompleted ? new Date().toISOString() : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[API] Failed to fetch job ${jobId}:`, message, error)
    return NextResponse.json({ error: "Failed to fetch job", message }, { status: 500 })
  }
}