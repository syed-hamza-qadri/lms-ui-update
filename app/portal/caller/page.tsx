'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase-context'
import { useSession } from '@/lib/session'
import { getCallerLeads, getCallerNiches, getCallerCities } from '@/lib/auth'
import { useDebounce } from '@/lib/debounce'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, ChevronRight, LogOut, BarChart3, RefreshCw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Lead {
  id: string
  niche_id: string
  city_id: string
  data: Record<string, any>
  status: string
  assigned_to: string
  created_at: string
  correction_status?: 'pending' | 'corrected' | null
  corrected_at?: string
}

interface NicheData {
  id: string
  name: string
  description?: string
}

interface CityData {
  id: string
  name: string
  niche_id: string
}

export default function CallerPortal() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useSupabaseClient()
  const { session, loading: sessionLoading } = useSession()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [niches, setNiches] = useState<NicheData[]>([])
  const [cities, setCities] = useState<CityData[]>([])
  const [filteredCities, setFilteredCities] = useState<CityData[]>([])

  const [view, setView] = useState<'niches' | 'cities' | 'leads'>('niches')
  const [selectedNiche, setSelectedNiche] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  
  // Performance metrics
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [performance, setPerformance] = useState({ 
    totalNiches: 0,
    totalCities: 0,
    assigned: 0, 
    approved: 0, 
    declined: 0, 
    scheduled: 0, 
    pending: 0,
    wrong: 0,
    corrected: 0,
    conversionRate: 0
  })

  const [actionStatus, setActionStatus] = useState('')
  const [responseNotes, setResponseNotes] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  // Search and filter
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/portal')
      return
    }
    if (session) {
      fetchData()
    }
  }, [session, sessionLoading, router])

  useEffect(() => {
    if (selectedNiche) {
      const filtered = cities.filter(c => c.niche_id === selectedNiche)
      setFilteredCities(filtered)
      setSelectedCity('')
    }
  }, [selectedNiche, cities])

  const fetchData = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    
    try {
      setLoading(false)
      if (!session?.user_id) {
        router.push('/portal')
        return
      }

      // Fetch caller's assigned niches, cities, and leads
      const [nichesData, citiesData, leadsData] = await Promise.all([
        getCallerNiches(session.user_id),
        getCallerCities(session.user_id),
        getCallerLeads(session.user_id),
      ])

      const typedNiches: NicheData[] = (nichesData as any[]).map(n => ({
        id: n.id,
        name: n.name,
        description: n.description
      }))

      const typedCities: CityData[] = (citiesData as any[]).map(c => ({
        id: c.id,
        name: c.name,
        niche_id: c.niche_id
      }))

      setNiches(typedNiches)
      setCities(typedCities)
      setLeads(leadsData)
      
      // Calculate performance metrics based on current lead status (not just caller's actions)
      // This ensures we show metrics updated by any user (including managers)
      let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
      
      leadsData.forEach((lead: any) => {
        const status = lead.status
        if (status === 'approved') approved++
        else if (status === 'declined') declined++
        else if (status === 'scheduled') scheduled++
        else if (status === 'unassigned' && lead.correction_status !== 'pending') pending++  // Only count as pending if NOT awaiting correction
        
        // Count correction workflow statuses separately
        if (lead.correction_status === 'pending') wrong++
        else if (lead.correction_status === 'corrected') corrected++
      })
      
      const total = approved + declined + scheduled
      const conversionRate = total > 0 ? Math.round((approved / total) * 100) : 0
      
      setPerformance({
        totalNiches: typedNiches.length,
        totalCities: typedCities.length,
        assigned: leadsData.length,
        approved,
        declined,
        scheduled,
        pending,
        wrong,
        corrected,
        conversionRate
      })

      if (isRefresh) {
        toast({
          title: 'Refreshed',
          description: 'Leads and metrics updated successfully',
        })
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleTakeAction = async (action: string) => {
    if (!selectedLead || !action) {
      toast({
        title: 'Validation Error',
        description: 'Please select an action',
        variant: 'destructive',
      })
      return
    }

    setSubmittingAction(true)
    try {
      if (!session?.user_id) {
        throw new Error('Session not found')
      }
      
      // Map action values - normalize 'schedule' to 'scheduled'
      const mappedAction = action === 'schedule' ? 'scheduled' : action
      const userId = session.user_id
      
      // Calculate follow_up_date if scheduling (default to 6 days from now)
      let followUpDate = null
      if (action === 'schedule') {
        const date = new Date()
        date.setDate(date.getDate() + 6)
        followUpDate = date.toISOString()
      }
      
      // Create lead response with actioned_at automatically set by database trigger
      const { error: responseError } = await supabase
        .from('lead_responses')
        .insert({
          lead_id: selectedLead.id,
          employee_id: userId,
          action: mappedAction,
          response_text: responseNotes,
          scheduled_for: followUpDate
        })

      if (responseError) throw responseError

      // Update lead status and follow_up_date (actioned_at is automatically set by database trigger)
      const { error: updateError } = await supabase
        .from('leads')
        .update({ 
          status: mappedAction,
          follow_up_date: followUpDate
        })
        .eq('id', selectedLead.id)

      if (updateError) throw updateError

      // Log activity
      await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          action_type: `lead_${mappedAction}`,
          lead_id: selectedLead.id,
          description: `Caller ${mappedAction}ed lead: ${selectedLead.data.name}`,
        })

      toast({
        title: 'Success',
        description: `Lead ${mappedAction}ed successfully`,
      })

      setDetailsOpen(false)
      setResponseNotes('')
      setActionStatus('')
      fetchData()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      console.error('Error taking action:', errorMessage)
      console.error('Error details:', error)
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to process action',
        variant: 'destructive',
      })
    } finally {
      setSubmittingAction(false)
    }
  }

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.data.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    const matchesCity = !selectedCity || lead.city_id === selectedCity

    return matchesSearch && matchesCity
  })

  const handleLogout = async () => {
    try {
      await fetch('/api/sessions', {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      toast({
        title: 'Logged Out',
        description: 'You have been logged out successfully',
      })
      router.push('/portal')
    }
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Your Leads</h1>
            <p className="text-muted-foreground mt-2">Welcome, {session?.user_name}. Select a niche to view available leads</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => fetchData(true)} 
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Updating...' : 'Refresh'}
            </Button>
            <Button variant="outline" onClick={() => setPerformanceOpen(true)} className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Status
            </Button>
            <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Niches Section - Card View */}
        <div className="space-y-4 mb-8">
          {niches.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">No niches assigned yet. Contact your manager to assign niches.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {niches.map(niche => (
                <Card
                  key={niche.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setSelectedNiche(niche.id)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{niche.name}</CardTitle>
                    <CardDescription>{niche.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {cities.filter(c => c.niche_id === niche.id).length} cities
                      </span>
                      <ChevronRight className={`w-4 h-4 transition-transform ${selectedNiche === niche.id ? 'rotate-90' : ''}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cities Section - Card View (filtered by selected niche) */}
        {selectedNiche && (
          <div className="space-y-4 mb-8">
            <h2 className="text-2xl font-bold">
              Cities in {niches.find(n => n.id === selectedNiche)?.name}
            </h2>
            {filteredCities.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No cities in this niche.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCities.map(city => (
                  <Card
                    key={city.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => router.push(`/portal/city/${city.id}`)}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg">{city.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {leads.filter(l => l.city_id === city.id).length} leads
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Leads Section removed - users navigate via /portal/city/[id] */}

        {/* Performance Dialog */}
        <Dialog open={performanceOpen} onOpenChange={setPerformanceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-2">
              <DialogTitle>Your Performance Metrics</DialogTitle>
              <DialogDescription>Overview of your performance and capacity</DialogDescription>
            </DialogHeader>
            
            <Card className="bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{session?.user_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm pt-0">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Niches:</span>
                  <Badge variant="secondary">{performance.totalNiches}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Cities:</span>
                  <Badge variant="secondary">{performance.totalCities}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Leads in Territory:</span>
                  <Badge variant="outline">{performance.assigned || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Approved:</span>
                  <Badge className="bg-green-100 text-green-700">{performance.approved || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Declined:</span>
                  <Badge className="bg-red-100 text-red-700">{performance.declined || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Scheduled:</span>
                  <Badge variant="outline">{performance.scheduled || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Pending:</span>
                  <Badge className="bg-yellow-100 text-yellow-700">{performance.pending || 0}</Badge>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="font-semibold">Correction Status:</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Wrong:</span>
                  <Badge className="bg-red-100 text-red-700">{performance.wrong || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Corrected:</span>
                  <Badge className="bg-green-100 text-green-700">{performance.corrected || 0}</Badge>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="font-semibold">Conversion Rate:</span>
                  <Badge className="bg-gray-100 text-gray-900">{performance.conversionRate}%</Badge>
                </div>
              </CardContent>
            </Card>
          </DialogContent>
        </Dialog>

        {/* Lead Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Lead Details</DialogTitle>
              <DialogDescription>Review and take action on this lead</DialogDescription>
            </DialogHeader>

            {selectedLead && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <p className="text-foreground mt-1">{selectedLead.data.name}</p>
                </div>

                <div>
                  <label className="text-sm font-medium">Email</label>
                  <p className="text-foreground mt-1">{selectedLead.data.email}</p>
                </div>

                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <p className="text-foreground mt-1">{selectedLead.data.phone}</p>
                </div>

                {selectedLead.data.message && (
                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <p className="text-foreground mt-1 text-sm">{selectedLead.data.message}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium block mb-2">Take Action</label>
                  <div className="space-y-2">
                    <Button
                      variant={actionStatus === 'approved' ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setActionStatus('approved')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant={actionStatus === 'declined' ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setActionStatus('declined')}
                    >
                      Decline
                    </Button>
                    <Button
                      variant={actionStatus === 'schedule' ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setActionStatus('schedule')}
                    >
                      Schedule Follow-up
                    </Button>
                  </div>
                </div>

                {actionStatus && (
                  <div>
                    <label className="text-sm font-medium block mb-2">Response Notes (Optional)</label>
                    <textarea
                      placeholder="Add notes about this lead..."
                      value={responseNotes}
                      onChange={(e) => setResponseNotes(e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                    />
                  </div>
                )}

                {actionStatus && (
                  <Button
                    onClick={() => handleTakeAction(actionStatus)}
                    disabled={submittingAction}
                    className="w-full"
                  >
                    {submittingAction ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Confirm ${actionStatus}`
                    )}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
