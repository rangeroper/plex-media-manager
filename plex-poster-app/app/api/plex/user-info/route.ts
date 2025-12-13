import { type NextRequest, NextResponse } from "next/server"
import { PlexAuth } from "@/lib/plex/auth"
import { PlexClient } from "@/lib/plex/client"

// Generate a consistent client identifier
const CLIENT_ID = "plex-poster-manager-" + Math.random().toString(36).substring(2, 15)

export async function POST(request: NextRequest) {
  try {
    const { authToken } = await request.json()

    if (!authToken) {
      return NextResponse.json({ error: "Auth token required" }, { status: 400 })
    }

    const user = await PlexAuth.getUserInfo(authToken)

    const plexClient = new PlexClient(authToken)
    const servers = await plexClient.discoverServers()

    console.log("[v0] Discovered servers:", JSON.stringify(servers, null, 2))

    const formattedServers = servers.map((server) => {
      console.log(`[v0] Processing server: ${server.name}`)
      console.log(`[v0] Raw URLs for ${server.name}:`, server.urls)

      // Prioritize URLs: local network (192.168, 10.0) > remote > Docker internal (172.x)
      const localNetworkUrl =
        server.urls.find(
          (url) =>
            url.includes("192-168-") || url.includes("10-0-") || url.includes("192.168.") || url.includes("10.0."),
        ) || null

      const dockerUrl =
        server.urls.find((url) => url.includes("172-") && !url.includes("192-168-") && !url.includes("10-0-")) || null

      const remoteUrl =
        server.urls.find(
          (url) =>
            !url.includes("192-168-") &&
            !url.includes("10-0-") &&
            !url.includes("192.168.") &&
            !url.includes("10.0.") &&
            !url.includes("172-"),
        ) || null

      // Primary URL should be the best option
      const primaryUrl = localNetworkUrl || remoteUrl || dockerUrl || server.urls[0] || null

      console.log(`[v0] URL Selection for ${server.name}:`)
      console.log(`  - Local Network: ${localNetworkUrl}`)
      console.log(`  - Remote: ${remoteUrl}`)
      console.log(`  - Docker: ${dockerUrl}`)
      console.log(`  - Primary (selected): ${primaryUrl}`)

      return {
        name: server.name,
        machineIdentifier: server.machineIdentifier,
        primaryUrl,
        localUrl: localNetworkUrl,
        remoteUrl,
        connections: server.urls.map((url) => ({ uri: url })),
      }
    })

    console.log("[v0] Formatted servers being returned:", JSON.stringify(formattedServers, null, 2))

    return NextResponse.json({
      user,
      servers: formattedServers,
    })
  } catch (error: any) {
    console.error("[v0] User info error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch user info" }, { status: 500 })
  }
}
