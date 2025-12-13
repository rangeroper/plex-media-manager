"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, Play } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Library {
  key: string
  title: string
  type: string
}

interface StableDiffusionProviderProps {
  libraries: Library[]
  onStartGeneration: () => void
  isGenerating: boolean
}

export function StableDiffusionProvider({
  libraries,
  onStartGeneration,
  isGenerating,
}: StableDiffusionProviderProps) {
  const [selectedStyle, setSelectedStyle] = useState("cartoon")
  const [selectedModel, setSelectedModel] = useState("sd35-large")
  const { toast } = useToast()

  const isExpanded = libraries.length > 0

  // Load saved settings for the first library
  useEffect(() => {
    async function loadSettings() {
      if (libraries.length > 0 && libraries[0].key) {
        try {
          const response = await fetch(`/api/posters/library/${libraries[0].key}`)
          if (response.ok) {
            const settings = await response.json()
            if (settings.settings?.model) {
              setSelectedModel(settings.settings.model)
            }
            if (settings.settings?.style) {
              setSelectedStyle(settings.settings.style)
            }
          }
        } catch (error) {
          console.error('Failed to load settings:', error)
        }
      }
    }

    loadSettings()
  }, [libraries])

  const handleStartGeneration = async () => {
    try {
      const validLibraries = libraries.filter(lib => lib.key && lib.key !== 'undefined')
      
      if (validLibraries.length === 0) {
        toast({
          title: "Error",
          description: "No valid libraries selected",
          variant: "destructive",
        })
        return
      }
      
      // Save settings for all selected libraries
      await Promise.all(
        validLibraries.map(library =>
          fetch(`/api/posters/library/${library.key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'stable-diffusion',
              settings: {
                model: selectedModel,
                style: selectedStyle,
              },
            }),
          })
        )
      )

      // Start generation
      onStartGeneration()
    } catch (error) {
      console.error('Failed to start generation:', error)
      toast({
        title: "Error",
        description: "Failed to start generation",
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h4 className="text-lg font-semibold">Stable Diffusion 3.5</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {libraries.length > 0 
                ? `${libraries.length} ${libraries.length === 1 ? 'library' : 'libraries'} selected`
                : 'Select libraries to configure'}
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="space-y-1">
                <p className="text-sm font-medium">Ready to generate</p>
                <p className="text-xs text-muted-foreground">
                  Settings will be saved automatically when you start
                </p>
              </div>
              
              <Button
                onClick={handleStartGeneration}
                disabled={libraries.length === 0 || isGenerating}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {isGenerating ? "Generating..." : "Start Generation"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}