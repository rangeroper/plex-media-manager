import Redis from "ioredis"

let redis: Redis | null = null

// Initialize Redis client with Docker-friendly defaults
function getRedisClient() {
  if (!redis) {
    try {
      const redisUrl = process.env.REDIS_URL || "redis://redis:6379"
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.log("[v0] Redis connection failed, app will work without cache")
            return null // Stop retrying
          }
          return Math.min(times * 50, 2000) // Exponential backoff
        },
        lazyConnect: true, // Don't block app startup if Redis is unavailable
      })

      // Test connection
      redis
        .connect()
        .then(() => {
          console.log("[v0] Redis connected successfully")
        })
        .catch((err) => {
          console.log("[v0] Redis unavailable, app will work without cache:", err.message)
          redis = null
        })
    } catch (error) {
      console.log("[v0] Redis initialization failed, app will work without cache")
      redis = null
    }
  }
  return redis
}

export interface CacheOptions {
  ttl?: number // Time to live in seconds
}

export class RedisCache {
  private redis: Redis | null
  private prefix: string

  constructor(prefix = "plex") {
    this.redis = getRedisClient()
    this.prefix = prefix
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) {
      return null
    }

    try {
      const data = await this.redis.get(this.getKey(key))
      if (data) {
        console.log(`[v0] Cache HIT: ${key}`)
        return JSON.parse(data) as T
      } else {
        console.log(`[v0] Cache MISS: ${key}`)
        return null
      }
    } catch (error) {
      console.error("[v0] Redis get error:", error)
      return null
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    if (!this.redis) {
      return false
    }

    try {
      const cacheKey = this.getKey(key)
      const serialized = JSON.stringify(value)

      if (options?.ttl) {
        await this.redis.setex(cacheKey, options.ttl, serialized)
        console.log(`[v0] Cache SET: ${key} (TTL: ${options.ttl}s)`)
      } else {
        await this.redis.set(cacheKey, serialized)
        console.log(`[v0] Cache SET: ${key} (no TTL)`)
      }
      return true
    } catch (error) {
      console.error("[v0] Redis set error:", error)
      return false
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.redis) {
      return false
    }

    try {
      await this.redis.del(this.getKey(key))
      console.log(`[v0] Cache DELETE: ${key}`)
      return true
    } catch (error) {
      console.error("[v0] Redis delete error:", error)
      return false
    }
  }

  async deletePattern(pattern: string): Promise<boolean> {
    if (!this.redis) {
      return false
    }

    try {
      const keys = await this.redis.keys(this.getKey(pattern))
      if (keys && keys.length > 0) {
        await this.redis.del(...keys)
        console.log(`[v0] Cache DELETE pattern: ${pattern} (${keys.length} keys)`)
      }
      return true
    } catch (error) {
      console.error("[v0] Redis delete pattern error:", error)
      return false
    }
  }

  async keys(pattern: string = "*"): Promise<string[]> {
    if (!this.redis) {
      return []
    }

    try {
      const fullPattern = this.getKey(pattern)
      const keys = await this.redis.keys(fullPattern)
      
      // Remove the prefix from returned keys to match the original key format
      return keys.map(key => key.replace(`${this.prefix}:`, ''))
    } catch (error) {
      console.error("[v0] Redis keys error:", error)
      return []
    }
  }

  async invalidateLibrary(libraryKey: string): Promise<void> {
    console.log(`[v0] Invalidating cache for library: ${libraryKey}`)
    await this.delete(`libraries`)
    await this.delete(`items:${libraryKey}`)
  }


  async invalidateAll(): Promise<void> {
    console.log("[v0] Invalidating all cache")
    await this.deletePattern("*")
  }
}

// Export singleton instance
export const cache = new RedisCache("plex")

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  LIBRARIES: 5 * 60, // 5 minutes - libraries don't change often
  ITEMS: 15 * 60, // 15 minutes - library items
  METADATA: 60 * 60, // 1 hour - movie/show metadata
  POSTERS: 24 * 60 * 60, // 24 hours - poster URLs
}
