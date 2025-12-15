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
  getRemainingItemsCount, // <--- NEW: Import getRemainingItemsCount
} from "./queue" // PosterStorage is re-exported from queue.ts
import { PlexClient } from "@/lib/plex/client"
import { PlexStorage } from "@/lib/plex/storage"

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

      const remainingItems = await getRemainingItemsCount(jobId)
      const currentIndex = job.completedItems + job.failedItems + 1

      job.currentItem = item.title || item.ratingKey
      job.currentItemIndex = currentIndex
      job.currentItemRatingKey = item.ratingKey
      job.remainingItems = remainingItems
      await saveJob(job)

      console.log(
        `[Worker] Processing item ${currentIndex}/${job.totalItems}: ${item.title || item.ratingKey} (${item.ratingKey})`,
      )
      console.log(`[Worker] Queue status: ${remainingItems} items remaining`)

      try {
        console.log(`[Worker] Checking if model ${job.model} is downloaded...`)
        const modelsResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sd/models`,
        )
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json()
          const modelExists = modelsData.models.some((m: any) => m.key === job.model && m.downloaded)

          if (!modelExists) {
            console.log(`[Worker] Model ${job.model} not downloaded, downloading now...`)
            const downloadResponse = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sd/models/download`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: job.model }),
              },
            )

            if (!downloadResponse.ok) {
              const errorData = await downloadResponse.json().catch(() => ({}))
              console.error(`[Worker] Download failed:`, errorData)
              throw new Error(
                `Failed to download model ${job.model}: ${errorData.error || downloadResponse.statusText}`,
              )
            }

            const downloadResult = await downloadResponse.json()
            console.log(`[Worker] Model ${job.model} download response:`, downloadResult)

            // If already downloaded, skip waiting
            if (downloadResult.already_downloaded) {
              console.log(`[Worker] Model ${job.model} was already downloaded`)
            } else {
              console.log(`[Worker] Model ${job.model} download in progress, waiting for completion...`)
              // Wait for download to complete (poll status)
              let downloaded = false
              let attempts = 0
              while (!downloaded && attempts < 120) {
                // 10 minutes max (large models take time)
                await sleep(5000)
                const checkResponse = await fetch(
                  `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sd/models`,
                )
                if (checkResponse.ok) {
                  const checkData = await checkResponse.json()
                  downloaded = checkData.models.some((m: any) => m.key === job.model && m.downloaded)
                  if (!downloaded) {
                    console.log(`[Worker] Still downloading... (attempt ${attempts + 1}/120, checking again in 5s)`)
                  }
                }
                attempts++
              }

              if (!downloaded) {
                throw new Error(`Model ${job.model} download timed out after 10 minutes`)
              }
              console.log(`[Worker] Model ${job.model} successfully downloaded`)
            }
          } else {
            console.log(`[Worker] Model ${job.model} is already downloaded`)
          }
        }

        // Generate poster
        console.log(`[Worker] Generating poster with SD (model: ${job.model}, style: ${job.style})...`)
        const buffer = await generatePoster({
          model: job.model,
          style: job.style,
          libraryKey: item.libraryKey,
          plexRatingKey: item.ratingKey,
          title: item.title,
          year: item.year,
          type: item.type,
        })

        // Save poster to disk
        const posterPath = await PosterStorage.saveGeneratedPoster(item.libraryKey, item.ratingKey, buffer)
        console.log(`[Worker] Saved poster to disk: ${posterPath}`)

        try {
          console.log(`[Worker] Uploading poster to Plex for rating key: ${item.ratingKey}`)

          // Get Plex configuration
          const plexConfig = await PlexStorage.loadConfig()
          if (!plexConfig.authToken || !plexConfig.selectedServer?.url) {
            console.warn(`[Worker] Plex not configured, skipping upload to Plex`)
          } else {
            const plexClient = new PlexClient(plexConfig.authToken)
            const serverUrl = plexConfig.selectedServer.url

            // Upload the poster
            await plexClient.uploadPoster(serverUrl, item.ratingKey, buffer)
            console.log(`[Worker] ✓ Successfully uploaded poster to Plex for: ${item.title || item.ratingKey}`)
          }
        } catch (uploadError) {
          // Log but don't fail the job if upload fails
          const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError)
          console.error(`[Worker] ❌ Failed to upload poster to Plex (continuing anyway):`, uploadMessage)
        }

        // Mark as complete
        await completeItem(jobId, item.itemId)

        const updatedJob = await getJob(jobId)
        if (updatedJob) {
          const progress = Math.round(
            ((updatedJob.completedItems + updatedJob.failedItems) / updatedJob.totalItems) * 100,
          )
          console.log(
            `[Worker] Progress: ${progress}% (${updatedJob.completedItems} completed, ${updatedJob.failedItems} failed)`,
          )
        }
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

    console.log(`[Worker] Job ${jobId} finished: ${job.completedItems} completed, ${job.failedItems} failed`)
    // Note: The unload is handled by the processQueue loop's cleanup after the break.
  }
}

/**
 * NEW: Check if ALL job queues are empty and instruct the SD API to unload.
 * This ensures the model is only unloaded when all workers and queues are idle.
 */
export async function unloadSDModelIfQueueEmpty(): Promise<void> {
  console.log(`[Worker] Checking if model should be unloaded...`)

  const allQueuesEmpty = await checkAllQueuesEmpty()

  if (!allQueuesEmpty) {
    console.log(`[Worker] ℹ️  Global queue is NOT empty. Keeping model loaded for next job.`)
    return
  }

  const activeJobs = await getActiveJobs()
  const hasRunningJobs = activeJobs.some((j) => j.status === "running" || j.status === "pending")

  if (hasRunningJobs) {
    console.log(`[Worker] ℹ️  Found ${activeJobs.length} active jobs. Keeping model loaded.`)
    return
  }

  console.log(`[Worker] ✓ All queues empty and no active jobs. Unloading SD model from memory...`)
  const unloaded = await unloadSDModel()
  if (unloaded) {
    console.log(`[Worker] ✓ SD model successfully unloaded from GPU memory`)
  } else {
    console.error(`[Worker] ❌ Failed to unload SD model`)
  }
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
      startWorker(job.jobId).catch((err) => console.error(`[Worker] Failed to resume job ${job.jobId}:`, err))
    } else {
      console.log(`[Worker] Job ${job.jobId} has no items left, marking as completed`)
      await finishJob(job.jobId)
    }
  }
  // On startup, after checking all jobs, check if we need to unload (unlikely, but safe)
  // This helps if the app crashed after finishing a job but before unloading.
  if (activeJobs.length === 0) {
    await unloadSDModelIfQueueEmpty()
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
  return new Promise((resolve) => setTimeout(resolve, ms))
}
