"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, ExternalLink, CheckCircle2, Server, Film, Tv, Music, Folder } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface PlexConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (url: string, token: string, serverName: string) => Promise<void>
  loading?: boolean
}

interface PlexServer {
  name: string
  machineIdentifier: string
  primaryUrl: string | null
  localUrl: string | null
  remoteUrl: string | null
  connections: any[]
}

export function PlexConnectionDialog({ open, onOpenChange, onConnect, loading = false }: PlexConnectionDialogProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<"auth" | "server" | "loading">("auth")
  const [authUrl, setAuthUrl] = useState<string>("")
  const [authToken, setAuthToken] = useState<string>("")
  const [userInfo, setUserInfo] = useState<any>(null)
  const [servers, setServers] = useState<PlexServer[]>([])
  const [selectedServer, setSelectedServer] = useState<string>("")
  const [polling, setPolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [libraries, setLibraries] = useState<any[]>([])
  const [loadingLibraries, setLoadingLibraries] = useState(false)

  useEffect(() => {
    if (open) {
      setStep("auth")
      setAuthUrl("")
      setAuthToken("")
      setUserInfo(null)
      setServers([])
      setSelectedServer("")
      setPolling(false)
      setLibraries([])
      setLoadingLibraries(false)
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [open])

  const startPolling = (pinIdToCheck: number) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch("/api/plex/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "checkPin", pinId: pinIdToCheck }),
        })

        if (!response.ok) {
          try {
            const errorData = await response.json()
            if (errorData.expired || errorData.error?.includes("expired")) {
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
              }
              sessionStorage.removeItem("plexAuthPinId")
              setPolling(false)
              toast({
                title: "PIN expired",
                description: "The authorization PIN has expired. Please try again.",
                variant: "destructive",
              })
              return
            }
          } catch {}
          return
        }

        const data = await response.json()

        if (data.expired) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          sessionStorage.removeItem("plexAuthPinId")
          setPolling(false)
          return
        }

        if (data.authenticated && data.authToken) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          sessionStorage.removeItem("plexAuthPinId")

          setPolling(false)
          setAuthToken(data.authToken)
          await fetchUserInfo(data.authToken)
        }
      } catch (error) {
        console.error("[v0] Error polling for auth:", error)
      }
    }, 2000)
  }

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "plexAuthComplete") {
        const storedPinId = sessionStorage.getItem("plexAuthPinId")
        if (storedPinId) {
          setPolling(true)
          startPolling(Number(storedPinId))
        }
      } else if (event.data.type === "plexAuthError") {
        toast({
          title: "Authentication failed",
          description: event.data.error || "Failed to authenticate with Plex",
          variant: "destructive",
        })
        setPolling(false)
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const startAuth = async () => {
    try {
      const width = 600
      const height = 700
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2

      const popup = window.open(
        "",
        "plexAuth",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
      )

      if (!popup || popup.closed) {
        toast({
          title: "Popup blocked",
          description: "Please allow popups for this site and try again",
          variant: "destructive",
        })
        return
      }

      const response = await fetch("/api/plex/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createPin" }),
      })

      if (!response.ok) {
        popup.close()
        throw new Error("Failed to start Plex authentication")
      }

      const data = await response.json()

      if (!data.authUrl || !data.pinId) {
        popup.close()
        throw new Error("Auth URL or Pin ID not returned")
      }

      setAuthUrl(data.authUrl)
      sessionStorage.setItem("plexAuthPinId", String(data.pinId))
      popup.location.href = data.authUrl

      setPolling(true)
      startPolling(Number(data.pinId))
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start Plex authentication",
        variant: "destructive",
      })
      setPolling(false)
    }
  }

  const fetchUserInfo = async (token: string) => {
    try {
      const response = await fetch("/api/plex/user-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: token }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch user info")
      }

      const data = await response.json()
      setUserInfo(data.user)
      setServers(data.servers)

      if (data.servers.length === 0) {
        throw new Error("No Plex servers found")
      }

      if (data.servers.length === 1) {
        setSelectedServer(data.servers[0].machineIdentifier)
      }

      setStep("server")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch user info",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    if (selectedServer && authToken) {
      const server = servers.find((s) => s.machineIdentifier === selectedServer)
      if (server) {
        fetchLibraries(server)
      }
    } else {
      setLibraries([])
    }
  }, [selectedServer, authToken, servers])

  const fetchLibraries = async (server: PlexServer) => {
    if (!authToken) return

    setLoadingLibraries(true)
    setLibraries([])

    try {
      const cachedUrl = localStorage.getItem(`plex_working_url_${server.machineIdentifier}`)

      console.log("[v0] Fetching libraries for server:", server.name)
      console.log("[v0] Server data:", server)
      console.log("[v0] Cached URL:", cachedUrl)

      // Gather all possible URLs to try, prioritizing cached URL
      const allUrls: string[] = []

      // Add URLs in priority order: local network first, then primary, then remote
      if (server.localUrl) allUrls.push(server.localUrl)
      if (server.primaryUrl && !allUrls.includes(server.primaryUrl)) allUrls.push(server.primaryUrl)
      if (server.remoteUrl && !allUrls.includes(server.remoteUrl)) allUrls.push(server.remoteUrl)

      // Add all other connections that aren't already in the list
      for (const conn of server.connections) {
        if (conn.uri && !allUrls.includes(conn.uri)) {
          allUrls.push(conn.uri)
        }
      }

      console.log("[v0] All URLs to try:", allUrls)

      // Put cached URL first if it exists and is in the list
      const urlsToTry =
        cachedUrl && allUrls.includes(cachedUrl) ? [cachedUrl, ...allUrls.filter((url) => url !== cachedUrl)] : allUrls

      console.log("[v0] URLs to try (in order):", urlsToTry)

      const response = await fetch("/api/plex/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plexUrl: urlsToTry[0],
          plexToken: authToken,
          alternateUrls: urlsToTry.slice(1),
          serverId: server.machineIdentifier,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setLibraries(data.libraries || [])

        if (data.connectedUrl) {
          localStorage.setItem(`plex_working_url_${server.machineIdentifier}`, data.connectedUrl)
        }

        console.log("[v0] Connected successfully via:", data.connectedUrl)
      } else {
        toast({
          title: "Connection failed",
          description: "Could not connect to your Plex server. Please check your network settings.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error fetching libraries:", error)
      toast({
        title: "Connection error",
        description: "Failed to connect to Plex server",
        variant: "destructive",
      })
    } finally {
      setLoadingLibraries(false)
    }
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
        return <Folder className="h-4 w-4" />
    }
  }

  const handleConnect = async () => {
    if (!selectedServer || !authToken) return

    const server = servers.find((s) => s.machineIdentifier === selectedServer)
    if (!server) return

    const cachedUrl = localStorage.getItem(`plex_working_url_${server.machineIdentifier}`)
    const serverUrl = cachedUrl || server.primaryUrl || server.remoteUrl || server.localUrl

    if (!serverUrl) {
      toast({
        title: "Error",
        description: "No valid server URL found",
        variant: "destructive",
      })
      return
    }

    try {
      await fetch("/api/plex/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authToken,
          selectedServer: {
            name: server.name,
            machineIdentifier: server.machineIdentifier,
            url: serverUrl,
            primaryUrl: server.primaryUrl,
            localUrl: server.localUrl,
            remoteUrl: server.remoteUrl,
            connections: server.connections, // Save all connection options
          },
          user: userInfo,
          lastConnected: Date.now(),
        }),
      })
    } catch (error) {
      console.error("[v0] Failed to save config:", error)
    }

    setStep("loading")
    await onConnect(serverUrl, authToken, server.name)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Sign in with Plex</DialogTitle>
          <DialogDescription>
            {step === "auth"
              ? "Authorize this app to access your Plex account"
              : step === "server"
                ? "Select the Plex server you want to connect to"
                : "Connecting to your Plex server..."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === "auth" && (
            <>
              {!polling ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Click below to sign in with Plex. You'll be redirected to authorize this application.
                  </p>
                  <Button onClick={startAuth} className="w-full" disabled={loading}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect to Plex
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border-2 border-dashed bg-muted/50">
                    <div className="text-center space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm font-medium">Waiting for authorization...</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please authorize in the popup window. This will update automatically.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === "server" && (
            <div className="space-y-4">
              {userInfo && (
                <div className="p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-sm font-medium">{userInfo.username}</p>
                      <p className="text-xs text-muted-foreground">Signed in to Plex</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="server-select">Select Plex Server</Label>
                <Select value={selectedServer} onValueChange={setSelectedServer}>
                  <SelectTrigger id="server-select">
                    <SelectValue placeholder="Choose a server" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((server) => (
                      <SelectItem key={server.machineIdentifier} value={server.machineIdentifier}>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          <span>{server.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingLibraries && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading libraries...</span>
                </div>
              )}

              {libraries.length > 0 && (
                <div className="space-y-2">
                  <Label>Available Libraries ({libraries.length})</Label>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {libraries.map((lib) => (
                      <div key={lib.key} className="flex items-center gap-2 p-2 text-sm">
                        {getLibraryIcon(lib.type)}
                        <span>{lib.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleConnect} disabled={!selectedServer || loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Connecting to Plex server...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
