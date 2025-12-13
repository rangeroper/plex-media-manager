"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Settings, Film, FolderOpen, RefreshCw, Layers, Image } from "lucide-react"
import { ImageIcon } from "lucide-react"
import { SettingsPanel } from "@/components/settings-panel"
import { LibraryGrid } from "@/components/library-grid"
import { CollectionsView } from "@/components/views/collections-view"
import { PostersView } from "@/components/views/posters-view"

export function DashboardView() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [plexUrl, setPlexUrl] = useState("")
  const [plexToken, setPlexToken] = useState("")
  const [serverInfo, setServerInfo] = useState<{ name: string; id: string } | null>(null)
  const [libraries, setLibraries] = useState<any[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<"libraries" | "collections" | "posters">("libraries")
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    async function loadSavedConfig() {
      try {
        const response = await fetch("/api/plex/config")
        if (response.ok) {
          const config = await response.json()

          if (config.authToken && config.selectedServer) {
            console.log("[v0] Found saved Plex config, auto-connecting...")

            // Set the connection info
            setPlexToken(config.authToken)

            // Build all URLs to try
            const urlsToTry: string[] = []
            if (config.selectedServer.primaryUrl) urlsToTry.push(config.selectedServer.primaryUrl)
            if (config.selectedServer.localUrl) urlsToTry.push(config.selectedServer.localUrl)
            if (config.selectedServer.remoteUrl) urlsToTry.push(config.selectedServer.remoteUrl)
            if (config.selectedServer.connections) {
              config.selectedServer.connections.forEach((conn: any) => {
                if (conn.uri && !urlsToTry.includes(conn.uri)) {
                  urlsToTry.push(conn.uri)
                }
              })
            }

            // Set server info
            setServerInfo({
              name: config.selectedServer.name,
              id: config.selectedServer.machineIdentifier,
            })

            // Try to fetch libraries
            const libResponse = await fetch("/api/plex/libraries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                plexToken: config.authToken,
                plexUrl: urlsToTry[0],
                alternateUrls: urlsToTry.slice(1),
              }),
            })

            if (libResponse.ok) {
              const data = await libResponse.json()
              setLibraries(data.libraries || [])
              setPlexUrl(data.workingUrl || urlsToTry[0])
              console.log("[v0] Successfully loaded libraries from saved config")
            } else {
              console.error("[v0] Failed to load libraries with saved config")
            }
          } else {
            console.log("[v0] No saved Plex config found")
          }
        }
      } catch (error) {
        console.error("[v0] Error loading saved config:", error)
      } finally {
        setIsLoadingConfig(false)
        setHasAttemptedLoad(true)
      }
    }

    loadSavedConfig()
  }, [])

  useEffect(() => {
    if (libraries.length > 0 && !selectedLibrary) {
      setSelectedLibrary(libraries[0].key)
    }
  }, [libraries, selectedLibrary])

  const isConnected = plexUrl && plexToken && libraries.length > 0

  const handleRefresh = async () => {
    if (!serverInfo?.id) return

    setIsRefreshing(true)
    try {
      await fetch("/api/plex/cache/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "all",
          serverId: serverInfo.id,
        }),
      })

      console.log("[v0] All cache invalidated, refreshing all libraries...")

      // Force re-fetch of libraries
      const urlsToTry: string[] = []
      if (serverInfo) {
        // Rebuild URLs from server info
        const savedUrl = plexUrl
        if (savedUrl) urlsToTry.push(savedUrl)
      }

      const libResponse = await fetch("/api/plex/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexToken: plexToken,
          plexUrl: urlsToTry[0] || plexUrl,
        }),
      })

      if (libResponse.ok) {
        const data = await libResponse.json()
        setLibraries(data.libraries || [])
        console.log("[v0] Successfully refreshed all libraries")
      }

      // Force component re-render by resetting selected library
      const current = selectedLibrary
      setSelectedLibrary(null)
      setTimeout(() => setSelectedLibrary(current), 100)
    } catch (error) {
      console.error("[v0] Refresh error:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (!hasAttemptedLoad || isLoadingConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Film className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Plex Poster Manager</h1>
                <p className="text-xs text-muted-foreground">Manage posters & collections</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="gap-2 bg-transparent"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {!isConnected ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="max-w-md space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                <FolderOpen className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">Welcome to Plex Poster Manager</h2>
                <p className="text-muted-foreground">
                  Connect to your Plex server to start managing posters and collections
                </p>
              </div>
              <Button onClick={() => setSettingsOpen(true)} size="lg" className="gap-2">
                <Settings className="h-4 w-4" />
                Connect to Plex
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* View Toggle */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-4">
                <Button
                  variant={currentView === "libraries" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentView("libraries")}
                  className="gap-2"
                >
                  <Film className="h-4 w-4" />
                  Libraries
                </Button>
                <Button
                  variant={currentView === "collections" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentView("collections")}
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  Collections
                </Button>
                <Button
                  variant={currentView === "posters" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCurrentView("posters")}
                  className="gap-2"
                >
                  <Image className="h-4 w-4" />
                  Posters
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <Button
                variant={selectedLibrary === null ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedLibrary(null)}
                className="gap-2 whitespace-nowrap"
              >
                All Libraries
              </Button>
              {libraries.map((library) => (
                <Button
                  key={library.key}
                  variant={selectedLibrary === library.key ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedLibrary(library.key)}
                  className="gap-2 whitespace-nowrap"
                >
                  {library.type === "movie" && <Film className="h-4 w-4" />}
                  {library.type === "show" && <ImageIcon className="h-4 w-4" />}
                  {library.title}
                </Button>
              ))}
            </div>

            {currentView === "libraries" ? (
              <>
                {selectedLibrary ? (
                  <LibraryGrid plexUrl={plexUrl} plexToken={plexToken} libraryKey={selectedLibrary} />
                ) : (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center space-y-3">
                      <FolderOpen className="h-12 w-12 text-muted-foreground/50 mx-auto" />
                      <p className="text-sm text-muted-foreground">Select a library to view content</p>
                    </div>
                  </div>
                )}
              </>
            ) : currentView === "collections" ? (
              <CollectionsView
                plexUrl={plexUrl}
                plexToken={plexToken}
                alternateUrls={libraries.length > 0 ? [plexUrl] : []}
                libraries={libraries.map((lib) => ({ key: lib.key, title: lib.title }))}
                selectedLibraryKey={selectedLibrary}
              />
            ) : (
              <PostersView
                key={selectedLibrary || 'all-libraries'}
                plexUrl={plexUrl}
                plexToken={plexToken}
                libraries={
                  selectedLibrary
                    ? libraries
                        .filter((lib) => lib.key === selectedLibrary)
                        .map((lib) => ({ key: lib.key, title: lib.title, type: lib.type }))
                    : libraries.map((lib) => ({ key: lib.key, title: lib.title, type: lib.type }))
                }
              />
            )}
          </div>
        )}
      </main>

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        plexUrl={plexUrl}
        plexToken={plexToken}
        onPlexUrlChange={setPlexUrl}
        onPlexTokenChange={setPlexToken}
        onLibrariesLoaded={setLibraries}
        onServerInfoChange={setServerInfo}
      />
    </div>
  )
}