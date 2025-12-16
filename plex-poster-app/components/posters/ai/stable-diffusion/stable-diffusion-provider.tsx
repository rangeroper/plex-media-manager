"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, Play } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

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

const AVAILABLE_MODELS = [
  { value: "sd-3.5-medium", label: "SD 3.5 Medium (Recommended, 10-12GB)" },
  { value: "sdxl-turbo", label: "SDXL Turbo (Fastest, 6-8GB)" },
  { value: "sd-1.5", label: "SD 1.5 (Classic, 4GB)" },
  { value: "sd-3.5-large", label: "SD 3.5 Large (Best Quality, 16GB+)" },
]

const AVAILABLE_STYLES = [
  { value: "cinematic", label: "Cinematic" },
  { value: "cartoon", label: "Cartoon" },
  { value: "anime", label: "Anime" },
  { value: "photorealistic", label: "Photorealistic" },
  { value: "artistic", label: "Artistic" },
  { value: "noir", label: "Film Noir" },
  { value: "vibrant", label: "Vibrant" },
]

export function StableDiffusionProvider({ libraries, onStartGeneration, isGenerating }: StableDiffusionProviderProps) {
  const [selectedStyle, setSelectedStyle] = useState<string>("")
  const [selectedModel, setSelectedModel] = useState<string>("")
  const { toast } = useToast()

  const isExpanded = libraries.length > 0

  // Load saved settings for the first library
  useEffect(() => {
    async function loadSettings() {
      if (libraries.length > 0 && libraries[0].key) {
        try {
          const response = await fetch(`/api/posters/config/${libraries[0].key}`)
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
          console.error("Failed to load settings:", error)
        }
      }
    }

    loadSettings()
  }, [libraries])

  const handleStartGeneration = async () => {
    if (!selectedModel || !selectedStyle) {
      toast({
        title: "Configuration Required",
        description: "Please select both a model and style before generating",
        variant: "destructive",
      })
      return
    }

    try {
      const validLibraries = libraries.filter((lib) => lib.key && lib.key !== "undefined")

      if (validLibraries.length === 0) {
        toast({
          title: "Error",
          description: "No valid libraries selected",
          variant: "destructive",
        })
        return
      }

      console.log(`[SD Provider] Saving settings: model=${selectedModel}, style=${selectedStyle}`)

      // Save settings for all selected libraries
      await Promise.all(
        validLibraries.map((library) =>
          fetch(`/api/posters/config/${library.key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "stable-diffusion",
              settings: {
                model: selectedModel,
                style: selectedStyle,
              },
            }),
          }),
        ),
      )

      // Start generation
      onStartGeneration()
    } catch (error) {
      console.error("Failed to start generation:", error)
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
                ? `${libraries.length} ${libraries.length === 1 ? "library" : "libraries"} selected`
                : "Select libraries to configure"}
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="model-select">Model *</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose the AI model for poster generation</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="style-select">Style *</Label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger id="style-select">
                  <SelectValue placeholder="Select a style..." />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose the artistic style for generated posters</p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {selectedModel && selectedStyle ? "Ready to generate" : "Configuration required"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedModel && selectedStyle
                    ? "Settings will be saved automatically when you start"
                    : "Please select both model and style"}
                </p>
              </div>

              <Button
                onClick={handleStartGeneration}
                disabled={libraries.length === 0 || isGenerating || !selectedModel || !selectedStyle}
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
