import type { PlexServer, PlexLibrary, PlexItem, PlexCollection } from "./types"
import { PlexStorage } from "./storage"
import { PlexAuth } from "./auth"

export class PlexClient {
  private authToken: string
  private clientId: string

  constructor(authToken: string) {
    this.authToken = authToken
    this.clientId = PlexAuth.getClientId()
  }

  static async fromStorage(): Promise<PlexClient | null> {
    const config = await PlexStorage.loadConfig()
    if (config.authToken) {
      return new PlexClient(config.authToken)
    }
    return null
  }

  async discoverServers(): Promise<PlexServer[]> {
    const response = await fetch(
      `https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&X-Plex-Client-Identifier=${this.clientId}`,
      {
        headers: {
          Accept: "application/json",
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
        },
      },
    )

    if (!response.ok) {
      throw new Error("Failed to fetch servers")
    }

    const resources = await response.json()
    const servers = resources
      .filter((resource: any) => resource.provides === "server")
      .map((server: any) => ({
        name: server.name,
        machineIdentifier: server.clientIdentifier,
        urls: this.extractServerUrls(server.connections),
        owned: server.owned === 1,
        version: server.productVersion,
      }))

    return servers
  }

  private extractServerUrls(connections: any[]): string[] {
    const sortedConnections = connections.sort((a, b) => {
      // Prioritize local network IPs over Docker/relay
      const aIsLocal = a.address.startsWith("192.168.") || a.address.startsWith("10.") || a.address.startsWith("172.")
      const bIsLocal = b.address.startsWith("192.168.") || b.address.startsWith("10.") || b.address.startsWith("172.")

      if (aIsLocal && !bIsLocal) return -1
      if (!aIsLocal && bIsLocal) return 1
      if (a.local === 1 && b.local !== 1) return -1
      if (a.local !== 1 && b.local === 1) return 1
      return 0
    })

    return sortedConnections.map((conn) => conn.uri)
  }

  async testConnection(url: string, timeout = 5000): Promise<boolean> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${url}/?X-Plex-Token=${this.authToken}`, {
        headers: {
          Accept: "application/json",
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      clearTimeout(timeoutId)
      return false
    }
  }

  async findWorkingConnection(urls: string[]): Promise<string | null> {
    const config = await PlexStorage.loadConfig()
    if (config.selectedServer?.url) {
      console.log(`[v0] Trying cached URL: ${config.selectedServer.url}`)
      const cached = urls.find((url) => url === config.selectedServer?.url)
      if (cached && (await this.testConnection(cached))) {
        console.log(`[v0] Cached URL works: ${cached}`)
        return cached
      }
      console.log(`[v0] Cached URL failed or not in list`)
    }

    console.log(`[v0] Testing ${urls.length} URLs in parallel`)
    const tests = urls.map(async (url) => {
      const works = await this.testConnection(url)
      console.log(`[v0] URL ${url}: ${works ? "SUCCESS" : "FAILED"}`)
      return { url, works }
    })

    const results = await Promise.all(tests)
    const working = results.find((r) => r.works)

    if (working) {
      console.log(`[v0] Found working URL: ${working.url}`)
      await PlexStorage.updateConfig({
        selectedServer: {
          ...config.selectedServer!,
          url: working.url,
        },
      })
      return working.url
    }

    console.log(`[v0] No working URLs found`)
    return null
  }

  async getLibraries(serverUrl: string): Promise<PlexLibrary[]> {
    const response = await fetch(`${serverUrl}/library/sections?X-Plex-Token=${this.authToken}`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": this.authToken,
        "X-Plex-Client-Identifier": this.clientId,
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error("Failed to fetch libraries")
    }

    const data = await response.json()
    return data.MediaContainer.Directory || []
  }

  async getLibraryItems(
    serverUrl: string,
    libraryKey: string,
    options?: { offset?: number; limit?: number },
  ): Promise<{ items: PlexItem[]; totalSize: number }> {
    const { offset = 0, limit = 100 } = options || {}
    const url = `${serverUrl}/library/sections/${libraryKey}/all?X-Plex-Token=${this.authToken}&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${limit}`

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": this.authToken,
        "X-Plex-Client-Identifier": this.clientId,
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error("Failed to fetch library items")
    }

    const data = await response.json()
    return {
      items: data.MediaContainer.Metadata || [],
      totalSize: data.MediaContainer.totalSize || 0,
    }
  }

  getImageUrl(serverUrl: string, path: string): string {
    if (!path) return ""
    return `${serverUrl}${path}?X-Plex-Token=${this.authToken}`
  }

  async getCollections(serverUrl: string, libraryKey?: string): Promise<PlexCollection[]> {
    const url = libraryKey
      ? `${serverUrl}/library/sections/${libraryKey}/collections?X-Plex-Token=${this.authToken}`
      : `${serverUrl}/library/collections?X-Plex-Token=${this.authToken}`

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": this.authToken,
        "X-Plex-Client-Identifier": this.clientId,
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error("Failed to fetch collections")
    }

    const data = await response.json()
    return data.MediaContainer.Metadata || []
  }

  async getCollectionItems(serverUrl: string, collectionKey: string): Promise<PlexItem[]> {
    const response = await fetch(`${serverUrl}${collectionKey}?X-Plex-Token=${this.authToken}`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": this.authToken,
        "X-Plex-Client-Identifier": this.clientId,
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error("Failed to fetch collection items")
    }

    const data = await response.json()
    return data.MediaContainer.Metadata || []
  }

  async getItemMetadata(serverUrl: string, ratingKey: string): Promise<any> {
    try {
      const url = `${serverUrl}/library/metadata/${ratingKey}?X-Plex-Token=${this.authToken}`
      
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`)
      }

      const data = await response.json()
      const item = data.MediaContainer?.Metadata?.[0]

      if (!item) {
        throw new Error("Item not found")
      }

      // Return full metadata with all available fields
      return {
        key: item.key,
        title: item.title,
        type: item.type,
        thumb: item.thumb,
        art: item.art,
        year: item.year,
        ratingKey: item.ratingKey,
        summary: item.summary,
        rating: item.rating,
        duration: item.duration,
        studio: item.studio,
        contentRating: item.contentRating,
        originallyAvailableAt: item.originallyAvailableAt,
        addedAt: item.addedAt,
        updatedAt: item.updatedAt,
        tagline: item.tagline,
        audienceRating: item.audienceRating,
        viewCount: item.viewCount,
        lastViewedAt: item.lastViewedAt,
        // Include any other fields from the Plex API you want
      }
    } catch (error) {
      console.error(`[PlexClient] Error fetching metadata for ${ratingKey}:`, error)
      throw error
    }
  }

}

