import { type NextRequest, NextResponse } from "next/server"
import { deleteJob, getJob } from "@/lib/posters/queue"
import { stopWorker, getCurrentJobId } from "@/lib/posters/worker"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params

    const job = await getJob(jobId)

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error("[API] Failed to fetch job:", error)
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params

    console.log(`[API] Deleting job: ${jobId}`)

    // Check if this job is currently running
    const currentJobId = getCurrentJobId()
    if (currentJobId === jobId) {
      console.log(`[API] Job ${jobId} is currently running, stopping worker...`)
      stopWorker()

      // Signal the SD API to cancel the current generation
      try {
        const sdApiUrl = process.env.SD_API_URL || "http://sd-api:9090"
        await fetch(`${sdApiUrl}/cancel`, { method: "POST" })
        console.log(`[API] Sent cancel signal to SD API`)
      } catch (error) {
        console.error(`[API] Failed to cancel SD generation:`, error)
      }
    }

    // Delete the job from storage
    await deleteJob(jobId)

    console.log(`[API] Job ${jobId} deleted successfully`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Failed to delete job:", error)
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 })
  }
}
