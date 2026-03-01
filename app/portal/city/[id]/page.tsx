'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase-context'
import { useToast } from '@/hooks/use-toast'
import { wasLeadPreviouslyScheduled, resetCorrectionStatus, getCorrectionStatusInfo } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, ArrowLeft, ChevronRight, Calendar, BarChart3, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Lead {
  id: string
  data: Record<string, any>
  status: string
  created_at: string
  scheduled_for?: string
  correction_status?: 'pending' | 'corrected' | null
  corrected_at?: string
}

interface LeadWithSchedule extends Lead {
  daysRemaining?: number
  was_later?: boolean  // Track if lead was previously scheduled
  wasScheduled?: boolean  // Database-backed flag for Later - Unassigned
  lastActionedAt?: string  // Track when the last action was taken
  lastAction?: string  // Track what the last action was
  correctionInfo?: any  // Correction status info
}

export default function LeadList() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const cityId = params.id as string
  const [leads, setLeads] = useState<LeadWithSchedule[]>([])
  const [cityName, setCityName] = useState('')
  const [nicheName, setNicheName] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [defaultTab, setDefaultTab] = useState('unassigned')
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [performance, setPerformance] = useState({ approved: 0, declined: 0, scheduled: 0, pending: 0, wrong: 0, corrected: 0 })
  const supabase = useSupabaseClient()

  // Check for tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'assigned') {
      setDefaultTab('assigned')
    }
  }, [searchParams])

  const fetchLeads = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    
    try {
      // Get city name and niche
      const { data: cityData, error: cityError } = await supabase
        .from('cities')
        .select('name, niche_id, niches(name)')
        .eq('id', cityId)
        .single()

      if (cityError) throw cityError
      setCityName(cityData?.name || '')
      setNicheName(cityData?.niches?.name || '')

    // Get leads for this city - include correction_status and corrected_at
    const { data, error } = await supabase
      .from('leads')
      .select('id, data, status, created_at, follow_up_date, correction_status, corrected_at')
      .eq('city_id', cityId)
      .order('created_at', { ascending: false })
      .limit(100) // Add pagination

    if (error) throw error

    // Fetch all response data in one query instead of per-lead
    const leadIds = (data || []).map((l: any) => l.id)
    const { data: responseData } = await supabase
      .from('lead_responses')
      .select('lead_id, scheduled_for, action, actioned_at, created_at')
      .in('lead_id', leadIds.length > 0 ? leadIds : [''])
      .order('actioned_at', { ascending: false })

    // Create lookup maps for quick access
    const scheduledMap = new Map<string, string>()
    const actionMapInitial = new Map<string, { action: string; actioned_at: string }>()
    ;(responseData || []).forEach((response: any) => {
      if (!scheduledMap.has(response.lead_id)) {
        scheduledMap.set(response.lead_id, response.scheduled_for)
      }
      if (!actionMapInitial.has(response.lead_id)) {
        actionMapInitial.set(response.lead_id, {
          action: response.action,
          actioned_at: response.actioned_at || response.created_at
        })
      }
    })

    // Enrich leads using maps (no additional queries) and check for wasScheduled flag + correction status
    const enrichedLeads = await Promise.all((data || []).map(async (lead: any) => {
      let daysRemaining = 0
      let wasLater = false
      let wasScheduled = false
      const actionInfo = actionMapInitial.get(lead.id)

      // Get correction status info
      const correctionInfo = await getCorrectionStatusInfo(lead.id)

      if (lead.status === 'scheduled' && lead.follow_up_date) {
        const scheduledDate = new Date(lead.follow_up_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        scheduledDate.setHours(0, 0, 0, 0)
        daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        
        // If scheduled date has passed, update status
        if (daysRemaining <= 0) {
          supabase
            .from('leads')
            .update({ status: 'unassigned' })
            .eq('id', lead.id)
            .then()
          wasLater = true  // Mark that this was previously scheduled
          wasScheduled = true  // Flag for Later - Unassigned
          return { 
            ...lead, 
            status: 'unassigned', 
            daysRemaining: 0, 
            was_later: true, 
            wasScheduled: true,
            lastActionedAt: actionInfo?.actioned_at, 
            lastAction: actionInfo?.action,
            correctionInfo
          }
        }
      }

      // For unassigned leads, check if they were previously scheduled
      if (lead.status === 'unassigned') {
        wasScheduled = await wasLeadPreviouslyScheduled(lead.id)
      }

      return { 
        ...lead, 
        daysRemaining, 
        was_later: wasLater, 
        wasScheduled: wasScheduled,
        lastActionedAt: actionInfo?.actioned_at, 
        lastAction: actionInfo?.action,
        correctionInfo
      }
    }))

    // Calculate performance metrics AFTER enrichment, based on CURRENT LEAD STATUS (not response action)
    // This ensures Later - Unassigned leads count as Pending when scheduled date passes
    let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
    
    enrichedLeads.forEach((lead: any) => {
      const status = lead.status
      if (status === 'approved') approved++
      else if (status === 'declined') declined++
      else if (status === 'scheduled') scheduled++
      else if (status === 'unassigned' && lead.correction_status !== 'pending') pending++  // Only count as pending if NOT a wrong lead awaiting correction
      
      // Count correction workflow statuses separately
      if (lead.correction_status === 'pending') wrong++
      else if (lead.correction_status === 'corrected') corrected++
    })
    
    setPerformance({ approved, declined, scheduled, pending, wrong, corrected })

    // SORTING LOGIC FOR UNASSIGNED AND ASSIGNED TABS
    
    // Sort for UNASSIGNED tab: Scheduled (including Later-Unassigned) → Corrected → Regular Unassigned
    const sortUnassignedLeads = (leads: any[]) => {
      return leads.sort((a: any, b: any) => {
        // 1. Scheduled leads FIRST (includes Later-Unassigned: status='unassigned' + wasScheduled=true)
        // Both true scheduled and Later-Unassigned are prioritized by days remaining
        const aIsScheduled = a.status === 'scheduled' || (a.status === 'unassigned' && a.wasScheduled)
        const bIsScheduled = b.status === 'scheduled' || (b.status === 'unassigned' && b.wasScheduled)
        
        if (aIsScheduled && !bIsScheduled) return -1
        if (!aIsScheduled && bIsScheduled) return 1
        if (aIsScheduled && bIsScheduled) {
          return (a.daysRemaining || 999) - (b.daysRemaining || 999)
        }
        
        // 2. Corrected leads (by corrected_at - most recent first)
        if (a.correction_status === 'corrected' && b.correction_status !== 'corrected') return -1
        if (a.correction_status !== 'corrected' && b.correction_status === 'corrected') return 1
        if (a.correction_status === 'corrected' && b.correction_status === 'corrected') {
          const aTime = a.corrected_at ? new Date(a.corrected_at).getTime() : 0
          const bTime = b.corrected_at ? new Date(b.corrected_at).getTime() : 0
          return bTime - aTime  // Most recent first
        }
        
        // 3. Regular Unassigned leads (never scheduled - by creation date - newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    // Sort for ASSIGNED tab: by action time (latest first)
    const sortAssignedLeads = (leads: any[]) => {
      return leads.sort((a: any, b: any) => {
        // Sort all assigned leads by their most recent action (latest first)
        const aTime = a.lastActionedAt ? new Date(a.lastActionedAt).getTime() : 0
        const bTime = b.lastActionedAt ? new Date(b.lastActionedAt).getTime() : 0
        
        if (aTime !== bTime) {
          return bTime - aTime  // Most recent first
        }
        
        // Fallback: by creation date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    // Apply sorting to unassigned and assigned leads separately
    const unassignedLeads = enrichedLeads.filter(l => l.status === 'unassigned' && l.correction_status !== 'pending')
    const assignedLeads = enrichedLeads.filter(l => l.status !== 'unassigned' || l.correction_status === 'pending')
    
    const sortedUnassigned = sortUnassignedLeads(unassignedLeads)
    const sortedAssigned = sortAssignedLeads(assignedLeads)
    
    // Combine both sorted arrays
    const sorted = [...sortedUnassigned, ...sortedAssigned]

    setLeads(sorted)

    if (isRefresh) {
      toast({
        title: 'Refreshed',
        description: 'Leads updated successfully',
      })
    }
    } catch (error) {
      console.error('[v0] Error fetching leads:', error)
      toast({
        title: 'Error',
        description: 'Failed to load leads',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (cityId) {
      fetchLeads(false)
    }
  }, [cityId, supabase])

  const getStatusColor = (status: string, wasScheduled?: boolean, correctionStatus?: string | null) => {
    // Correction status takes priority for badge color
    if (correctionStatus === 'pending') {
      return 'bg-red-100 text-red-700 border-red-200'  // Red for "Wrong"
    }
    if (correctionStatus === 'corrected') {
      return 'bg-green-100 text-green-700 border-green-200'  // Green for "Corrected"
    }
    
    if (wasScheduled && status === 'unassigned') {
      return 'bg-purple-100 text-purple-700 border-purple-200'  // Purple for "Later - Unassigned"
    }
    const colors: Record<string, string> = {
      unassigned: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      approved: 'bg-blue-100 text-blue-700 border-blue-200',
      declined: 'bg-red-100 text-red-700 border-red-200',
      scheduled: 'bg-amber-100 text-amber-700 border-amber-200',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // Categorize leads by correction status and lead status
  // Pending corrections go to "assigned" tab with "Wrong" badge
  // Corrected leads stay in "unassigned" tab with "Corrected" badge
  const unassignedLeads = leads.filter(l => l.status === 'unassigned' && l.correction_status !== 'pending')
  const assignedLeads = leads.filter(l => l.status !== 'unassigned' || l.correction_status === 'pending')

  const LeadCard = ({ lead }: { lead: LeadWithSchedule }) => {
    // Parse and display lead details
    const getDetailFields = () => {
      const fields: Array<[string, string]> = [];
      
      Object.entries(lead.data || {})
        .filter(([key]) => key !== 'name')
        .forEach(([key, value]) => {
          const stringValue = String(value);
          
          // Check if value has key=value pairs
          if (stringValue.includes('=') && stringValue.includes(',')) {
            stringValue.split(',').forEach(pair => {
              const [k, v] = pair.split('=').map(s => s.trim());
              if (k) fields.push([k, v || '']);
            });
          } else if (stringValue.includes('=') && !stringValue.includes(',')) {
            const [k, v] = stringValue.split('=').map(s => s.trim());
            if (k) fields.push([k, v || '']);
          } else {
            fields.push([key.replace(/_/g, ' '), stringValue]);
          }
        });
      
      return fields;
    };

    const detailFields = getDetailFields().slice(0, 3); // Show first 3 fields

    return (
      <Card
        className="hover:shadow-lg hover:border-primary/50 transition-all duration-200 cursor-pointer border overflow-hidden"
        onClick={() => router.push(`/portal/lead/${lead.id}`)}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header with Status */}
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-border/50">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-1">
                  {lead.data?.name || 'Lead'}
                </h3>
                {lead.status === 'scheduled' && lead.daysRemaining !== undefined && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {lead.daysRemaining}d
                  </p>
                )}
              </div>
              <Badge 
                variant="outline" 
                className={`text-xs px-2 py-1 font-semibold whitespace-nowrap border ${getStatusColor(lead.status, lead.wasScheduled, lead.correction_status)}`}
              >
                {lead.correction_status === 'pending' 
                  ? 'Wrong' 
                  : lead.correction_status === 'corrected'
                  ? 'Corrected'
                  : lead.wasScheduled && lead.status === 'unassigned' 
                  ? 'Later - Unassigned' 
                  : lead.status.charAt(0).toUpperCase() + lead.status.slice(1)
                }
              </Badge>
            </div>

            {/* Details Grid with Icons */}
            {detailFields.length > 0 && (
              <div className="space-y-2">
                {detailFields.map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <p className="text-xs font-semibold text-muted-foreground capitalize">
                      {key}
                    </p>
                    <p className="text-foreground truncate text-xs leading-snug">
                      {value}
                    </p>
                  </div>
                ))}
                {detailFields.length > 0 && Object.keys(lead.data || {}).length > 4 && (
                  <div className="text-xs text-primary pt-1 flex items-center gap-1 font-semibold">
                    <ChevronRight className="w-3 h-3" />
                    View all details
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fcfcfc] p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fcfcfc] p-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] rounded-full bg-blue-100/40 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] rounded-full bg-indigo-100/40 blur-[100px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/portal/caller')}
              className="h-10 w-10 p-0 rounded-lg border-gray-200 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {nicheName} in {cityName}
              </h1>
              <p className="text-gray-500 mt-2">Manage your leads</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => fetchLeads(true)} 
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
          </div>
        </div>

        {/* Performance Dialog */}
        <Dialog open={performanceOpen} onOpenChange={setPerformanceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-2">
              <DialogTitle>City Performance</DialogTitle>
              <DialogDescription>Your performance in this city</DialogDescription>
            </DialogHeader>
            
            <Card className="bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{nicheName} in {cityName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm pt-0">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Leads:</span>
                  <Badge variant="outline">{leads.length}</Badge>
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
                  <Badge className="bg-gray-100 text-gray-900">
                    {(performance.approved + performance.declined + performance.scheduled) > 0
                      ? Math.round((performance.approved / (performance.approved + performance.declined + performance.scheduled)) * 100)
                      : 0
                    }%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="unassigned">Unassigned ({unassignedLeads.length})</TabsTrigger>
            <TabsTrigger value="assigned">Assigned ({assignedLeads.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="unassigned" className="space-y-3 mt-6">
            {unassignedLeads.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">No unassigned leads</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unassignedLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="assigned" className="space-y-3 mt-6">
            {assignedLeads.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-muted-foreground">No assigned leads</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {assignedLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
