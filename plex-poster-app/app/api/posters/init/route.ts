// app/api/posters/init/route.ts
export const runtime = 'nodejs'

import { initPosterSystem, isInitialized } from "@/lib/posters/init"
import { getActiveJobs } from "@/lib/posters/queue"
import { NextResponse } from "next/server"

let initPromise: Promise<void> | null = null

export async function GET() {
  // If already initialized, return success immediately
  if (isInitialized()) {
    console.log("[Init API] System already initialized")
    
    try {
      const activeJobs = await getActiveJobs()
      return NextResponse.json({ 
        status: 'initialized', 
        success: true,
        alreadyInitialized: true,
        activeJobs: activeJobs.length,
        jobIds: activeJobs.map(j => j.jobId)
      })
    } catch (error) {
      // If we can't get active jobs, still report initialized
      return NextResponse.json({ 
        status: 'initialized', 
        success: true,
        alreadyInitialized: true
      })
    }
  }

  // If initialization is in progress, wait for it
  if (!initPromise) {
    console.log("[Init API] Starting poster system initialization...")
    initPromise = initPosterSystem().catch(err => {
      console.error("[Init API] Initialization failed:", err)
      initPromise = null // Allow retry on failure
      throw err
    })
  } else {
    console.log("[Init API] Initialization already in progress, waiting...")
  }
  
  try {
    await initPromise
    console.log("[Init API] Initialization completed successfully")
    
    // Get info about resumed jobs
    const activeJobs = await getActiveJobs()
    
    return NextResponse.json({ 
      status: 'initialized', 
      success: true,
      resumedJobs: activeJobs.length,
      jobIds: activeJobs.map(j => j.jobId)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error("[Init API] Initialization failed:", message)
    
    return NextResponse.json(
      { 
        status: 'error', 
        success: false,
        error: message
      },
      { status: 500 }
    )
  }
}

/**
 * POST - Force re-initialization (useful for debugging)
 */
export async function POST() {
  console.log("[Init API] Force re-initialization requested")
  
  // Reset the init promise to allow re-initialization
  initPromise = null
  
  try {
    await initPosterSystem()
    const activeJobs = await getActiveJobs()
    
    return NextResponse.json({ 
      status: 'reinitialized', 
      success: true,
      activeJobs: activeJobs.length,
      jobIds: activeJobs.map(j => j.jobId)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error("[Init API] Re-initialization failed:", message)
    
    return NextResponse.json(
      { 
        status: 'error', 
        success: false,
        error: message
      },
      { status: 500 }
    )
  }
}