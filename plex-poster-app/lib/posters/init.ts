// lib/posters/init.ts
import { resumeIncompleteJobs } from "./worker"

let initialized = false
let initializationError: Error | null = null

/**
 * Initialize the poster generation system
 * Call this once when your Next.js app starts
 */
export async function initPosterSystem(): Promise<void> {
  if (initialized) {
    console.log("[PosterSystem] Already initialized")
    return
  }

  console.log("[PosterSystem] Initializing...")

  try {
    // Resume any incomplete jobs from previous session
    await resumeIncompleteJobs()
    
    initialized = true
    initializationError = null
    console.log("[PosterSystem] Initialization complete")
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    initializationError = err
    console.error("[PosterSystem] Initialization failed:", err)
    // Don't set initialized = true on failure
    throw err
  }
}

/**
 * Check if system is initialized
 */
export function isInitialized(): boolean {
  return initialized
}

/**
 * Get initialization error if any
 */
export function getInitializationError(): Error | null {
  return initializationError
}

/**
 * Reset initialization state (useful for testing or recovery)
 */
export function resetInitialization(): void {
  initialized = false
  initializationError = null
  console.log("[PosterSystem] Initialization state reset")
}