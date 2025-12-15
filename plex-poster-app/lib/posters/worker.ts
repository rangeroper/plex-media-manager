// lib/posters/worker.ts
import path from "path"
import fs from "fs" // Keep if fs is needed elsewhere, or remove if only PosterStorage is used
import { generatePoster, loadSDModel, unloadSDModel } from "./stable-diffusion" 
import {
  popFromQueue,
  completeItem,
  failItem,
  getJob,
  updateJobStatus,
  hasQueueItems,
  getProcessingItem,
  getActiveJobs,
  saveJob,
  checkAllQueuesEmpty,
  PosterStorage, // <--- NEW: Import PosterStorage
} from "./queue" // PosterStorage is re-exported from queue.ts

let isWorkerRunning = false
let currentJobId: string | null = null

/**
 * Start the poster generation worker
 */
export async function startWorker(jobId: string): Promise<void> {
  if (isWorkerRunning) {
    console.log("[Worker] Already running, ignoring start request")
    return
  }

  isWorkerRunning = true
  currentJobId = jobId
  console.log(`[Worker] Starting for job ${jobId}`)

  // Check for crash recovery
  await recoverFromCrash(jobId)

  // Update job status
  await updateJobStatus(jobId, "running")

  // >>> LIFECYCLE STEP 1: LOAD MODEL <<<
  // Signal the SD API to load the model (or confirm it's loading)
  await loadSDModel()

  // Start processing loop
  processQueue(jobId)
}

/**
 * Stop the worker gracefully (finishes current item)
 */
export function stopWorker(): void {
  if (!isWorkerRunning) return
  
  console.log("[Worker] Stopping gracefully (will finish current item)...")
  isWorkerRunning = false
}

/**
 * Process the queue
 */
async function processQueue(jobId: string): Promise<void> {
  while (isWorkerRunning) {
    try {
      // Check if job is paused
      const job = await getJob(jobId)
      if (!job) {
        console.error(`[Worker] Job ${jobId} not found, stopping worker`)
        break
      }

      if (job.status === "paused") {
        console.log(`[Worker] Job ${jobId} is paused, stopping worker`)
        break
      }

      // Check if there are more items
      const hasItems = await hasQueueItems(jobId)
      if (!hasItems) {
        console.log(`[Worker] No more items in queue for job ${jobId}`)
        await finishJob(jobId)
        break
      }

      // Get next item
      const item = await popFromQueue(jobId)
      if (!item) {
        console.log(`[Worker] No item available, finishing job`)
        await finishJob(jobId)
        break
      }

      // Update current item in job
      job.currentItem = item.title || item.ratingKey
      await saveJob(job)

      console.log(`[Worker] Processing item: ${item.title || item.ratingKey} (${item.ratingKey})`)

      try {
        // Generate poster
        const buffer = await generatePoster({
          model: job.model,
          style: job.style,
          libraryKey: item.libraryKey,
          plexRatingKey: item.ratingKey,
          title: item.title,
          year: item.year,
          type: item.type,
        })

        // --- START MODIFIED BLOCK ---
        // Save poster to disk using the central PosterStorage utility.
        // This replaces the old, duplicative fs.mkdirSync/fs.writeFileSync block.
        const posterPath = await PosterStorage.saveGeneratedPoster(
          item.libraryKey,
          item.ratingKey,
          buffer
        )

        console.log(`[Worker] Saved poster: ${posterPath}`)
        // --- END MODIFIED BLOCK ---

        // Mark as complete
        await completeItem(jobId, item.itemId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[Worker] Failed to generate poster for ${item.ratingKey}:`, message)

        // Mark as failed (will retry if retries < MAX_RETRIES)
        await failItem(jobId, item, message)
      }

      // Small delay between items to avoid overwhelming the GPU
      await sleep(1000)
    } catch (error) {
      console.error("[Worker] Error in processing loop:", error)
      await sleep(5000) // Wait before retrying
    }
  }

  isWorkerRunning = false
  currentJobId = null
  console.log(`[Worker] Stopped for job ${jobId}`)
  
  // >>> LIFECYCLE STEP 3: UNLOAD MODEL ON WORKER STOP <<<
  // The worker has stopped for this specific job (either finished or paused).
  // Now, check the global queue status to see if the model can be safely unloaded.
  await unloadSDModelIfQueueEmpty() 
}

/**
 * Finish a job (all items processed)
 */
async function finishJob(jobId: string): Promise<void> {
  const job = await getJob(jobId)
  if (!job) return

  const allProcessed = job.completedItems + job.failedItems === job.totalItems

  if (allProcessed) {
    job.status = job.failedItems === job.totalItems ? "failed" : "completed"
    job.completedAt = new Date().toISOString()
    await saveJob(job)

    console.log(
      `[Worker] Job ${jobId} finished: ${job.completedItems} completed, ${job.failedItems} failed`
    )
    // Note: The unload is handled by the processQueue loop's cleanup after the break.
  }
}

/**
 * NEW: Check if ALL job queues are empty and instruct the SD API to unload.
 * This ensures the model is only unloaded when all workers and queues are idle.
 */
export async function unloadSDModelIfQueueEmpty(): Promise<void> {
  // Check if any item is still waiting in any job queue.
  const isAnyQueueActive = await checkAllQueuesEmpty()
  
  if (isAnyQueueActive) {
      console.log(`[Worker] Global queue is NOT empty. Keeping model loaded for next job.`)
      return
  }
  
  // Also check for any jobs marked as 'running' that haven't signaled completion yet
  const activeJobs = await getActiveJobs()
  const isJobRunningButNoQueue = activeJobs.length > 0 && !activeJobs.every(j => j.status === 'paused')
  
  if (isJobRunningButNoQueue) {
      console.log(`[Worker] Found ${activeJobs.length} active jobs without queue items (potentially paused or finishing). Keeping model loaded.`)
      return
  }

  // If no items are in any queue and no jobs are actively processing, we can unload.
  console.log(`[Worker] Global queue is empty and no active jobs detected. Sending UNLOAD signal.`)
  await unloadSDModel()
}


/**
 * Recover from crash - re-queue any item that was being processed
 */
async function recoverFromCrash(jobId: string): Promise<void> {
  const processingItem = await getProcessingItem(jobId)
  
  if (processingItem) {
    console.log(`[Worker] Recovering from crash, re-queuing item: ${processingItem.ratingKey}`)
    
    // Mark as failed with crash error, which will retry it
    await failItem(jobId, processingItem, "Process crashed or restarted")
  }
}


/**
 * Resume all incomplete jobs on server startup
 */
export async function resumeIncompleteJobs(): Promise<void> {
  console.log("[Worker] Checking for incomplete jobs on startup...")
  
  const activeJobs = await getActiveJobs()
  
  for (const job of activeJobs) {
    console.log(`[Worker] Found incomplete job: ${job.jobId} (${job.status})`)
    
    // Check if job has items left
    const hasItems = await hasQueueItems(job.jobId)
    
    if (hasItems) {
      console.log(`[Worker] Resuming job ${job.jobId}`)
      startWorker(job.jobId).catch(err =>
        console.error(`[Worker] Failed to resume job ${job.jobId}:`, err)
      )
    } else {
      console.log(`[Worker] Job ${job.jobId} has no items left, marking as completed`)
      await finishJob(job.jobId)
    }
  }
  // On startup, after checking all jobs, check if we need to unload (unlikely, but safe)
  // This helps if the app crashed after finishing a job but before unloading.
  if (activeJobs.length === 0) {
      await unloadSDModelIfQueueEmpty();
  }
}

/**
 * Check if worker is currently running
 */
export function isWorkerActive(): boolean {
  return isWorkerRunning
}

/**
 * Get current job ID being processed
 */
export function getCurrentJobId(): string | null {
  return currentJobId
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}