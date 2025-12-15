import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { X, Loader2, CheckCircle2, Pause, Play } from "lucide-react"
import { usePosterJobControl } from "@/hooks/usePosterJobs"

interface GenerationTask {
  id: string
  libraryTitle: string
  status: 'pending' | 'running' | 'completed' | 'paused' | 'failed'
  totalItems: number
  completedItems: number
  failedItems: number
  currentItem?: string
  progress: number
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
    return Math.round(
      tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
    )
  }

  const getActiveTask = () => tasks.find((t) => t.status === 'running')
  const activeTask = getActiveTask()
  const firstTask = tasks[0]

  // Control for the first task (or could be active task)
  const { pauseJob, resumeJob, isControlling } = usePosterJobControl(firstTask?.id || '')

  const handlePauseResume = async () => {
    if (!firstTask) return

    try {
      if (firstTask.status === 'running') {
        await pauseJob()
      } else if (firstTask.status === 'paused') {
        await resumeJob()
      }
    } catch (error) {
      console.error('Failed to control job:', error)
    }
  }

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      'stable-diffusion': 'Stable Diffusion',
      'fanart': 'FanArt.tv',
      'tmdb': 'TMDB',
      'imdb': 'IMDb',
    }
    return labels[provider] || provider
  }

  const totalCompleted = tasks.reduce((sum, t) => sum + t.completedItems, 0)
  const totalFailed = tasks.reduce((sum, t) => sum + t.failedItems, 0)
  const totalItems = tasks.reduce((sum, t) => sum + t.totalItems, 0)

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

              {activeTask?.currentItem && (
                <p className="text-xs text-muted-foreground truncate">
                  Current: {activeTask.currentItem}
                </p>
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

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <div className="space-y-0.5">
              <p className="text-muted-foreground">
                {totalCompleted} / {totalItems} items completed
              </p>
              {totalFailed > 0 && (
                <p className="text-destructive">
                  {totalFailed} failed
                </p>
              )}
              <p className="text-muted-foreground">
                {tasks.filter((t) => t.status === 'completed').length} / {tasks.length} libraries
              </p>
            </div>

            {/* Pause/Resume button for SD jobs */}
            {firstTask && (firstTask.status === 'running' || firstTask.status === 'paused') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handlePauseResume}
                disabled={isControlling}
              >
                {firstTask.status === 'running' ? (
                  <>
                    <Pause className="h-3 w-3" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    Resume
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}