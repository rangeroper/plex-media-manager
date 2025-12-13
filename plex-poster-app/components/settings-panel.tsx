"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { PlexSettings } from "@/components/plex-settings"

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plexUrl: string
  plexToken: string
  onPlexUrlChange: (value: string) => void
  onPlexTokenChange: (value: string) => void
  onLibrariesLoaded: (libraries: any[]) => void
  onServerInfoChange?: (info: { name: string; id: string } | null) => void
}

export function SettingsPanel({
  open,
  onOpenChange,
  plexUrl,
  plexToken,
  onPlexUrlChange,
  onPlexTokenChange,
  onLibrariesLoaded,
  onServerInfoChange,
}: SettingsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Configure your Plex connection and API integrations</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <PlexSettings
            plexUrl={plexUrl}
            plexToken={plexToken}
            onPlexUrlChange={onPlexUrlChange}
            onPlexTokenChange={onPlexTokenChange}
            onLibrariesLoaded={onLibrariesLoaded}
            onServerInfoChange={onServerInfoChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
