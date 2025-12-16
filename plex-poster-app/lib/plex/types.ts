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

export interface PlexRole {
  tag: string
  role?: string
  thumb?: string
}

export interface PlexGenre {
  tag: string
}

export interface PlexDirector {
  tag: string
}

export interface PlexWriter {
  tag: string
}

export interface PlexExtras {
  size: number
  Metadata?: PlexExtraItem[]
}

export interface PlexExtraItem {
  ratingKey: string
  key: string
  title: string
  type: string
  subtype?: string
  thumb?: string
  duration?: number
}

export interface PlexItemDetailed extends PlexItem {
  summary?: string
  rating?: number
  audienceRating?: number
  duration?: number
  studio?: string
  contentRating?: string
  originallyAvailableAt?: string
  tagline?: string
  viewCount?: number
  lastViewedAt?: number
  Role?: PlexRole[]
  Genre?: PlexGenre[]
  Director?: PlexDirector[]
  Writer?: PlexWriter[]
  Extras?: PlexExtras
  guids?: PlexGuid[]
}

export interface PlexGuid {
  id: string
}

export interface PosterSource {
  type: "plex" | "fanart" | "ai-generated"
  url: string
  thumb?: string
  selected: boolean
  provider?: string
  ratingKey?: string
  model?: string
  style?: string
  generatedAt?: number
}
