import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { X, Loader2, CheckCircle2 } from "lucide-react"

interface GenerationTask {
  id: string
  libraryTitle: string
  status: 'pending' | 'running' | 'completed' | 'paused' | 'error'
  totalItems: number
  processedItems: number
  provider: 'stable-diffusion' | 'fanart' | 'tmdb' | 'imdb'
}

interface GenerationProgressProps {
  tasks: GenerationTask[]
  isGenerating: boolean
  onClose: () => void
}

export function GenerationProgress({
  tasks,
  isGenerating,
  onClose,
}: GenerationProgressProps) {
  const getTotalProgress = () => {
    if (tasks.length === 0) return 0
    const totalItems = tasks.reduce((sum, t) => sum + t.totalItems, 0)
    const processedItems = tasks.reduce((sum, t) => sum + t.processedItems, 0)
    return Math.round((processedItems / totalItems) * 100)
  }

  const getActiveTask = () => tasks.find((t) => t.status === 'running')
  const activeTask = getActiveTask()

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      'stable-diffusion': 'Stable Diffusion',
      'fanart': 'FanArt.tv',
      'tmdb': 'TMDB',
      'imdb': 'IMDb',
    }
    return labels[provider] || provider
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 z-50">
      <Card className="border-border bg-card shadow-2xl">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                <h4 className="font-semibold text-sm">Poster Generation</h4>
              </div>

              {activeTask && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {activeTask.libraryTitle}
                  </p>
                  <Badge variant="secondary" className="text-xs h-5">
                    {getProviderLabel(activeTask.provider)}
                  </Badge>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{getTotalProgress()}%</span>
            </div>
            <Progress value={getTotalProgress()} className="h-2" />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {tasks.filter((t) => t.status === 'completed').length} / {tasks.length} libraries
            </p>

            {/* SD jobs cannot be paused, so hide Pause/Resume */}
            {!tasks.some(t => t.provider === 'stable-diffusion') && (
              isGenerating ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  Pause
                </Button>
              ) : tasks.some(t => t.status === 'paused') ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  Resume
                </Button>
              ) : null
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
