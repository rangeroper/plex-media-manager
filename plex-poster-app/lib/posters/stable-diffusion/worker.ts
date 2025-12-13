// lib/posters/stable-diffusion/worker.ts
import path from "path"
import fs from "fs"
import { v4 as uuidv4 } from "uuid"
import { generatePoster } from "./stable-diffusion"
import { cache } from "@/lib/redis-cache"

export interface PosterJob {
  jobId: string
  libraryKey: string
  plexRatingKey: string
  model: string
  style: string
  status: "pending" | "running" | "completed" | "error"
  totalItems: number
  processedItems: number
  currentItem?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
}

/* -------------------------------------------------------------
   Create Job
------------------------------------------------------------- */
export async function createPosterJob(
  libraryKey: string,
  plexRatingKey: string,
  model: string,
  style: string
): Promise<PosterJob> {
  const job: PosterJob = {
    jobId: uuidv4(),
    libraryKey,
    plexRatingKey,
    model,
    style,
    status: "pending",
    totalItems: 1,
    processedItems: 0,
    createdAt: new Date().toISOString(),
  }

  await cache.set(`job:${job.jobId}`, JSON.stringify(job))
  return job
}

/* -------------------------------------------------------------
   Run Job
------------------------------------------------------------- */
export async function runPosterJob(job: PosterJob) {
  try {
    job.status = "running"
    job.startedAt = new Date().toISOString()
    await cache.set(`job:${job.jobId}`, JSON.stringify(job))

    const posterDir = path.join(
      process.cwd(),
      "data/posters",
      job.libraryKey,
      job.plexRatingKey
    )

    fs.mkdirSync(posterDir, { recursive: true })

    // Generate poster via SD API
    const buffer = await generatePoster({
      model: job.model,
      style: job.style,
      libraryKey: job.libraryKey,
      plexRatingKey: job.plexRatingKey,
    })

    // Save poster
    fs.writeFileSync(path.join(posterDir, "poster.png"), buffer)

    // Update job
    job.processedItems = 1
    job.status = "completed"
    job.completedAt = new Date().toISOString()

    await cache.set(`job:${job.jobId}`, JSON.stringify(job))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    job.status = "error"
    job.error = message
    await cache.set(`job:${job.jobId}`, JSON.stringify(job))
  }
}

/* -------------------------------------------------------------
   Fetch Job
------------------------------------------------------------- */
export async function getPosterJob(jobId: string): Promise<PosterJob | null> {
  const raw = await cache.get<string>(`job:${jobId}`)
  return raw ? JSON.parse(raw) : null
}
