'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase-context'
import { useSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, LogOut, Settings, Users, Activity, BarChart3, Calendar, FileText, ShieldCheck } from 'lucide-react'

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
  const supabase = useSupabaseClient()
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total_leads: 0, total_responses: 0, active_users: 0 })
  const [selectedActivity, setSelectedActivity] = useState<ActivityLog | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalLogsCount, setTotalLogsCount] = useState(0)
  const logsPerPage = 20

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
      approve: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      decline: 'bg-rose-100 text-rose-800 border-rose-200',
      later: 'bg-amber-100 text-amber-800 border-amber-200',
    }
    return colors[action] || 'bg-slate-100 text-slate-800 border-slate-200'
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
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </main>
    )
  }

  if (session.user_role !== 'admin') {
    return (
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
          <p className="text-red-600 font-medium">Unauthorized access</p>
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fcfcfc] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fcfcfc] pb-12">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/setup')}
              className="hidden md:flex items-center gap-2 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              <Settings className="w-4 h-4" />
              Setup Data
            </Button>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl text-gray-600 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-16 h-16 text-blue-600" />
            </div>
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Leads</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="text-4xl font-black text-gray-900">{stats.total_leads}</div>
              <p className="text-sm text-gray-500 mt-2 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> In system
              </p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <BarChart3 className="w-16 h-16 text-indigo-600" />
            </div>
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Responses</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="text-4xl font-black text-gray-900">{stats.total_responses}</div>
              <p className="text-sm text-gray-500 mt-2 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> Actions taken
              </p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Activity className="w-16 h-16 text-emerald-600" />
            </div>
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Users (24h)</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="text-4xl font-black text-gray-900">{stats.active_users}</div>
              <p className="text-sm text-gray-500 mt-2 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Employees active
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-gray-100/80 rounded-xl mb-8">
            <TabsTrigger value="activity" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm font-medium">
              Activity Log
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm font-medium">
              Manage Users
            </TabsTrigger>
          </TabsList>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-gray-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-5">
                <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  Recent Activity
                </CardTitle>
                <CardDescription className="text-gray-500">Employee actions on leads across the system</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Activity className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No activity recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {activities.map((activity: any) => (
                      <div
                        key={activity.id}
                        className="flex flex-col sm:flex-row sm:items-start justify-between p-6 cursor-pointer hover:bg-gray-50 transition-colors group"
                        onClick={() => {
                          setSelectedActivity(activity)
                          setShowDialog(true)
                        }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold text-gray-900">{activity.user_name}</span>
                            <Badge variant="outline" className={`px-2.5 py-0.5 font-medium border ${getActionColor(activity.action_type)}`}>
                              {activity.action_type}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Lead: <span className="font-medium text-gray-900">{activity.lead_name}</span>
                          </p>
                          {activity.description && (
                            <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 inline-block">
                              {activity.description}
                            </p>
                          )}
                          {activity.action_type === 'later' && activity.scheduled_for && (
                            <div className="flex items-center gap-1.5 mt-3 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg w-fit">
                              <Calendar className="w-4 h-4" />
                              Scheduled for: {new Date(activity.scheduled_for).toLocaleDateString()}
                              {(() => {
                                const scheduledDate = new Date(activity.scheduled_for)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)
                                scheduledDate.setHours(0, 0, 0, 0)
                                const daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                                return daysRemaining > 0 ? <span className="opacity-75">({daysRemaining} days left)</span> : <span className="text-red-600 font-bold">(due today)</span>
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-medium text-gray-400 mt-4 sm:mt-0 whitespace-nowrap group-hover:text-gray-500 transition-colors">
                          {new Date(activity.created_at).toLocaleDateString()} at{' '}
                          {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
              
              {/* Pagination Controls */}
              {totalLogsCount > logsPerPage && (
                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-100 p-4 bg-gray-50/50 gap-4">
                  <div className="text-sm font-medium text-gray-500">
                    Showing <span className="text-gray-900">{currentPage * logsPerPage + 1}</span> to <span className="text-gray-900">{Math.min((currentPage + 1) * logsPerPage, totalLogsCount)}</span> of <span className="text-gray-900">{totalLogsCount}</span> logs
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-gray-200"
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center px-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg">
                      Page {currentPage + 1} of {Math.ceil(totalLogsCount / logsPerPage)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-gray-200"
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
          <TabsContent value="users" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-gray-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-5">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    Employees
                  </CardTitle>
                  <CardDescription className="text-gray-500 mt-1">Manage system users and their roles</CardDescription>
                </div>
                <Button 
                  onClick={() => router.push('/admin/users')}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  Manage Users
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Users className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No users found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {users.map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{user.name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                          {user.role}
                        </Badge>
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
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-indigo-600 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Activity Details</DialogTitle>
              <DialogDescription className="text-indigo-100">Complete information about this action</DialogDescription>
            </DialogHeader>
          </div>
          
          {selectedActivity && (
            <div className="p-6 space-y-5 bg-white">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</label>
                  <p className="text-gray-900 font-medium">{selectedActivity.user_name}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</label>
                  <div>
                    <Badge className={`px-2.5 py-0.5 font-medium border ${getActionColor(selectedActivity.action_type)}`}>
                      {selectedActivity.action_type}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lead</label>
                <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-xl border border-gray-100">{selectedActivity.lead_name}</p>
              </div>
              
              {selectedActivity.description && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</label>
                  <p className="text-gray-700 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm leading-relaxed">{selectedActivity.description}</p>
                </div>
              )}
              
              {selectedActivity.action_type === 'later' && selectedActivity.scheduled_for && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduled For</label>
                  <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-900 font-medium">
                    <Calendar className="w-5 h-5 text-amber-600" />
                    {new Date(selectedActivity.scheduled_for).toLocaleDateString()}
                    {(() => {
                      const scheduledDate = new Date(selectedActivity.scheduled_for)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      scheduledDate.setHours(0, 0, 0, 0)
                      const daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      return daysRemaining > 0 ? <span className="text-amber-600 text-sm">({daysRemaining} days left)</span> : <span className="text-red-600 text-sm font-bold">(due today)</span>
                    })()}
                  </div>
                </div>
              )}
              
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recorded At</label>
                <p className="text-gray-600 text-sm">
                  {new Date(selectedActivity.created_at).toLocaleDateString()} at{' '}
                  {new Date(selectedActivity.created_at).toLocaleTimeString()}
                </p>
              </div>
              
              <Button onClick={() => setShowDialog(false)} className="w-full mt-6 rounded-xl h-12 bg-gray-900 hover:bg-gray-800 text-white">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
