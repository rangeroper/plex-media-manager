// middleware.ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

let initTriggered = false

export async function middleware(request: NextRequest) {
  // On first API request, trigger initialization
  if (!initTriggered && request.nextUrl.pathname.startsWith('/api/')) {
    initTriggered = true
    
    // Fire and forget - don't block the request
    const initUrl = new URL('/api/posters/init', request.url)
    fetch(initUrl)
      .catch(err => console.error("[Middleware] Init trigger failed:", err))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}