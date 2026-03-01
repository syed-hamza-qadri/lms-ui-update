'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityLog {
  id: string
  user_id: string
  lead_id: string
  action_type: string
  description: string
  created_at: string
  user_name?: string
  lead_name?: string
  scheduled_for?: string | null
}

interface ActivityLogsProps {
  isLoading: boolean
  activities: ActivityLog[]
  totalCount: number
  currentPage: number
  logsPerPage: number
  onSelectActivity: (activity: ActivityLog) => void
  onPreviousPage: () => void
  onNextPage: () => void
  getActionColor: (action: string) => string
}

export function ActivityLogs({
  isLoading,
  activities,
  totalCount,
  currentPage,
  logsPerPage,
  onSelectActivity,
  onPreviousPage,
  onNextPage,
  getActionColor,
}: ActivityLogsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No activity yet</p>
  }

  const totalPages = Math.ceil(totalCount / logsPerPage)

  return (
    <div className="space-y-4">
      {activities.map((activity: any) => (
        <div
          key={activity.id}
          className="flex items-start justify-between border-b border-border pb-4 last:border-b-0 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
          onClick={() => onSelectActivity(activity)}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{activity.user_name}</span>
              <Badge variant="secondary" className={getActionColor(activity.action_type)}>
                {activity.action_type}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Lead: <span className="font-medium">{activity.lead_name}</span>
            </p>
            {activity.description && (
              <p className="text-sm text-foreground mt-1">{activity.description}</p>
            )}
            {activity.action_type === 'later' && activity.scheduled_for && (
              <p className="text-sm text-foreground mt-2 font-medium">
                📅 Scheduled for: {new Date(activity.scheduled_for).toLocaleDateString()}
                {(() => {
                  const scheduledDate = new Date(activity.scheduled_for)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  scheduledDate.setHours(0, 0, 0, 0)
                  const daysRemaining = Math.ceil(
                    (scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  )
                  return daysRemaining > 0 ? ` (${daysRemaining} days remaining)` : ' (due today)'
                })()}
              </p>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {new Date(activity.created_at).toLocaleDateString()} at{' '}
            {new Date(activity.created_at).toLocaleTimeString()}
          </div>
        </div>
      ))}

      {/* Pagination Controls */}
      {totalCount > logsPerPage && (
        <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
          <div className="text-sm text-muted-foreground">
            Showing {currentPage * logsPerPage + 1} to{' '}
            {Math.min((currentPage + 1) * logsPerPage, totalCount)} of {totalCount} logs
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPreviousPage}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                Page {currentPage + 1} of {totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onNextPage}
              disabled={(currentPage + 1) * logsPerPage >= totalCount}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
