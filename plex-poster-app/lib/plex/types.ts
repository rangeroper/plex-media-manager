export interface PlexAuthToken {
  token: string
  expiresAt?: number
}

export interface PlexServer {
  name: string
  machineIdentifier: string
  urls: string[]
  owned: boolean
  version: string
}

export interface PlexConnection {
  url: string
  local: boolean
}

export interface PlexUser {
  username: string
  email: string
  thumb?: string
}

export interface PlexLibrary {
  key: string
  title: string
  type: string
  thumb?: string
  art?: string
  agent?: string
  scanner?: string
  language?: string
  uuid?: string
}

export interface PlexItem {
  ratingKey: string
  key: string
  title: string
  type: string
  thumb?: string
  art?: string
  parentThumb?: string
  grandparentThumb?: string
  year?: number
  addedAt?: number
  updatedAt?: number
}

export interface PlexCollection {
  ratingKey: string
  key: string
  title: string
  type: string
  subtype: string
  thumb?: string
  art?: string
  summary?: string
  childCount: number
  addedAt?: number
  updatedAt?: number
}

export interface PlexConfig {
  authToken?: string
  selectedServer?: {
    name: string
    machineIdentifier: string
    url: string
    primaryUrl?: string | null
    localUrl?: string | null
    remoteUrl?: string | null
    connections?: any[]
  }
  user?: PlexUser
  lastConnected?: number
}
