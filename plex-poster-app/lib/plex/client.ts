import type { PlexServer, PlexLibrary, PlexItem, PlexCollection, PosterSource } from "./types"
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
        Role: item.Role || [],
        Genre: item.Genre || [],
        Director: item.Director || [],
        Writer: item.Writer || [],
        Extras: item.Extras,
        guid: item.guid,
        guids: item.Guid || [],
      }
    } catch (error) {
      console.error(`[PlexClient] Error fetching metadata for ${ratingKey}:`, error)
      throw error
    }
  }

  async getItemPosters(serverUrl: string, ratingKey: string): Promise<PosterSource[]> {
    try {
      const url = `${serverUrl}/library/metadata/${ratingKey}/posters?X-Plex-Token=${this.authToken}`

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
        },
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch posters: ${response.status}`)
      }

      const data = await response.json()
      const posters = data.MediaContainer?.Metadata || []

      return posters.map((poster: any) => {
        const posterUrl = poster.key.startsWith("http")
          ? poster.key
          : `${serverUrl}${poster.key}${poster.key.includes("?") ? "&" : "?"}X-Plex-Token=${this.authToken}`

        const thumbUrl = poster.thumb
          ? poster.thumb.startsWith("http")
            ? poster.thumb
            : `${serverUrl}${poster.thumb}${poster.thumb.includes("?") ? "&" : "?"}X-Plex-Token=${this.authToken}`
          : undefined

        return {
          type: poster.provider === "local" ? "plex" : ("fanart" as const),
          url: posterUrl,
          thumb: thumbUrl,
          selected: poster.selected === 1,
          provider: poster.provider,
          ratingKey: poster.ratingKey,
        }
      })
    } catch (error) {
      console.error(`[PlexClient] Error fetching posters for ${ratingKey}:`, error)
      return []
    }
  }

  async setPrimaryPoster(serverUrl: string, ratingKey: string, posterUrl: string): Promise<boolean> {
    try {
      const url = `${serverUrl}/library/metadata/${ratingKey}/posters?X-Plex-Token=${this.authToken}`

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `url=${encodeURIComponent(posterUrl)}`,
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        throw new Error(`Failed to set primary poster: ${response.status}`)
      }

      console.log(`[PlexClient] Successfully set primary poster for ${ratingKey}`)
      return true
    } catch (error) {
      console.error(`[PlexClient] Error setting primary poster for ${ratingKey}:`, error)
      throw error
    }
  }

  /**
   * Upload a poster image to Plex for a specific item
   */
  async uploadPoster(serverUrl: string, ratingKey: string, imageBuffer: Buffer): Promise<boolean> {
    try {
      console.log(`[PlexClient] Uploading poster for rating key: ${ratingKey}`)

      const arrayBuffer = new ArrayBuffer(imageBuffer.length)
      const view = new Uint8Array(arrayBuffer)
      for (let i = 0; i < imageBuffer.length; i++) {
        view[i] = imageBuffer[i]
      }

      const blob = new Blob([arrayBuffer], { type: "image/png" })

      const formData = new globalThis.FormData()
      formData.append("file", blob, `poster_${ratingKey}.png`)

      // Upload the poster
      const uploadUrl = `${serverUrl}/library/metadata/${ratingKey}/posters?X-Plex-Token=${this.authToken}`

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Plex-Token": this.authToken,
          "X-Plex-Client-Identifier": this.clientId,
        },
        body: formData as any,
        signal: AbortSignal.timeout(60000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[PlexClient] Failed to upload poster: ${response.status} - ${errorText}`)
        throw new Error(`Failed to upload poster: ${response.status}`)
      }

      console.log(`[PlexClient] Successfully uploaded poster for rating key: ${ratingKey}`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[PlexClient] Error uploading poster for ${ratingKey}:`, message)
      throw error
    }
  }
}
