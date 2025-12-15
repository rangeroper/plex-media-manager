import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { Buffer } from "buffer" // <--- NEW IMPORT

export interface PosterConfig {
  stableDiffusion?: {
    endpoint?: string
    model?: string
    steps?: number
    cfgScale?: number
    width?: number
    height?: number
    negativePrompt?: string
  }
  externalSources?: {
    fanart?: {
      enabled: boolean
      apiKey?: string
    }
    tmdb?: {
      enabled: boolean
      apiKey?: string
    }
    imdb?: {
      enabled: boolean
    }
  }
  librarySettings?: {
    [libraryKey: string]: {
      provider?: 'stable-diffusion' | 'fanart' | 'tmdb' | 'imdb'
      customPrompt?: string
      style?: string
      autoGenerate?: boolean
      settings?: any
    }
  }
}

const STORAGE_LOCATIONS = [
  process.env.PLEX_CONFIG_DIR,
  path.join(process.cwd(), "data"),
  path.join(os.homedir(), ".plex-poster-manager"),
  path.join(os.tmpdir(), "plex-poster-manager"),
].filter(Boolean) as string[]

let CONFIG_DIR: string | null = null
let CONFIG_FILE: string | null = null

export class PosterStorage {
  private static config: PosterConfig | null = null

  static async ensureConfigDir(): Promise<string> {
    if (CONFIG_DIR && CONFIG_FILE) {
      return CONFIG_DIR
    }

    for (const dir of STORAGE_LOCATIONS) {
      try {
        await fs.mkdir(dir, { recursive: true })
        const testFile = path.join(dir, ".write-test")
        await fs.writeFile(testFile, "test")
        await fs.unlink(testFile)

        CONFIG_DIR = dir
        CONFIG_FILE = path.join(dir, "poster-config.json")
        console.log(`[PosterStorage] Using config directory: ${CONFIG_DIR}`)
        return CONFIG_DIR
      } catch (error) {
        console.warn(`[PosterStorage] Cannot use config directory ${dir}:`, error)
        continue
      }
    }

    throw new Error("No writable config directory found")
  }

  static async loadConfig(): Promise<PosterConfig> {
    if (this.config) {
      return this.config
    }

    try {
      await this.ensureConfigDir()
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")

      const data = await fs.readFile(CONFIG_FILE, "utf-8")
      const loaded = JSON.parse(data)
      
      // Clean any malformed config
      this.config = this.cleanConfig(loaded)
      console.log("[PosterStorage] Loaded config from:", CONFIG_FILE)
      return this.config
    } catch (error: any) {
      if (error.code === "ENOENT") {
        this.config = { librarySettings: {} }
        return this.config
      }
      console.error("[PosterStorage] Failed to load config:", error)
      return { librarySettings: {} }
    }
  }

  /**
   * Clean config structure - remove duplicate keys at root level
   */
  private static cleanConfig(config: any): PosterConfig {
    const cleaned: PosterConfig = {
      librarySettings: {},
    }

    // Copy valid top-level keys only
    if (config.stableDiffusion) {
      cleaned.stableDiffusion = config.stableDiffusion
    }
    if (config.externalSources) {
      cleaned.externalSources = config.externalSources
    }

    // Start with existing librarySettings
    if (config.librarySettings && typeof config.librarySettings === 'object') {
      cleaned.librarySettings = { ...config.librarySettings }
    }

    // Move any root-level library keys into librarySettings
    for (const key in config) {
      if (key === "stableDiffusion" || key === "externalSources" || key === "librarySettings") {
        continue
      }
      
      // If it's a library key, move it to librarySettings
      if (key.match(/^[a-zA-Z0-9_-]+$/) && typeof config[key] === 'object') {
        console.warn(`[PosterStorage] Moving misplaced key "${key}" from root to librarySettings`)
        if (!cleaned.librarySettings) {
          cleaned.librarySettings = {}
        }
        // Merge with existing if present, otherwise just move
        cleaned.librarySettings[key] = {
          ...cleaned.librarySettings[key],
          ...config[key]
        }
      }
    }

    return cleaned
  }

  static async saveConfig(config: PosterConfig): Promise<void> {
    try {
      await this.ensureConfigDir()
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")

      // Ensure clean structure before saving
      const cleanConfig: PosterConfig = {}

      if (config.stableDiffusion) {
        cleanConfig.stableDiffusion = config.stableDiffusion
      }
      if (config.externalSources) {
        cleanConfig.externalSources = config.externalSources
      }
      if (config.librarySettings) {
        cleanConfig.librarySettings = config.librarySettings
      }

      this.config = cleanConfig
      await fs.writeFile(CONFIG_FILE, JSON.stringify(cleanConfig, null, 2), "utf-8")
      console.log("[PosterStorage] Saved config to:", CONFIG_FILE)
    } catch (error) {
      console.error("[PosterStorage] Failed to save config:", error)
      throw error
    }
  }

  static async updateConfig(updates: Partial<PosterConfig>): Promise<PosterConfig> {
    const current = await this.loadConfig()
    
    // Build clean updated config
    const updated: PosterConfig = {}
    
    updated.stableDiffusion = updates.stableDiffusion !== undefined 
      ? updates.stableDiffusion 
      : current.stableDiffusion
      
    updated.externalSources = updates.externalSources !== undefined
      ? updates.externalSources
      : current.externalSources
      
    updated.librarySettings = updates.librarySettings !== undefined
      ? updates.librarySettings
      : current.librarySettings
    
    await this.saveConfig(updated)
    return updated
  }

  static async updateLibrarySettings(
    libraryKey: string,
    settings: NonNullable<PosterConfig["librarySettings"]>[string]
  ): Promise<PosterConfig> {
    const current = await this.loadConfig()
    
    // Build clean config - NEVER spread root level
    const updated: PosterConfig = {}
    
    // Preserve existing top-level configs
    if (current.stableDiffusion) {
      updated.stableDiffusion = current.stableDiffusion
    }
    if (current.externalSources) {
      updated.externalSources = current.externalSources
    }
    
    // Update library settings
    updated.librarySettings = {
      ...(current.librarySettings || {}),
      [libraryKey]: {
        ...(current.librarySettings?.[libraryKey] || {}),
        ...settings,
      },
    }
    
    await this.saveConfig(updated)
    return updated
  }

  static async getLibrarySettings(
    libraryKey: string
  ): Promise<NonNullable<PosterConfig["librarySettings"]>[string] | null> {
    const config = await this.loadConfig()
    return config.librarySettings?.[libraryKey] || null
  }

  static async deleteLibrarySettings(libraryKey: string): Promise<PosterConfig> {
    const current = await this.loadConfig()
    
    // Build clean config
    const updated: PosterConfig = {}
    
    if (current.stableDiffusion) {
      updated.stableDiffusion = current.stableDiffusion
    }
    if (current.externalSources) {
      updated.externalSources = current.externalSources
    }
    
    // Remove the library key
    const librarySettings = { ...(current.librarySettings || {}) }
    delete librarySettings[libraryKey]
    updated.librarySettings = librarySettings
    
    await this.saveConfig(updated)
    return updated
  }

  static async clearConfig(): Promise<void> {
    try {
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")
      await fs.unlink(CONFIG_FILE)
      this.config = null
      console.log("[PosterStorage] Cleared config from:", CONFIG_FILE)
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[PosterStorage] Failed to clear config:", error)
      }
    }
  }
    
    // --- NEW HELPER METHOD ---
    private static getPosterStoragePath(libraryKey: string): string {
        if (!CONFIG_DIR) {
            throw new Error("Configuration directory not initialized. Call ensureConfigDir first.")
        }
        // Base directory for all generated posters
        const postersDir = path.join(CONFIG_DIR, "posters")
        
        // Library-specific subdirectory
        return path.join(postersDir, libraryKey)
    }

    /**
     * Saves the raw image buffer to the preferred location: 
     * {configDir}/posters/{libraryKey}/{ratingKey}_{random_id}.png
     * @param libraryKey The Plex library key (e.g., '1')
     * @param ratingKey The Plex item key (e.g., '12345')
     * @param imageBuffer The raw PNG/JPG image data
     * @returns The full path to the saved file
     */
    static async saveGeneratedPoster(
        libraryKey: string,
        ratingKey: string,
        imageBuffer: Buffer
    ): Promise<string> {
        await this.ensureConfigDir() // Ensure the base directory is ready
        const targetDir = this.getPosterStoragePath(libraryKey)
        await fs.mkdir(targetDir, { recursive: true })

        // Create a unique filename: {ratingKey}_{uuid}.png
        const uniqueId = Math.random().toString(36).substring(2, 8)
        const filename = `${ratingKey}_${uniqueId}.png`
        const fullPath = path.join(targetDir, filename)

        try {
            await fs.writeFile(fullPath, imageBuffer)
            console.log(`[PosterStorage] Successfully saved poster for ${ratingKey} to: ${fullPath}`)
            return fullPath
        } catch (error) {
            console.error(`[PosterStorage] Failed to save poster for ${ratingKey} to ${fullPath}:`, error)
            throw new Error("Failed to write poster file to disk.")
        }
    }
    // --- END NEW METHODS ---

  static getConfig(): PosterConfig | null {
    return this.config
  }

  static getStorageLocation(): string | null {
    return CONFIG_DIR
  }
}