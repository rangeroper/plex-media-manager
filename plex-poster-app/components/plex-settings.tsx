"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, RefreshCw, Loader2, Film, Tv, Music, AlertCircle, LogIn } from "lucide-react"
import { PlexConnectionDialog } from "@/components/plex-connection-dialog"

interface PlexLibrary {
  key: string
  title: string
  type: string
  agent: string
  scanner: string
  path: string
  basePath: string
}

interface PlexSettingsProps {
  plexUrl: string
  plexToken: string
  onPlexUrlChange: (value: string) => void
  onPlexTokenChange: (value: string) => void
  onLibrariesLoaded: (libraries: PlexLibrary[]) => void
  onServerInfoChange?: (info: { name: string; id: string } | null) => void
}

export function PlexSettings({
  plexUrl,
  plexToken,
  onPlexUrlChange,
  onPlexTokenChange,
  onLibrariesLoaded,
  onServerInfoChange,
}: PlexSettingsProps) {
  const [plexLibraries, setPlexLibraries] = useState<PlexLibrary[]>([])
  const [loadingLibraries, setLoadingLibraries] = useState(false)
  const [plexTestStatus, setPlexTestStatus] = useState<"idle" | "success" | "error">("idle")
  const [isConnected, setIsConnected] = useState(false)
  const [showConnectionDialog, setShowConnectionDialog] = useState(false)
  const [serverInfo, setServerInfo] = useState<{ name: string; id: string } | null>(null)

  const handleConnect = async (url: string, token: string, serverName: string) => {
    console.log("[v0] Connecting to Plex:", url, "Server:", serverName)

    const serverIdMatch = url.match(/([a-f0-9]{40})\.plex\.direct/)
    const serverId = serverIdMatch ? serverIdMatch[1] : ""

    const info = { name: serverName, id: serverId }
    setServerInfo(info)
    if (onServerInfoChange) {
      onServerInfoChange(info)
    }

    onPlexUrlChange(url)
    onPlexTokenChange(token)
    setShowConnectionDialog(false)

    setLoadingLibraries(true)
    setPlexTestStatus("idle")
    setIsConnected(true) // Set connected immediately

    try {
      const cachedUrl = serverId ? localStorage.getItem(`plex_working_url_${serverId}`) : null
      const urlToUse = cachedUrl || url

      const response = await fetch("/api/plex/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexUrl: urlToUse,
          plexToken: token,
          serverId: serverId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const libraries = data.libraries || []

        if (data.connectedUrl && serverId) {
          localStorage.setItem(`plex_working_url_${serverId}`, data.connectedUrl)
        }

        setPlexLibraries(libraries)
        setPlexTestStatus("success")
        onLibrariesLoaded(libraries)
      } else {
        setPlexTestStatus("error")
        setPlexLibraries([])
        setIsConnected(false) // Set disconnected on error
      }
    } catch (error) {
      console.error("[v0] Failed to fetch Plex libraries:", error)
      setPlexTestStatus("error")
      setPlexLibraries([])
      setIsConnected(false) // Set disconnected on error
    } finally {
      setLoadingLibraries(false)
    }
  }

  const handleDisconnect = async () => {
    // Clear all state
    setIsConnected(false)
    setPlexLibraries([])
    setServerInfo(null)
    setPlexTestStatus("idle")

    // Clear parent state
    onPlexUrlChange("")
    onPlexTokenChange("")
    onLibrariesLoaded([])
    if (onServerInfoChange) {
      onServerInfoChange(null)
    }

    // Clear saved config
    try {
      await fetch("/api/plex/config", {
        method: "DELETE",
      })
      console.log("[v0] Disconnected from Plex")
    } catch (error) {
      console.error("[v0] Error clearing config:", error)
    }
  }

  const handleReconnect = () => {
    setShowConnectionDialog(true)
  }

  const getLibraryIcon = (type: string) => {
    switch (type) {
      case "movie":
        return <Film className="h-4 w-4" />
      case "show":
        return <Tv className="h-4 w-4" />
      case "artist":
        return <Music className="h-4 w-4" />
      default:
        return null
    }
  }

  const getLibraryTypeLabel = (type: string) => {
    switch (type) {
      case "movie":
        return "Movies"
      case "show":
        return "TV Shows"
      case "artist":
        return "Music"
      default:
        return type
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Plex Configuration</h3>
          {isConnected && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Connected
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-dashed text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Connect to your Plex server to load libraries and enable Plex integration
              </p>
              <Button onClick={() => setShowConnectionDialog(true)} className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                Connect to Plex
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex-1">
                <p className="text-sm font-medium">{serverInfo?.name || "Connected to Plex"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {plexLibraries.length} {plexLibraries.length === 1 ? "library" : "libraries"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
                <Button variant="outline" size="sm" onClick={handleReconnect} disabled={loadingLibraries}>
                  {loadingLibraries ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-2" />
                      Reconnect
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {plexTestStatus === "error" && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            Failed to connect to Plex. Check your URL and token.
          </div>
        )}

        {plexLibraries.length > 0 && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Available Libraries</h4>
              </div>

              <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                {plexLibraries.map((library) => (
                  <div key={library.key} className="flex items-center gap-3 p-2 rounded hover:bg-muted">
                    {getLibraryIcon(library.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{library.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getLibraryTypeLabel(library.type)} • ID: {library.key}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <PlexConnectionDialog
        open={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
        onConnect={handleConnect}
        loading={loadingLibraries}
      />
    </>
  )
}
