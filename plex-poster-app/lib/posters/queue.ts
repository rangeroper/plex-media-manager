// lib/posters/queue.ts
// Job queue management for poster generation
import { cache } from "@/lib/redis-cache"
import { v4 as uuidv4 } from "uuid"

// Re-export PosterStorage for convenience
export { PosterStorage } from "./storage"

// Use separate prefix for poster jobs
const POSTER_PREFIX = "posters"

// Helper to get poster-prefixed keys
function getPosterKey(key: string): string {
  return `${POSTER_PREFIX}:${key}`
}

export interface QueueItem {
  itemId: string
  libraryKey: string
  ratingKey: string
  title?: string
  year?: string
  type?: string
  retries: number
  lastError?: string
}

export interface PosterJob {
  jobId: string
  libraryKey: string
  status: "pending" | "running" | "paused" | "completed" | "failed"
  progress: number
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  currentItemIndex?: number
  currentItemRatingKey?: string
  remainingItems?: number
  model: string
  style: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  pausedAt?: string
  errors: Array<{ ratingKey: string; title?: string; error: string }>
}

const MAX_RETRIES = 3 // This is now the only source of retry logic
const QUEUE_KEY = getPosterKey("queue")
const PROCESSING_KEY = getPosterKey("processing")

/**
 * Create a new poster generation job and enqueue all items
 */
export async function createPosterJob(
  libraryKey: string,
  items: Array<{ ratingKey: string; title?: string; year?: string; type?: string }>,
  model: string,
  style: string,
): Promise<PosterJob> {
  const jobId = uuidv4()

  const job: PosterJob = {
    jobId,
    libraryKey,
    status: "pending",
    progress: 0,
    totalItems: items.length,
    completedItems: 0,
    failedItems: 0,
    model,
    style,
    createdAt: new Date().toISOString(),
    errors: [],
  }

  // Save job
  await cache.set(getPosterKey(`job:${jobId}`), JSON.stringify(job))

  // Enqueue all items
  for (const item of items) {
    const queueItem: QueueItem = {
      itemId: uuidv4(),
      libraryKey,
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year,
      type: item.type,
      retries: 0,
    }

    await cache.set(getPosterKey(`queue-item:${jobId}:${queueItem.itemId}`), JSON.stringify(queueItem))
    // Add to queue (LPUSH = add to left, RPOP = remove from right = FIFO)
    await pushToQueue(jobId, queueItem.itemId)
  }

  console.log(`[Queue] Created job ${jobId} with ${items.length} items`)
  return job
}

/**
 * Get the next item from the queue
 */
export async function popFromQueue(jobId: string): Promise<QueueItem | null> {
  const redis = (cache as any).redis
  if (!redis) return null

  try {
    // RPOP removes from right (FIFO with LPUSH)
    const itemId = await redis.rpop(`${QUEUE_KEY}:${jobId}`)
    if (!itemId) return null

    const itemData = await cache.get<string>(getPosterKey(`queue-item:${jobId}:${itemId}`))
    if (!itemData) return null

    const item = JSON.parse(itemData) as QueueItem

    // Mark as processing
    await cache.set(getPosterKey(`${PROCESSING_KEY}:${jobId}`), JSON.stringify(item))

    return item
  } catch (error) {
    console.error("[Queue] Error popping from queue:", error)
    return null
  }
}

/**
 * Add item to queue
 */
async function pushToQueue(jobId: string, itemId: string): Promise<void> {
  const redis = (cache as any).redis
  if (!redis) return

  try {
    // LPUSH adds to left (FIFO with RPOP)
    await redis.lpush(`${QUEUE_KEY}:${jobId}`, itemId)
  } catch (error) {
    console.error("[Queue] Error pushing to queue:", error)
  }
}

/**
 * Get the count of remaining items in the queue for a specific job
 */
export async function getRemainingItemsCount(jobId: string): Promise<number> {
  const redis = (cache as any).redis
  if (!redis) return 0

  try {
    const length = await redis.llen(`${QUEUE_KEY}:${jobId}`)
    return length || 0
  } catch (error) {
    console.error("[Queue] Error getting remaining items count:", error)
    return 0
  }
}

/**
 * Mark current item as complete
 */
export async function completeItem(jobId: string, itemId: string): Promise<void> {
  // Remove from processing
  await cache.delete(getPosterKey(`${PROCESSING_KEY}:${jobId}`))

  // Delete queue item
  await cache.delete(getPosterKey(`queue-item:${jobId}:${itemId}`))

  // Update job stats
  const job = await getJob(jobId)
  if (job) {
    job.completedItems++
    job.currentItem = undefined
    job.progress = (job.completedItems / job.totalItems) * 100
    await saveJob(job)
  }

  console.log(`[Queue] Completed item ${itemId} for job ${jobId}`)
}

/**
 * Mark current item as failed and optionally retry
 */
export async function failItem(jobId: string, item: QueueItem, error: string): Promise<void> {
  item.retries++
  item.lastError = error

  if (item.retries < MAX_RETRIES) {
    // Re-queue for retry
    console.log(`[Queue] Retrying item ${item.ratingKey} (attempt ${item.retries}/${MAX_RETRIES})`)
    await cache.set(getPosterKey(`queue-item:${jobId}:${item.itemId}`), JSON.stringify(item))
    await pushToQueue(jobId, item.itemId)
  } else {
    // Max retries reached, mark as permanently failed
    console.error(`[Queue] Item ${item.ratingKey} failed after ${MAX_RETRIES} attempts`)

    const job = await getJob(jobId)
    if (job) {
      job.failedItems++
      job.errors.push({
        ratingKey: item.ratingKey,
        title: item.title,
        error: item.lastError || "Unknown error",
      })
      job.progress = (job.completedItems / job.totalItems) * 100
      await saveJob(job)
    }

    // Delete queue item
    await cache.delete(getPosterKey(`queue-item:${jobId}:${item.itemId}`))
  }

  // Remove from processing
  await cache.delete(getPosterKey(`${PROCESSING_KEY}:${jobId}`))
}

/**
 * Get job status
 */
export async function getJob(jobId: string): Promise<PosterJob | null> {
  const data = await cache.get<string>(getPosterKey(`job:${jobId}`))
  if (!data) return null
  return JSON.parse(data)
}

/**
 * Save job status
 */
export async function saveJob(job: PosterJob): Promise<void> {
  await cache.set(getPosterKey(`job:${job.jobId}`), JSON.stringify(job))
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId: string, status: PosterJob["status"]): Promise<void> {
  const job = await getJob(jobId)
  if (!job) return

  job.status = status

  if (status === "running" && !job.startedAt) {
    job.startedAt = new Date().toISOString()
  } else if (status === "paused") {
    job.pausedAt = new Date().toISOString()
  } else if (status === "completed" || status === "failed") {
    job.completedAt = new Date().toISOString()
  }

  await saveJob(job)
  console.log(`[Queue] Job ${jobId} status: ${status}`)
}

/**
 * Check if there are items in the queue
 */
export async function hasQueueItems(jobId: string): Promise<boolean> {
  const redis = (cache as any).redis
  if (!redis) return false

  try {
    const length = await redis.llen(`${QUEUE_KEY}:${jobId}`)
    return length > 0
  } catch (error) {
    console.error("[Queue] Error checking queue length:", error)
    return false
  }
}

/**
 * NEW: Check if there are any items remaining across ALL job queues.
 * Used by the worker to decide if the SD model can be safely unloaded.
 */
export async function checkAllQueuesEmpty(): Promise<boolean> {
  const redis = (cache as any).redis
  if (!redis) return true

  try {
    // 1. Get all keys matching the queue prefix for all jobs
    const allQueueKeys = await redis.keys(`${QUEUE_KEY}:*`)

    if (allQueueKeys.length === 0) {
      return true // No jobs were even created
    }

    // 2. Check the length of all queues simultaneously (if possible, or iterate)
    // Using a pipeline or Promise.all is more efficient than individual calls
    const pipeline = redis.pipeline()
    for (const key of allQueueKeys) {
      pipeline.llen(key) // Check the list length for each job's queue
    }

    const lengths = await pipeline.exec()

    // Check results. lengths is an array of [error, length] tuples
    for (const result of lengths) {
      const length = result[1] // The list length is the second element
      if (typeof length === "number" && length > 0) {
        // Found at least one item in one queue
        return false
      }
    }

    // If we checked all lists and found no items, the queues are empty.
    return true
  } catch (error) {
    console.error("[Queue] Error checking all queue lengths:", error)
    // Safe fallback: assume it's empty to allow unload if Redis is having issues.
    // Alternatively, return false to keep model loaded, depending on safety preference.
    // Returning true here is safer for resource use, but false is safer for availability.
    return true
  }
}

/**
 * Get currently processing item (for crash recovery)
 */
export async function getProcessingItem(jobId: string): Promise<QueueItem | null> {
  // ... (Remains unchanged)
  const data = await cache.get<string>(getPosterKey(`${PROCESSING_KEY}:${jobId}`))
  if (!data) return null
  return JSON.parse(data)
}

/**
 * Pause a job (will stop after current item completes)
// ... (Remains unchanged)
 */
export async function pauseJob(jobId: string): Promise<void> {
  await updateJobStatus(jobId, "paused")
}

/**
 * Resume a paused job
// ... (Remains unchanged)
 */
export async function resumeJob(jobId: string): Promise<void> {
  await updateJobStatus(jobId, "running")
}

/**
 * Get all active jobs (for recovery on startup)
// ... (Remains unchanged)
 */
export async function getActiveJobs(): Promise<PosterJob[]> {
  const keys = await cache.keys(getPosterKey("job:*"))
  const jobs: PosterJob[] = []

  for (const key of keys) {
    const data = await cache.get<string>(key)
    if (!data) continue

    const job = JSON.parse(data) as PosterJob
    if (job.status === "running" || job.status === "pending") {
      jobs.push(job)
    }
  }

  return jobs
}

/**
 * Get all jobs (including completed and failed)
 */
export async function getAllJobs(): Promise<PosterJob[]> {
  const keys = await cache.keys(getPosterKey("job:*"))
  const jobs: PosterJob[] = []

  for (const key of keys) {
    const data = await cache.get<string>(key)
    if (!data) continue

    const job = JSON.parse(data) as PosterJob
    jobs.push(job)
  }

  // Sort by creation date (newest first)
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
