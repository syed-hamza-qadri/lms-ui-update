'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, LogOut } from 'lucide-react'

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

interface User {
  id: string
  name: string
  email: string
  role: string
  created_at: string
}

export default function AdminDashboard() {
  const router = useRouter()
  const { session, loading: sessionLoading } = useSession()
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total_leads: 0, total_responses: 0, active_users: 0 })
  const [selectedActivity, setSelectedActivity] = useState<ActivityLog | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalLogsCount, setTotalLogsCount] = useState(0)
  const logsPerPage = 20
  const supabase = getSupabaseClient()

  const fetchData = async () => {
    try {
      if (!session?.user_id) return
      // Fetch activity logs with pagination
      const { data: logsData, count, error: logsError } = await supabase
        .from('activity_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * logsPerPage, (currentPage + 1) * logsPerPage - 1)

      if (logsError) throw logsError
      
      setTotalLogsCount(count || 0)

      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (usersError) throw usersError

      // Fetch stats
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })

      const { count: totalResponses } = await supabase
        .from('lead_responses')
        .select('id', { count: 'exact', head: true })

      // Get distinct count of active users in last 24 hours (limited to recent 10000 logs for performance)
      const { data: activeUsersData } = await supabase
        .from('activity_log')
        .select('user_id')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(10000)

      const activeUsersSet = new Set((activeUsersData || []).map((log: any) => log.user_id))
      const activeUsersCount = activeUsersSet.size

      // Fetch enrichment data with JOINs instead of per-log queries
      const { data: enrichedUsersData } = await supabase
        .from('users')
        .select('id, name')
        .in('id', Array.from(new Set((logsData || []).map((l: any) => l.user_id))))

      const { data: enrichedLeadsData } = await supabase
        .from('leads')
        .select('id, data')
        .in('id', Array.from(new Set((logsData || []).map((l: any) => l.lead_id).filter(Boolean))))

      // Create lookup maps
      const userMap = new Map((enrichedUsersData || []).map((u: any) => [u.id, u.name]))
      const leadMap = new Map((enrichedLeadsData || []).map((l: any) => [l.id, l.data?.name]))

      // Enrich logs using maps (no additional queries)
      const enrichedLogs = (logsData || []).map((log: any) => ({
        ...log,
        user_name: userMap.get(log.user_id) || 'Unknown User',
        lead_name: leadMap.get(log.lead_id) || 'Unknown Lead',
        scheduled_for: null,
      }))

      setActivities(enrichedLogs)
      setUsers(usersData || [])
      setStats({
        total_leads: totalLeads || 0,
        total_responses: totalResponses || 0,
        active_users: activeUsersCount,
      })
    } catch (error) {
      console.error('[v0] Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Check admin authentication on mount
  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/')
      return
    }
    if (sessionLoading) return
    
    // Check if user role is admin
    if (session && session.user_role !== 'admin') {
      router.push('/')
      return
    }

    if (session?.user_role === 'admin') {
      fetchData()
    }
  }, [session, sessionLoading, router])

  // Fetch data when page changes (pagination only - no real-time subscriptions)
  useEffect(() => {
    if (session?.user_role === 'admin') {
      fetchData()
    }
  }, [currentPage, session?.user_role])

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      approve: 'bg-green-100 text-green-800',
      decline: 'bg-red-100 text-red-800',
      later: 'bg-yellow-100 text-yellow-800',
    }
    return colors[action] || 'bg-gray-100 text-gray-800'
  }

  const handleLogout = async () => {
    try {
      // Token is in HttpOnly cookie, automatically sent with request
      await fetch('/api/sessions', {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      router.push('/')
    }
  }

  if (sessionLoading || !session) {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  if (session.user_role !== 'admin') {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">Unauthorized access</p>
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-2">Monitor system activity and manage users</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                router.push('/admin/setup')
              }}
              className="flex items-center gap-2"
            >
              Setup Data
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total_leads}</div>
              <p className="text-xs text-muted-foreground mt-1">In system</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total_responses}</div>
              <p className="text-xs text-muted-foreground mt-1">Actions taken</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Users (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.active_users}</div>
              <p className="text-xs text-muted-foreground mt-1">Employees active</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
            <TabsTrigger value="users">Manage Users</TabsTrigger>
          </TabsList>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Employee actions on leads</CardDescription>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No activity yet</p>
                ) : (
                  <div className="space-y-4">
                    {activities.map((activity: any) => (
                      <div
                        key={activity.id}
                        className="flex items-start justify-between border-b border-border pb-4 last:border-b-0 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                        onClick={() => {
                          setSelectedActivity(activity)
                          setShowDialog(true)
                        }}
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
                                const daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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
                  </div>
                )}
              </CardContent>
              
              {/* Pagination Controls */}
              {totalLogsCount > logsPerPage && (
                <div className="flex items-center justify-between border-t border-border p-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {currentPage * logsPerPage + 1} to {Math.min((currentPage + 1) * logsPerPage, totalLogsCount)} of {totalLogsCount} logs
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Page {currentPage + 1} of {Math.ceil(totalLogsCount / logsPerPage)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={(currentPage + 1) * logsPerPage >= totalLogsCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Employees</CardTitle>
                  <CardDescription>Manage system users</CardDescription>
                </div>
                <Button onClick={() => router.push('/admin/users')}>
                  Manage Users
                </Button>
              </CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No users yet</p>
                ) : (
                  <div className="space-y-4">
                    {users.map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between border-b border-border pb-4 last:border-b-0"
                      >
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <Badge variant="outline">{user.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Activity Details Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
            <DialogDescription>Complete information about this activity</DialogDescription>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Employee</label>
                <p className="text-foreground font-medium">{selectedActivity.user_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Lead</label>
                <p className="text-foreground font-medium">{selectedActivity.lead_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Action</label>
                <div className="mt-1">
                  <Badge className={getActionColor(selectedActivity.action_type)}>
                    {selectedActivity.action_type}
                  </Badge>
                </div>
              </div>
              {selectedActivity.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <p className="text-foreground mt-1">{selectedActivity.description}</p>
                </div>
              )}
              {selectedActivity.action_type === 'later' && selectedActivity.scheduled_for && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Scheduled For</label>
                  <p className="text-foreground font-medium">
                    {new Date(selectedActivity.scheduled_for).toLocaleDateString()}
                    {(() => {
                      const scheduledDate = new Date(selectedActivity.scheduled_for)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      scheduledDate.setHours(0, 0, 0, 0)
                      const daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      return daysRemaining > 0 ? ` (${daysRemaining} days remaining)` : ' (due today)'
                    })()}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Recorded At</label>
                <p className="text-foreground">
                  {new Date(selectedActivity.created_at).toLocaleDateString()} at{' '}
                  {new Date(selectedActivity.created_at).toLocaleTimeString()}
                </p>
              </div>
              <Button onClick={() => setShowDialog(false)} className="w-full mt-4">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
