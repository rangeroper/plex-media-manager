import { promises as fs } from "fs"
import path from "path"
import os from "os"
import type { PlexConfig } from "./types"

const STORAGE_LOCATIONS = [
  process.env.PLEX_CONFIG_DIR, // User-specified location (for Docker volume mounts)
  path.join(process.cwd(), "data"), // Project data directory (default for dev)
  path.join(os.homedir(), ".plex-poster-manager"), // User home directory fallback
  path.join(os.tmpdir(), "plex-poster-manager"), // System temp as last resort
].filter(Boolean) as string[]

let CONFIG_DIR: string | null = null
let CONFIG_FILE: string | null = null

export class PlexStorage {
  private static config: PlexConfig | null = null

  static async ensureConfigDir(): Promise<string> {
    if (CONFIG_DIR && CONFIG_FILE) {
      return CONFIG_DIR
    }

    for (const dir of STORAGE_LOCATIONS) {
      try {
        await fs.mkdir(dir, { recursive: true })
        // Test if directory is writable
        const testFile = path.join(dir, ".write-test")
        await fs.writeFile(testFile, "test")
        await fs.unlink(testFile)

        CONFIG_DIR = dir
        CONFIG_FILE = path.join(dir, "plex-config.json")
        console.log(`[v0] Using config directory: ${CONFIG_DIR}`)
        return CONFIG_DIR
      } catch (error) {
        console.warn(`[v0] Cannot use config directory ${dir}:`, error)
        continue
      }
    }

    throw new Error("No writable config directory found")
  }

  static async loadConfig(): Promise<PlexConfig> {
    if (this.config) {
      return this.config
    }

    try {
      await this.ensureConfigDir()
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")

      const data = await fs.readFile(CONFIG_FILE, "utf-8")
      this.config = JSON.parse(data)
      console.log("[v0] Loaded config from:", CONFIG_FILE)
      return this.config || {}
    } catch (error: any) {
      if (error.code === "ENOENT") {
        this.config = {}
        return {}
      }
      console.error("[v0] Failed to load config:", error)
      return {}
    }
  }

  static async saveConfig(config: PlexConfig): Promise<void> {
    try {
      await this.ensureConfigDir()
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")

      this.config = config
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
      console.log("[v0] Saved config to:", CONFIG_FILE)
    } catch (error) {
      console.error("[v0] Failed to save config:", error)
      throw error
    }
  }

  static async updateConfig(updates: Partial<PlexConfig>): Promise<PlexConfig> {
    const current = await this.loadConfig()
    const updated = { ...current, ...updates }
    await this.saveConfig(updated)
    return updated
  }

  static async clearConfig(): Promise<void> {
    try {
      if (!CONFIG_FILE) throw new Error("Config file path not initialized")
      await fs.unlink(CONFIG_FILE)
      this.config = null
      console.log("[v0] Cleared config from:", CONFIG_FILE)
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[v0] Failed to clear config:", error)
      }
    }
  }

  static getConfig(): PlexConfig | null {
    return this.config
  }

  static getStorageLocation(): string | null {
    return CONFIG_DIR
  }
}
