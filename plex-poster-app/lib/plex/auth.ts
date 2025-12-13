import type { PlexUser } from "./types"
import { PlexStorage } from "./storage"

const PLEX_CLIENT_ID = "plex-poster-manager"
const PLEX_PRODUCT = "Plex Poster Manager"

export class PlexAuth {
  static async createPin(): Promise<{ pinId: number; code: string; authUrl: string }> {
    const response = await fetch("https://plex.tv/api/v2/pins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Plex-Product": PLEX_PRODUCT,
        "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      },
      body: JSON.stringify({ strong: true }),
    })

    if (!response.ok) {
      throw new Error("Failed to create Plex PIN")
    }

    const pinData = await response.json()
    const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}&code=${pinData.code}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PLEX_PRODUCT)}`

    return {
      pinId: pinData.id,
      code: pinData.code,
      authUrl,
    }
  }

  static async checkPin(pinId: number): Promise<{ authenticated: boolean; authToken?: string; expired?: boolean }> {
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      },
    })

    if (!response.ok) {
      return { authenticated: false, expired: true }
    }

    const pinData = await response.json()

    if (pinData.authToken) {
      // Save token to storage
      await PlexStorage.updateConfig({ authToken: pinData.authToken })
      return {
        authenticated: true,
        authToken: pinData.authToken,
      }
    }

    return { authenticated: false }
  }

  static async getUserInfo(authToken: string): Promise<PlexUser> {
    const response = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": authToken,
        "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch user info")
    }

    const data = await response.json()
    const user: PlexUser = {
      username: data.username || data.title,
      email: data.email,
      thumb: data.thumb,
    }

    // Save user to storage
    await PlexStorage.updateConfig({ user })
    return user
  }

  static async loadStoredAuth(): Promise<{ authToken?: string; user?: PlexUser } | null> {
    const config = await PlexStorage.loadConfig()
    if (config.authToken) {
      return {
        authToken: config.authToken,
        user: config.user,
      }
    }
    return null
  }

  static async clearAuth(): Promise<void> {
    await PlexStorage.clearConfig()
  }

  static getClientId(): string {
    return PLEX_CLIENT_ID
  }

  static getProduct(): string {
    return PLEX_PRODUCT
  }
}
