'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useSession } from '@/lib/session'
import { useDebounce } from '@/lib/debounce'
import {
  getManagerCallers,
  assignNicheToCaller,
  assignCityToCaller,
  unassignNicheFromCaller,
  unassignCityFromCaller,
  sendLeadForCorrection,
} from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, LogOut, RefreshCw, Plus, Edit2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Caller {
  id: string
  name: string
  email: string
  assignmentId: string
  role?: string
}

interface Niche {
  id: string
  name: string
  description?: string
}

interface City {
  id: string
  name: string
  niche_id: string
}

interface Lead {
  id: string
  niche_id: string
  city_id: string
  data: Record<string, any>
  created_by?: string
  assigned_to?: string
  assigned_by_id?: string
  created_at: string
  actioned_at?: string | null
  status?: string
  follow_up_date?: string | null
  creator?: { id: string; name: string }
  correction_status?: 'pending' | 'corrected' | null
  corrected_at?: string
}

interface LeadResponse {
  action: string
}

interface CallerPerformance {
  assigned: number
  approved: number
  declined: number
  scheduled: number
  pending: number
  wrong: number
  corrected: number
}

interface LeadGeneratorPerformance {
  added: number
  approved: number
  declined: number
  scheduled: number
  pending: number
  wrong: number
  corrected: number
  conversionRate: number
}

export default function ManagerPortal() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = getSupabaseClient()
  const { session, loading: sessionLoading } = useSession()

  const [loading, setLoading] = useState<boolean>(true)
  const [callers, setCallers] = useState<Caller[]>([])
  const [allUsers, setAllUsers] = useState<Caller[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [callerNiches, setCallerNiches] = useState<{ [key: string]: Niche[] }>({})
  const [callerCities, setCallerCities] = useState<{ [key: string]: City[] }>({})
  const [callerPerformance, setCallerPerformance] = useState<{ [key: string]: CallerPerformance }>({})
  const [leadGeneratorPerformance, setLeadGeneratorPerformance] = useState<{ [key: string]: LeadGeneratorPerformance }>({})
  const [cityAssignmentsData, setCityAssignmentsData] = useState<any[]>([])
  const [leadResponses, setLeadResponses] = useState<{ [leadId: string]: any }>({})
  
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<any>(null)
  const [leadDetailsDialogOpen, setLeadDetailsDialogOpen] = useState(false)
  const [pendingCallerSelections, setPendingCallerSelections] = useState<{ [nicheId: string]: string }>({})
  const [pendingCitySelections, setPendingCitySelections] = useState<{ [nicheId: string]: string }>({})
  const [assigningPending, setAssigningPending] = useState<string>('')
  
  // Assigned reassignment state
  const [assignedCallerSelections, setAssignedCallerSelections] = useState<{ [cityId: string]: string }>({})
  const [reassigningCity, setReassigningCity] = useState<string>('')
  
  // Tab state
  const [activeTab, setActiveTab] = useState<string>('dashboard')
  
  // Tab loading states
  const [tabLoadingStates, setTabLoadingStates] = useState<{
    dashboard?: boolean
    'assign-niche'?: boolean
    leads?: boolean
    setup?: boolean
  }>({})
  
  // Lead filters state
  const [leadSearchFilter, setLeadSearchFilter] = useState<string>('')
  const [leadNicheFilter, setLeadNicheFilter] = useState<string>('')
  const [leadCityFilter, setLeadCityFilter] = useState<string>('')
  const [leadCreatedByFilter, setLeadCreatedByFilter] = useState<string>('')
  const [leadAssignedToFilter, setLeadAssignedToFilter] = useState<string>('')
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('')
  
  // Debounced search for better performance
  const debouncedSearchFilter = useDebounce(leadSearchFilter, 300)

  // Setup tab states
  const [setupDialogs, setSetupDialogs] = useState<{
    niche?: boolean
    city?: boolean
    lead?: boolean
  }>({})
  const [setupForms, setSetupForms] = useState<{
    nicheName?: string
    cityName?: string
    selectedNiche?: string
    leadName?: string
    selectedLeadNiche?: string
    selectedLeadCity?: string
    leadDetails?: string
  }>({})
  const [setupSaving, setSetupSaving] = useState(false)
  const [setupEditDetailsModalOpen, setSetupEditDetailsModalOpen] = useState(false)
  const [setupEditDetailsText, setSetupEditDetailsText] = useState('')
  const [editingNiche, setEditingNiche] = useState<{id: string, name: string} | null>(null)
  const [editingCity, setEditingCity] = useState<{id: string, name: string, niche_id: string} | null>(null)
  
  // Status edit state
  const [editingStatusLeadId, setEditingStatusLeadId] = useState<string | null>(null)
  const [statusUpdate, setStatusUpdate] = useState<string>('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [scheduleDays, setScheduleDays] = useState<string>('')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [editingLeadDetails, setEditingLeadDetails] = useState<{ index: number; name: string; callerName: string; leadId?: string; nicheId?: string; cityId?: string; lastActionBy?: string; lastActionTime?: string } | null>(null)
  
  // Lead status summary metrics
  const [leadStatusMetrics, setLeadStatusMetrics] = useState({
    pending: 0,
    approved: 0,
    scheduled: 0,
    declined: 0
  })
  
  // Correction metrics
  const [correctionMetrics, setCorrectionMetrics] = useState({
    pendingCorrection: 0,
    completedCorrection: 0
  })
  
  // Send for correction state
  const [correctionLeadId, setCorrectionLeadId] = useState<string | null>(null)
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [submittingCorrection, setSubmittingCorrection] = useState(false)
  const [existingCorrectionMessage, setExistingCorrectionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/portal')
      return
    }
    if (session) {
      fetchData()
    }
  }, [session, sessionLoading, router])

  const fetchData = async () => {
    try {
      setLoading(true)
      if (!session?.user_id) {
        router.push('/portal')
        return
      }
      const userId = session.user_id

      // Fetch ALL users with roles first
      const { data: allUsersData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('name') as any

      // Create a map of all users with role included
      const usersByIdMap = new Map<string, any>()
      ;(allUsersData || []).forEach((u: any) => {
        usersByIdMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          assignmentId: ''
        })
      })

      // Fetch callers assigned to this manager
      const callersData = await getManagerCallers(userId)
      let callersToDisplay: Caller[] = (callersData as any[]).length > 0 
        ? (callersData as any[]).map(c => {
            const id = c.id || c.users?.id
            return {
              id,
              name: c.name || c.users?.name,
              email: c.email || c.users?.email,
              role: usersByIdMap.get(id)?.role || 'caller',
              assignmentId: c.assignmentId || c.id
            }
          })
        : []
      
      // If no callers assigned yet, fetch all available callers
      if (callersToDisplay.length === 0) {
        const { data: allCallers } = await supabase
          .from('users')
          .select('id, name, email, role')
          .eq('role', 'caller')
          .order('name') as any
        
        callersToDisplay = ((allCallers || []) as any[]).map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          role: c.role,
          assignmentId: ''
        }))
      }
      
      // Build unique users map
      const uniqueUsersMap = new Map<string, any>()
      callersToDisplay.forEach(c => {
        uniqueUsersMap.set(c.id, c)
      })
      
      ;(allUsersData || []).forEach((u: any) => {
        if (!uniqueUsersMap.has(u.id)) {
          uniqueUsersMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            assignmentId: ''
          })
        }
      })

      const uniqueUsers = Array.from(uniqueUsersMap.values())
      
      // Keep original callers for dashboard
      setCallers(callersToDisplay)
      setAllUsers(uniqueUsers)

      // Fetch all niches and cities
      const { data: nichesData } = await supabase.from('niches').select('*').order('name') as any
      const { data: citiesData } = await supabase.from('cities').select('*').order('name') as any
      
      // Fetch limited leads for initial display (pagination)
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('*, creator:created_by(id, name), actioned_at')
        .order('created_at', { ascending: false })
        .limit(100) as any

      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
      }

      setNiches((nichesData || []) as Niche[])
      setCities((citiesData || []) as City[])
      setLeads((leadsData || []) as Lead[])

      // Calculate lead status metrics
      const metrics = {
        pending: 0,
        approved: 0,
        scheduled: 0,
        declined: 0
      }
      let pendingCorrection = 0
      let completedCorrection = 0
      
      ;(leadsData || []).forEach((lead: any) => {
        if (lead.status === 'unassigned') metrics.pending++
        else if (lead.status === 'approved') metrics.approved++
        else if (lead.status === 'scheduled') metrics.scheduled++
        else if (lead.status === 'declined') metrics.declined++
        
        // Count correction metrics
        if (lead.correction_status === 'pending') pendingCorrection++
        else if (lead.correction_status === 'corrected') completedCorrection++
      })
      setLeadStatusMetrics(metrics)
      setCorrectionMetrics({
        pendingCorrection,
        completedCorrection
      })

      // Fetch all assignments in batch (not per-caller)
      const { data: allNicheAssignments } = await supabase
        .from('niche_assignments')
        .select('caller_id, niches(id, name)')
        .in('caller_id', callersToDisplay.map(c => c.id)) as any

      const { data: allCityAssignments } = await supabase
        .from('city_assignments')
        .select('caller_id, assigned_by, city_id, cities(id, name)')
        .in('caller_id', callersToDisplay.map(c => c.id)) as any
      
      setCityAssignmentsData(allCityAssignments || [])

      // Fetch all lead responses once (not per-caller) - limited to recent 1000
      const { data: allLeadResponses } = await supabase
        .from('lead_responses')
        .select('lead_id, action, employee_id, response_text, scheduled_for, created_at, actioned_at')
        .order('created_at', { ascending: false })
        .limit(1000) as any

      // Create maps for quick lookup instead of iterating
      const nicheMapByCallerId = new Map<string, Niche[]>()
      const cityMapByCallerId = new Map<string, City[]>()
      const responseMapByLeadAndCaller = new Map<string, Map<string, string>>()

      // Build lookup maps
      ;(allNicheAssignments || []).forEach((assignment: any) => {
        if (!nicheMapByCallerId.has(assignment.caller_id)) {
          nicheMapByCallerId.set(assignment.caller_id, [])
        }
        nicheMapByCallerId.get(assignment.caller_id)!.push(assignment.niches)
      })

      ;(allCityAssignments || []).forEach((assignment: any) => {
        if (!cityMapByCallerId.has(assignment.caller_id)) {
          cityMapByCallerId.set(assignment.caller_id, [])
        }
        cityMapByCallerId.get(assignment.caller_id)!.push(assignment.cities)
      })

      ;(allLeadResponses || []).forEach((response: any) => {
        if (!responseMapByLeadAndCaller.has(response.lead_id)) {
          responseMapByLeadAndCaller.set(response.lead_id, new Map())
        }
        // Only store the LATEST action per lead per employee (skip duplicates)
        if (!responseMapByLeadAndCaller.get(response.lead_id)!.has(response.employee_id)) {
          responseMapByLeadAndCaller.get(response.lead_id)!.set(response.employee_id, response.action)
        }
      })

      // Calculate performance metrics using maps (no additional queries)
      const performanceData = new Map<string, CallerPerformance>()
      
      for (const caller of callersToDisplay) {
        const callerCities = cityMapByCallerId.get(caller.id) || []
        const assignedCityIds = callerCities.map(c => c.id)
        
        const leadsInCities = (leadsData || []).filter((l: any) => assignedCityIds.includes(l.city_id))
        let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0

        leadsInCities.forEach((lead: any) => {
          if (lead.correction_status === 'pending') {
            wrong++
          } else if (lead.correction_status === 'corrected') {
            corrected++
          } else if (lead.status === 'approved') {
            approved++
          } else if (lead.status === 'declined') {
            declined++
          } else if (lead.status === 'scheduled') {
            scheduled++
          } else if (lead.status === 'unassigned') {
            pending++
          }
        })

        performanceData.set(caller.id, {
          assigned: leadsInCities.length,
          approved,
          declined,
          scheduled,
          pending,
          wrong,
          corrected
        })

        setCallerNiches(prev => ({
          ...prev,
          [caller.id]: nicheMapByCallerId.get(caller.id) || []
        }))

        setCallerCities(prev => ({
          ...prev,
          [caller.id]: callerCities
        }))
      }

      // Batch set performance data
      setCallerPerformance(Object.fromEntries(performanceData))

      // Create a map of lead_id to latest response (full response object)
      const responseMap: { [leadId: string]: any } = {}
      ;(allLeadResponses || []).forEach((response: any) => {
        if (!responseMap[response.lead_id]) {
          responseMap[response.lead_id] = response
        }
      })
      setLeadResponses(responseMap)

      // Calculate lead generator performance
      const generatorPerformanceData = new Map<string, LeadGeneratorPerformance>()
      const allGenerators = new Set<string>()
      
      ;(leadsData || []).forEach((lead: any) => {
        if (lead.created_by) {
          allGenerators.add(lead.created_by)
        }
      })

      allGenerators.forEach((generatorId: string) => {
        const generatorLeads = (leadsData || []).filter((l: any) => l.created_by === generatorId)
        let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
        
        generatorLeads.forEach((lead: any) => {
          if (lead.correction_status === 'pending') {
            wrong++
          } else if (lead.correction_status === 'corrected') {
            corrected++
          } else if (lead.status === 'approved') {
            approved++
          } else if (lead.status === 'declined') {
            declined++
          } else if (lead.status === 'scheduled') {
            scheduled++
          } else if (lead.status === 'unassigned') {
            pending++
          }
        })

        const total = approved + declined + scheduled
        const conversionRate = total > 0 ? Math.round((approved / total) * 100) : 0

        generatorPerformanceData.set(generatorId, {
          added: generatorLeads.length,
          approved,
          declined,
          scheduled,
          pending,
          wrong,
          corrected,
          conversionRate
        })
      })

      setLeadGeneratorPerformance(Object.fromEntries(generatorPerformanceData))
    } catch (error) {
      console.error('Error fetching data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const reloadLeadsOnly = async () => {
    try {
      // Fetch fresh leads data
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('*, creator:created_by(id, name), actioned_at')
        .order('created_at', { ascending: false }) as any

      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
        return
      }

      // Fetch fresh niches and cities (in case they were added/updated)
      const { data: nichesData } = await supabase.from('niches').select('*').order('name') as any
      const { data: citiesData } = await supabase.from('cities').select('*').order('name') as any

      // Fetch fresh city assignments (in case lead was moved to different city)
      const { data: allCityAssignments } = await supabase
        .from('city_assignments')
        .select('city_id, caller_id, assigned_by')
        .order('created_at', { ascending: false }) as any

      // Fetch fresh callers and managers for accurate lookups
      const { data: freshCallers } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'caller')
        .order('name') as any

      const { data: freshManagers } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'manager')
        .order('name') as any

      const freshCallersData = ((freshCallers || []) as any[]).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        assignmentId: ''
      }))

      const freshManagersData = ((freshManagers || []) as any[]).map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        assignmentId: ''
      }))

      const freshAllUsers = [...freshCallersData, ...freshManagersData]

      // Fetch fresh lead responses
      const { data: allLeadResponses } = await supabase
        .from('lead_responses')
        .select('lead_id, action, scheduled_for, created_at, actioned_at, response_text')
        .order('created_at', { ascending: false }) as any

      // Create a map of lead_id to latest response
      const responseMap: { [leadId: string]: any } = {}
      ;(allLeadResponses || []).forEach((response: any) => {
        if (!responseMap[response.lead_id]) {
          responseMap[response.lead_id] = response
        }
      })

      // Update all states
      setLeads((leadsData || []) as Lead[])
      setNiches((nichesData || []) as Niche[])
      setCities((citiesData || []) as City[])
      setCityAssignmentsData(allCityAssignments || [])
      setAllUsers(freshAllUsers)
      setLeadResponses(responseMap)

      // Calculate lead status metrics
      const metrics = {
        pending: 0,
        approved: 0,
        scheduled: 0,
        declined: 0
      }
      let pendingCorrection = 0
      let completedCorrection = 0
      
      ;(leadsData || []).forEach((lead: any) => {
        if (lead.status === 'unassigned') metrics.pending++
        else if (lead.status === 'approved') metrics.approved++
        else if (lead.status === 'scheduled') metrics.scheduled++
        else if (lead.status === 'declined') metrics.declined++
        
        // Count correction metrics
        if (lead.correction_status === 'pending') pendingCorrection++
        else if (lead.correction_status === 'corrected') completedCorrection++
      })
      setLeadStatusMetrics(metrics)
      setCorrectionMetrics({
        pendingCorrection,
        completedCorrection
      })

      toast({
        title: 'Success',
        description: 'Leads table reloaded with latest data',
      })
    } catch (error) {
      console.error('Error reloading leads:', error)
      toast({
        title: 'Error',
        description: 'Failed to reload leads',
        variant: 'destructive',
      })
    }
  }

  // Handle status update for leads
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    setUpdatingStatus(true)
    try {
      // For schedule status, need days value
      if (newStatus === 'schedule' && !scheduleDays) {
        toast({
          title: 'Error',
          description: 'Please enter number of days for scheduled leads',
          variant: 'destructive',
        })
        setUpdatingStatus(false)
        return
      }

      if (!session?.user_id) {
        throw new Error('Session not found')
      }

      // Map status values - normalize 'schedule' to 'scheduled'
      const mappedStatus = newStatus === 'schedule' ? 'scheduled' : newStatus
      const updateData: any = { status: mappedStatus }
      let scheduledForDate = null
      
      // If scheduling, add the follow-up date
      if ((newStatus === 'schedule' || newStatus === 'scheduled') && scheduleDays) {
        const followUpDate = new Date()
        followUpDate.setDate(followUpDate.getDate() + parseInt(scheduleDays))
        updateData.follow_up_date = followUpDate.toISOString()
        scheduledForDate = followUpDate.toISOString()
      }

      // Update lead in database (includes setting actioned_at via trigger)
      const { error: leadError } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId)

      if (leadError) throw leadError

      // Check if lead_response already exists
      const { data: existingResponse, error: fetchError } = await supabase
        .from('lead_responses')
        .select('id')
        .eq('lead_id', leadId)
        .eq('employee_id', session.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Note: actioned_at is automatically set by database trigger
      // Create response object with proper action value
      const responseData = {
        action: mappedStatus,
        scheduled_for: scheduledForDate,
        response_text: statusMessage
      }

      // Update or insert lead_response
      if (existingResponse && existingResponse.id) {
        const { error: updateError } = await supabase
          .from('lead_responses')
          .update(responseData)
          .eq('id', existingResponse.id)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('lead_responses')
          .insert({
            lead_id: leadId,
            employee_id: session.user_id,
            ...responseData
          })

        if (insertError) throw insertError
      }

      // Update local state with the new status
      const updatedLeads = leads.map(l => 
        l.id === leadId ? { 
          ...l, 
          status: mappedStatus,
          follow_up_date: updateData.follow_up_date || l.follow_up_date || null
        } : l
      )
      setLeads(updatedLeads)
      
      // Update leadResponses to reflect the new action timestamp
      setLeadResponses(prev => ({
        ...prev,
        [leadId]: {
          id: leadId,
          action: mappedStatus,
          response_text: statusMessage,
          scheduled_for: scheduledForDate,
          actioned_at: new Date().toISOString()
        }
      }))
      
      // Update selectedLeadForDetails if dialog is open
      if (selectedLeadForDetails && selectedLeadForDetails.id === leadId) {
        setSelectedLeadForDetails({
          ...selectedLeadForDetails,
          status: mappedStatus,
          follow_up_date: updateData.follow_up_date || selectedLeadForDetails.follow_up_date || null
        })
      }
      
      // Clear editing state
      setEditingStatusLeadId(null)
      setStatusUpdate('')
      setScheduleDays('')
      setStatusMessage('')
      setEditingLeadDetails(null)
      setStatusDialogOpen(false)
      
      toast({
        title: 'Success',
        description: 'Lead status updated successfully',
      })

      // Refresh dashboard metrics in background (don't await to close dialog immediately)
      refreshDashboard()

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      console.error('Error updating lead status:', errorMessage)
      console.error('Error details:', error)
      toast({
        title: 'Error',
        description: errorMessage || 'Failed to update lead status',
        variant: 'destructive',
      })
      return false
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Lightweight refresh for dashboard - only fetch performance metrics
  const refreshDashboard = async () => {
    setTabLoadingStates(prev => ({ ...prev, dashboard: true }))
    try {
      const userId = localStorage.getItem('userId')
      
      // Fetch ALL users with roles
      const { data: allUsersData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('name') as any

      // Create a map of all users with role included
      const usersByIdMap = new Map<string, any>()
      ;(allUsersData || []).forEach((u: any) => {
        usersByIdMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          assignmentId: ''
        })
      })
      
      // Refresh caller data to get updated names and info
      const callersData = await getManagerCallers(userId || '')
      let callersToDisplay: Caller[] = (callersData as any[]).length > 0 
        ? (callersData as any[]).map(c => {
            const id = c.id || c.users?.id
            return {
              id,
              name: c.name || c.users?.name,
              email: c.email || c.users?.email,
              role: usersByIdMap.get(id)?.role || 'caller',
              assignmentId: c.assignmentId || c.id
            }
          })
        : []
      
      if (callersToDisplay.length === 0) {
        const { data: allCallers } = await supabase
          .from('users')
          .select('id, name, email, role')
          .eq('role', 'caller')
          .order('name') as any
        
        callersToDisplay = ((allCallers || []) as any[]).map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          role: c.role,
          assignmentId: ''
        }))
      }

      // Build unique users map
      const uniqueUsersMap = new Map<string, any>()
      callersToDisplay.forEach(c => {
        uniqueUsersMap.set(c.id, c)
      })
      
      ;(allUsersData || []).forEach((u: any) => {
        if (!uniqueUsersMap.has(u.id)) {
          uniqueUsersMap.set(u.id, {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            assignmentId: ''
          })
        }
      })

      const uniqueUsers = Array.from(uniqueUsersMap.values())
      
      setCallers(callersToDisplay)
      setAllUsers(uniqueUsers)
      
      // Refresh caller performance data
      for (const caller of callersToDisplay) {
        // Fetch fresh city assignments directly (don't rely on state which may not be updated)
        const { data: cityAssignments } = await supabase
          .from('city_assignments')
          .select('city_id')
          .eq('caller_id', caller.id) as any

        const assignedCityIds = (cityAssignments?.map((ca: any) => ca.city_id) || []).filter(Boolean)

        // Fetch all leads in the cities assigned to this caller with their status
        let leadsInAssignedCities: any[] = []
        if (assignedCityIds.length > 0) {
          const { data: citiesLeads } = await supabase
            .from('leads')
            .select('id, status')
            .in('city_id', assignedCityIds) as any
          leadsInAssignedCities = citiesLeads || []
        }

        // Count leads by status
        let approved = 0
        let declined = 0
        let scheduled = 0
        let pending = 0
        let wrong = 0
        let corrected = 0

        ;(leadsInAssignedCities || []).forEach((lead: any) => {
          if (lead.correction_status === 'pending') {
            wrong++
          } else if (lead.correction_status === 'corrected') {
            corrected++
          } else if (lead.status === 'approved') {
            approved++
          } else if (lead.status === 'declined') {
            declined++
          } else if (lead.status === 'scheduled') {
            scheduled++
          } else if (lead.status === 'unassigned') {
            pending++
          }
        })

        setCallerPerformance(prev => ({
          ...prev,
          [caller.id]: {
            assigned: leadsInAssignedCities.length,
            approved,
            declined,
            scheduled,
            pending,
            wrong,
            corrected
          }
        }))
      }

      // Also refresh lead generator performance on dashboard refresh
      try {
        const { data: freshLeads } = await supabase
          .from('leads')
          .select('id, created_by, status')
          .order('created_at', { ascending: false }) as any

        const { data: freshResponses } = await supabase
          .from('lead_responses')
          .select('lead_id, action, employee_id, response_text, scheduled_for, created_at, actioned_at')
          .order('created_at', { ascending: false })
          .limit(1000) as any

        // Update leadResponses with latest response for each lead (for dialog pre-fill)
        const freshResponseMap: { [leadId: string]: any } = {}
        ;(freshResponses || []).forEach((response: any) => {
          if (!freshResponseMap[response.lead_id]) {
            freshResponseMap[response.lead_id] = response
          }
        })
        setLeadResponses(freshResponseMap)

        // Create response map for lead generators - store only latest action per lead per employee
        const responseMapByLeadAndCallerId = new Map<string, Map<string, string>>()
        ;(freshResponses || []).forEach((response: any) => {
          if (!responseMapByLeadAndCallerId.has(response.lead_id)) {
            responseMapByLeadAndCallerId.set(response.lead_id, new Map())
          }
          // Only store the LATEST action per lead per employee (skip if already exists)
          if (!responseMapByLeadAndCallerId.get(response.lead_id)!.has(response.employee_id)) {
            responseMapByLeadAndCallerId.get(response.lead_id)!.set(response.employee_id, response.action)
          }
        })

        // Calculate lead status metrics for summary cards
        const metrics = {
          pending: 0,
          approved: 0,
          scheduled: 0,
          declined: 0
        }
        ;(freshLeads || []).forEach((lead: any) => {
          if (lead.status === 'unassigned') metrics.pending++
          else if (lead.status === 'approved') metrics.approved++
          else if (lead.status === 'scheduled') metrics.scheduled++
          else if (lead.status === 'declined') metrics.declined++
        })
        setLeadStatusMetrics(metrics)

        // Calculate lead generator performance
        const generatorPerformanceMap = new Map<string, LeadGeneratorPerformance>()
        const allGeneratorsSet = new Set<string>()
        
        ;(freshLeads || []).forEach((lead: any) => {
          if (lead.created_by) {
            allGeneratorsSet.add(lead.created_by)
          }
        })

        allGeneratorsSet.forEach((generatorId: string) => {
          const generatorLeads = (freshLeads || []).filter((l: any) => l.created_by === generatorId)
          let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
          
          generatorLeads.forEach((lead: any) => {
            if (lead.correction_status === 'pending') {
              wrong++
            } else if (lead.correction_status === 'corrected') {
              corrected++
            } else if (lead.status === 'approved') {
              approved++
            } else if (lead.status === 'declined') {
              declined++
            } else if (lead.status === 'scheduled') {
              scheduled++
            } else if (lead.status === 'unassigned') {
              pending++
            }
          })

          const total = approved + declined + scheduled
          const conversionRate = total > 0 ? Math.round((approved / total) * 100) : 0

          generatorPerformanceMap.set(generatorId, {
            added: generatorLeads.length,
            approved,
            declined,
            scheduled,
            pending,
            wrong,
            corrected,
            conversionRate
          })
        })

        setLeadGeneratorPerformance(Object.fromEntries(generatorPerformanceMap))
      } catch (error) {
        console.error('Error calculating lead generator performance:', error)
      }
    } catch (error) {
      console.error('Error refreshing dashboard:', error)
    } finally {
      setTabLoadingStates(prev => ({ ...prev, dashboard: false }))
    }
  }

  // Lightweight refresh for assignment tab - only fetch assignments
  const refreshAssignmentTab = async () => {
    setTabLoadingStates(prev => ({ ...prev, 'assign-niche': true }))
    try {
      // Fetch fresh niches and cities
      const { data: nichesData } = await supabase.from('niches').select('*').order('name') as any
      const { data: citiesData } = await supabase.from('cities').select('*').order('name') as any
      
      setNiches((nichesData || []) as Niche[])
      setCities((citiesData || []) as City[])

      // Also fetch users to maintain role information
      const { data: allUsersData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('name') as any
      
      const uniqueUsersMap = new Map<string, any>()
      ;(allUsersData || []).forEach((u: any) => {
        uniqueUsersMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          assignmentId: ''
        })
      })
      
      setAllUsers(Array.from(uniqueUsersMap.values()))

      // Refresh assignments for each caller
      for (const caller of callers) {
        const { data: nicheAssignments } = await supabase
          .from('niche_assignments')
          .select('niches(id, name)')
          .eq('caller_id', caller.id) as any

        const { data: cityAssignments } = await supabase
          .from('city_assignments')
          .select('cities(id, name)')
          .eq('caller_id', caller.id) as any

        setCallerNiches(prev => ({
          ...prev,
          [caller.id]: (nicheAssignments?.map((na: any) => na.niches) || []) as Niche[]
        }))

        setCallerCities(prev => ({
          ...prev,
          [caller.id]: (cityAssignments?.map((ca: any) => ca.cities) || []) as City[]
        }))
      }
    } catch (error) {
      console.error('Error refreshing assignments:', error)
    } finally {
      setTabLoadingStates(prev => ({ ...prev, 'assign-niche': false }))
    }
  }

  // Refresh leads tab - reloads leads data
  const refreshLeadsTab = async () => {
    setTabLoadingStates(prev => ({ ...prev, leads: true }))
    try {
      await reloadLeadsOnly()
      
      // Also refresh users to maintain role information
      const { data: allUsersData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .order('name') as any
      
      const uniqueUsersMap = new Map<string, any>()
      ;(allUsersData || []).forEach((u: any) => {
        uniqueUsersMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          assignmentId: ''
        })
      })
      
      setAllUsers(Array.from(uniqueUsersMap.values()))
    } finally {
      setTabLoadingStates(prev => ({ ...prev, leads: false }))
    }
  }

  const refreshSetupTab = async () => {
    setTabLoadingStates(prev => ({ ...prev, setup: true }))
    try {
      const [nicheRes, cityRes, leadRes, usersRes] = await Promise.all([
        supabase.from('niches').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name, email, role').order('name'),
      ])

      setNiches(nicheRes.data || [])

      if (cityRes.data) {
        const enrichedCities = (cityRes.data || []).map((city: any) => {
          const niche = (nicheRes.data || []).find((n: any) => n.id === city.niche_id)
          return {
            ...city,
            niche_name: niche?.name || 'Unknown',
          }
        })
        setCities(enrichedCities)
      }

      // Update users with role information
      const uniqueUsersMap = new Map<string, any>()
      ;(usersRes.data || []).forEach((u: any) => {
        uniqueUsersMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          assignmentId: ''
        })
      })
      
      setAllUsers(Array.from(uniqueUsersMap.values()))
      setLeads(leadRes.data || [])

      // Calculate lead status metrics
      const metrics = {
        pending: 0,
        approved: 0,
        scheduled: 0,
        declined: 0
      }
      ;(leadRes.data || []).forEach((lead: any) => {
        if (lead.status === 'unassigned') metrics.pending++
        else if (lead.status === 'approved') metrics.approved++
        else if (lead.status === 'scheduled') metrics.scheduled++
        else if (lead.status === 'declined') metrics.declined++
      })
      setLeadStatusMetrics(metrics)
    } catch (error) {
      console.error('Error refreshing setup tab:', error)
    } finally {
      setTabLoadingStates(prev => ({ ...prev, setup: false }))
    }
  }

  const handleAssignPendingNicheAndCity = async (nicheId: string) => {
    // Find the city selection for this niche
    const citySelectorKey = Object.keys(pendingCitySelections).find(key => key.startsWith(nicheId + '-'))
    const cityId = citySelectorKey ? pendingCitySelections[citySelectorKey] : pendingCitySelections[nicheId]
    const callerId = pendingCallerSelections[nicheId]
    const userId = session?.user_id
    
    if (!callerId || !cityId || !userId) {
      toast({
        title: 'Error',
        description: 'Please select both a caller and a city',
        variant: 'destructive',
      })
      return
    }

    try {
      setAssigningPending(nicheId)
      
      // Check if already assigned
      const existingNiche = await supabase
        .from('niche_assignments')
        .select('id')
        .eq('caller_id', callerId)
        .eq('niche_id', nicheId)
        .single()

      if (existingNiche.data) {
        toast({
          title: 'Conflict',
          description: 'This caller already has this niche assigned',
          variant: 'destructive',
        })
        return
      }

      // Assign niche
      const nicheSuccess = await assignNicheToCaller(callerId, nicheId, session?.user_id || '')
      if (!nicheSuccess) throw new Error('Failed to assign niche')

      // Assign city
      const citySuccess = await assignCityToCaller(callerId, cityId, session?.user_id || '')
      if (!citySuccess) throw new Error('Failed to assign city')

      toast({
        title: 'Success',
        description: 'Niche and city assigned successfully',
      })

      // Clear selections for this niche
      setPendingCallerSelections(prev => {
        const newSelections = { ...prev }
        delete newSelections[nicheId]
        return newSelections
      })
      
      // Clear all city selections that start with this nicheId
      setPendingCitySelections(prev => {
        const newSelections = { ...prev }
        Object.keys(newSelections).forEach(key => {
          if (key.startsWith(nicheId)) {
            delete newSelections[key]
          }
        })
        return newSelections
      })

      // Refresh data
      fetchData()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign niche and city',
        variant: 'destructive',
      })
    } finally {
      setAssigningPending('')
    }
  }

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

  // Fetch existing correction message when correction dialog opens
  useEffect(() => {
    if (correctionDialogOpen && correctionLeadId) {
      const fetchExistingCorrection = async () => {
        try {
          const { data, error } = await supabase
            .from('lead_corrections')
            .select('reason_notes')
            .eq('lead_id', correctionLeadId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (!error && data) {
            setExistingCorrectionMessage(data.reason_notes)
            // Pre-fill the textarea with existing message so user can edit it
            if (!correctionNotes) {
              setCorrectionNotes(data.reason_notes)
            }
          }
        } catch (err) {
          // No existing correction, that's fine
          setExistingCorrectionMessage(null)
        }
      }
      fetchExistingCorrection()
    }
  }, [correctionDialogOpen, correctionLeadId, supabase])

  const handleSendForCorrection = async () => {
    if (!correctionLeadId || !session?.user_id) {
      toast({
        title: 'Error',
        description: 'Invalid lead or session',
        variant: 'destructive',
      })
      return
    }

    if (!correctionNotes.trim()) {
      toast({
        title: 'Error',
        description: 'Please add notes explaining what needs to be corrected',
        variant: 'destructive',
      })
      return
    }

    setSubmittingCorrection(true)
    try {
      const { success, error, isUpdate } = await sendLeadForCorrection(
        correctionLeadId,
        session.user_id,
        session.user_name || 'Manager',
        'manager',
        correctionNotes
      )

      if (!success) {
        throw new Error(error || 'Failed to send lead for correction')
      }

      toast({
        title: 'Success',
        description: isUpdate 
          ? 'Correction message updated. Lead generator will see the latest notes.'
          : 'Lead sent to generator for correction',
      })

      setCorrectionDialogOpen(false)
      setCorrectionNotes('')
      
      // Refresh leads
      reloadLeadsOnly()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send for correction'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setSubmittingCorrection(false)
    }
  }

  // Helper functions for formatting
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getRemainingDays = (scheduledDate: string) => {
    const today = new Date()
    const scheduled = new Date(scheduledDate)
    const diffTime = scheduled.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manager Dashboard</h1>
            <p className="text-muted-foreground mt-2">Assign niches and cities to your callers</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>

        {/* Summary Cards - 5 Metrics + 4 Lead Status Metrics in Multiple Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Cities Pending</p>
              <p className="text-2xl font-bold text-primary">
                {cities.filter(c => !cityAssignmentsData.some(ca => ca.city_id === c.id)).length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total Niches</p>
              <p className="text-2xl font-bold text-primary">
                {niches.length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total Callers</p>
              <p className="text-2xl font-bold text-primary">
                {allUsers.filter(u => u.role === 'caller').length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total Generators</p>
              <p className="text-2xl font-bold text-primary">
                {allUsers.filter(u => u.role === 'lead_generator').length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Total Leads</p>
              <p className="text-2xl font-bold text-primary">
                {leads.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lead Status Summary Cards - 4 Status Metrics Centered with Same Width */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 mx-auto w-full lg:w-4/5">
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Pending Leads</p>
              <p className="text-2xl font-bold text-primary">
                {leadStatusMetrics.pending}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Approved Leads</p>
              <p className="text-2xl font-bold text-primary">
                {leadStatusMetrics.approved}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Scheduled Leads</p>
              <p className="text-2xl font-bold text-primary">
                {leadStatusMetrics.scheduled}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Declined Leads</p>
              <p className="text-2xl font-bold text-primary">
                {leadStatusMetrics.declined}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Correction Status Summary Cards - 2 Correction Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 mb-6 mx-auto w-full lg:w-2/5">
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Pending Corrections</p>
              <p className="text-2xl font-bold text-primary">
                {correctionMetrics.pendingCorrection}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-3 pb-3 px-4 text-center">
              <p className="text-xs font-medium text-muted-foreground mb-1">Completed Corrections</p>
              <p className="text-2xl font-bold text-primary">
                {correctionMetrics.completedCorrection}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Container */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard" disabled={tabLoadingStates.dashboard} className="flex items-center gap-2">
              Dashboard
              {tabLoadingStates.dashboard && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
            <TabsTrigger value="assign-niche" disabled={tabLoadingStates['assign-niche']} className="flex items-center gap-2">
              Assign Niche & City
              {tabLoadingStates['assign-niche'] && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
            <TabsTrigger value="leads" disabled={tabLoadingStates.leads} className="flex items-center gap-2">
              Leads
              {tabLoadingStates.leads && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
            <TabsTrigger value="setup" disabled={tabLoadingStates.setup} className="flex items-center gap-2">
              Setup
              {tabLoadingStates.setup && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab - Shows Performance and Current Assignments */}
          <TabsContent value="dashboard" className="space-y-6">
        {callers.length === 0 && leads.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No callers or leads assigned to you yet</p>
              <p className="text-sm text-muted-foreground">Please contact your admin to assign callers to your team</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Caller Performance Metrics */}
            <Card className="mt-6">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle>Caller Performance Metrics</CardTitle>
                  <CardDescription>Overview of your callers' performance and capacity</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshDashboard()}
                  disabled={tabLoadingStates.dashboard}
                  className="h-8 w-8 p-0"
                  title="Reload metrics"
                >
                  {tabLoadingStates.dashboard ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {callers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No callers assigned yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {callers.map(caller => {
                      const performance = callerPerformance[caller.id] || { assigned: 0, approved: 0, declined: 0, scheduled: 0, pending: 0, wrong: 0, corrected: 0 }
                      const nicheCount = (callerNiches[caller.id] || []).length
                      const cityCount = (callerCities[caller.id] || []).length
                      const total = performance.approved + performance.declined + performance.scheduled
                      const conversionRate = total > 0 ? Math.round((performance.approved / total) * 100) : 0
                      return (
                        <Card key={caller.id} className="bg-gradient-to-br from-card to-muted/20">
                          <CardHeader className="pb-1">
                            <CardTitle className="text-base">{caller.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm pt-0">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Total Niches:</span>
                              <Badge variant="secondary">{nicheCount}</Badge>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Total Cities:</span>
                              <Badge variant="secondary">{cityCount}</Badge>
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
                              <span className="font-semibold">Conversion Rate:</span>
                              <Badge className="bg-gray-100 text-gray-900">{conversionRate}%</Badge>
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
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current Niche & City Assignments */}
            <Card>
              <CardHeader>
                <CardTitle>Lead Generator Performance Metrics</CardTitle>
                <CardDescription>Overview of leads created and their performance</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(leadGeneratorPerformance).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lead generators yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(leadGeneratorPerformance).map(([generatorId, performance]) => {
                      const generator = allUsers.find(u => u.id === generatorId)
                      return (
                        <Card key={generatorId} className="bg-gradient-to-br from-card to-muted/20">
                          <CardHeader className="pb-1">
                            <CardTitle className="text-base">{generator?.name || 'Unknown'}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm pt-0">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Leads Added:</span>
                              <Badge variant="outline">{performance.added || 0}</Badge>
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
                              <span className="font-semibold">Conversion Rate:</span>
                              <Badge className="bg-gray-100 text-gray-900">{performance.conversionRate}%</Badge>
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
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current Niche & City Assignments */}
            <Card>
              <CardHeader>
                <CardTitle>Current Niche & City Assignments</CardTitle>
                <CardDescription>View all assigned niches and cities by caller</CardDescription>
              </CardHeader>
              <CardContent>
                {callers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No callers assigned yet</p>
                ) : (
                  <div className="space-y-4">
                    {callers
                      .filter(caller => (callerNiches[caller.id]?.length || 0) > 0 || (callerCities[caller.id]?.length || 0) > 0)
                      .map(caller => (
                        <div key={caller.id} className="border border-border rounded-lg p-4">
                          <h4 className="font-semibold mb-3">{caller.name}</h4>
                          <div className="space-y-3">
                            {(callerNiches[caller.id] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">No assignments</p>
                            ) : (
                              (callerNiches[caller.id] || []).map(niche => {
                                const nicheCities = (callerCities[caller.id] || []).filter(city => {
                                  const cityData = cities.find(c => c.id === city.id)
                                  return cityData?.niche_id === niche.id
                                })
                                return (
                                  <div key={niche.id} className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="secondary">{niche.name}</Badge>
                                      <span className="text-xs text-muted-foreground">→</span>
                                      <div className="flex flex-wrap gap-1">
                                        {nicheCities.length === 0 ? (
                                          <span className="text-xs text-muted-foreground italic">No cities</span>
                                        ) : (
                                          nicheCities.map(city => (
                                            <Badge key={city.id} variant="outline" className="text-xs">{city.name}</Badge>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
          </TabsContent>

          {/* Assign Niche & City Tab */}
          <TabsContent value="assign-niche" className="space-y-6">
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <div className="space-y-1">
              <CardTitle>Pending Niche & City Assignments</CardTitle>
              <CardDescription>Assign pending niches and cities to your callers</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshAssignmentTab()}
              disabled={tabLoadingStates['assign-niche']}
              className="h-8 w-8 p-0"
              title="Reload assignments"
            >
              {tabLoadingStates['assign-niche'] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {niches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No niches available</p>
            ) : (
              <div className="space-y-4">
                {niches.map(niche => {
                  const nicheCities = cities.filter(c => c.niche_id === niche.id)
                  // Filter out cities that are assigned to any caller based on current state
                  const pendingCities = nicheCities.filter(city => 
                    !Object.values(callerCities || {}).flat().some(c => c.id === city.id)
                  )

                  if (pendingCities.length === 0) return null

                  return (
                    <div key={niche.id}>
                      <h3 className="font-semibold text-sm mb-3">{niche.name}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {pendingCities.map(city => {
                          const cardKey = `${niche.id}-${city.id}`
                          return (
                            <div key={city.id} className="border border-border rounded-lg p-3 bg-card">
                              <p className="text-sm font-medium mb-2">{city.name}</p>
                              <div className="space-y-2">
                                <div>
                                  <Label htmlFor={`caller-${cardKey}`} className="text-xs text-muted-foreground">Caller</Label>
                                  <Select 
                                    value={pendingCallerSelections[cardKey] || ''} 
                                    onValueChange={async (callerId) => {
                                      setPendingCallerSelections(prev => ({ ...prev, [cardKey]: callerId }))
                                      
                                      // Auto-assign when caller is selected
                                      const userId = session?.user_id
                                      if (!callerId || !userId) {
                                        toast({
                                          title: 'Error',
                                          description: 'Failed to get user information',
                                          variant: 'destructive',
                                        })
                                        return
                                      }

                                      try {
                                        setAssigningPending(cardKey)
                                        
                                        // Check if city is already assigned to ANY caller
                                        const existingCityAssignment = await supabase
                                          .from('city_assignments')
                                          .select('id, caller_id')
                                          .eq('city_id', city.id)
                                          .single()

                                        if (existingCityAssignment.data) {
                                          const assignedCallerName = callers.find(c => c.id === existingCityAssignment.data?.caller_id)?.name
                                          toast({
                                            title: 'Already Assigned',
                                            description: `This city is already assigned to ${assignedCallerName}. Please reassign it in the Assigned section.`,
                                            variant: 'destructive',
                                          })
                                          setPendingCallerSelections(prev => {
                                            const newSel = { ...prev }
                                            delete newSel[cardKey]
                                            return newSel
                                          })
                                          return
                                        }

                                        // Check if niche is already assigned to this caller
                                        const existingNiche = await supabase
                                          .from('niche_assignments')
                                          .select('id')
                                          .eq('caller_id', callerId)
                                          .eq('niche_id', niche.id)
                                          .single()

                                        // Only assign niche if not already assigned to this caller
                                        if (!existingNiche.data) {
                                          const nicheSuccess = await assignNicheToCaller(callerId, niche.id, userId)
                                          if (!nicheSuccess) throw new Error('Failed to assign niche')
                                        }

                                        // Assign city (independent assignment)
                                        const citySuccess = await assignCityToCaller(callerId, city.id, userId)
                                        if (!citySuccess) throw new Error('Failed to assign city')

                                        toast({
                                          title: 'Success',
                                          description: `${city.name} assigned to ${callers.find(c => c.id === callerId)?.name}`,
                                        })

                                        // Clear selection and refresh
                                        setPendingCallerSelections(prev => {
                                          const newSel = { ...prev }
                                          delete newSel[cardKey]
                                          return newSel
                                        })
                                        await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab()])
                                      } catch (error) {
                                        toast({
                                          title: 'Error',
                                          description: error instanceof Error ? error.message : 'Failed to assign',
                                          variant: 'destructive',
                                        })
                                        setPendingCallerSelections(prev => {
                                          const newSel = { ...prev }
                                          delete newSel[cardKey]
                                          return newSel
                                        })
                                      } finally {
                                        setAssigningPending('')
                                      }
                                    }}
                                    disabled={assigningPending === cardKey}
                                  >
                                    <SelectTrigger id={`caller-${cardKey}`} className="h-8 text-xs mt-1">
                                      <SelectValue placeholder={assigningPending === cardKey ? "Assigning..." : "Select caller..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {callers.map(caller => (
                                        <SelectItem key={caller.id} value={caller.id}>
                                          {caller.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Niche & City Assignments */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Assigned Niche & City Assignments</CardTitle>
            <CardDescription>Niches and cities already assigned to callers</CardDescription>
          </CardHeader>
          <CardContent>
            {niches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No niches available</p>
            ) : (
              <div className="space-y-4">
                {niches.map(niche => {
                  const nicheCities = cities.filter(c => c.niche_id === niche.id)
                  const assignedCities = nicheCities.filter(city =>
                    Object.values(callerCities || {}).flat().some(c => c.id === city.id)
                  )

                  if (assignedCities.length === 0) return null

                  return (
                    <div key={niche.id}>
                      <h3 className="font-semibold text-sm mb-3">{niche.name}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {assignedCities.map(city => {
                          // Find which caller has this city assigned
                          const assignedCallerForCity = callers.find(caller =>
                            (callerCities[caller.id] || []).some(c => c.id === city.id)
                          )

                          const currentCallerSelection = assignedCallerSelections[city.id] || assignedCallerForCity?.id || ''

                          return (
                            <div key={city.id} className="border border-border rounded-lg p-3 bg-card">
                              <p className="text-sm font-medium mb-2">{city.name}</p>
                              <div className="space-y-2">
                                <div>
                                  <Label htmlFor={`assigned-caller-${city.id}`} className="text-xs text-muted-foreground">Caller</Label>
                                  <Select 
                                    value={currentCallerSelection} 
                                    onValueChange={async (newCallerId) => {
                                      if (!assignedCallerForCity) return
                                      
                                      const oldCallerId = assignedCallerForCity.id
                                      const userId = session?.user_id
                                      
                                      if (!newCallerId || !userId) {
                                        toast({
                                          title: 'Error',
                                          description: 'Failed to get user information',
                                          variant: 'destructive',
                                        })
                                        return
                                      }

                                      // Handle Unassigned option
                                      if (newCallerId === 'unassigned') {
                                        try {
                                          setReassigningCity(city.id)
                                          
                                          // Remove city assignment from old caller
                                          const removeSuccess = await unassignCityFromCaller(oldCallerId, city.id)
                                          if (!removeSuccess) throw new Error('Failed to remove assignment')
                                          
                                          // Check if old caller has any other cities from this niche
                                          const otherCitiesInNiche = await supabase
                                            .from('city_assignments')
                                            .select('cities(id, niche_id)')
                                            .eq('caller_id', oldCallerId)
                                            .then((result: any) => 
                                              result.data?.filter((ca: any) => ca.cities?.niche_id === niche.id) || []
                                            )
                                          
                                          // If old caller has no more cities in this niche, remove the niche assignment too
                                          if (otherCitiesInNiche.length === 0) {
                                            await unassignNicheFromCaller(oldCallerId, niche.id)
                                          }
                                          
                                          toast({
                                            title: 'Success',
                                            description: `${city.name} moved to pending`,
                                          })
                                          
                                          setAssignedCallerSelections(prev => {
                                            const newSel = { ...prev }
                                            delete newSel[city.id]
                                            return newSel
                                          })
                                          await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab()])
                                        } catch (error) {
                                          toast({
                                            title: 'Error',
                                            description: error instanceof Error ? error.message : 'Failed to unassign',
                                            variant: 'destructive',
                                          })
                                          setAssignedCallerSelections(prev => {
                                            const newSel = { ...prev }
                                            delete newSel[city.id]
                                            return newSel
                                          })
                                        } finally {
                                          setReassigningCity('')
                                        }
                                        return
                                      }

                                      try {
                                        setReassigningCity(city.id)
                                        setAssignedCallerSelections(prev => ({ ...prev, [city.id]: newCallerId }))

                                        // Check if already assigned to new caller
                                        const existingCity = await supabase
                                          .from('city_assignments')
                                          .select('id')
                                          .eq('caller_id', newCallerId)
                                          .eq('city_id', city.id)
                                          .single()

                                        if (existingCity.data) {
                                          toast({
                                            title: 'Already Assigned',
                                            description: 'This city is already assigned to this caller',
                                            variant: 'destructive',
                                          })
                                          setAssignedCallerSelections(prev => {
                                            const newSel = { ...prev }
                                            delete newSel[city.id]
                                            return newSel
                                          })
                                          return
                                        }

                                        // Remove from old caller
                                        const removeSuccess = await unassignCityFromCaller(oldCallerId, city.id)
                                        if (!removeSuccess) throw new Error('Failed to remove from previous caller')

                                        // Check if old caller has any other cities from this niche
                                        const otherCitiesInNiche = await supabase
                                          .from('city_assignments')
                                          .select('cities(id, niche_id)')
                                          .eq('caller_id', oldCallerId)
                                          .then((result: any) => 
                                            result.data?.filter((ca: any) => ca.cities?.niche_id === niche.id) || []
                                          )

                                        // If old caller has no more cities in this niche, remove the niche assignment too
                                        if (otherCitiesInNiche.length === 0) {
                                          await unassignNicheFromCaller(oldCallerId, niche.id)
                                        }

                                        // Check if niche is assigned to new caller, if not assign it first
                                        const existingNicheForNewCaller = await supabase
                                          .from('niche_assignments')
                                          .select('id')
                                          .eq('caller_id', newCallerId)
                                          .eq('niche_id', niche.id)
                                          .single()

                                        if (!existingNicheForNewCaller.data) {
                                          const nicheAssignSuccess = await assignNicheToCaller(newCallerId, niche.id, userId)
                                          if (!nicheAssignSuccess) throw new Error('Failed to assign niche to new caller')
                                        }

                                        // Assign city to new caller
                                        const assignSuccess = await assignCityToCaller(newCallerId, city.id, userId)
                                        if (!assignSuccess) throw new Error('Failed to assign to new caller')

                                        toast({
                                          title: 'Success',
                                          description: `${city.name} reassigned to ${callers.find(c => c.id === newCallerId)?.name}`,
                                        })

                                        // Clear selection and refresh
                                        setAssignedCallerSelections(prev => {
                                          const newSel = { ...prev }
                                          delete newSel[city.id]
                                          return newSel
                                        })
                                        await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab()])
                                      } catch (error) {
                                        toast({
                                          title: 'Error',
                                          description: error instanceof Error ? error.message : 'Failed to reassign',
                                          variant: 'destructive',
                                        })
                                        setAssignedCallerSelections(prev => {
                                          const newSel = { ...prev }
                                          delete newSel[city.id]
                                          return newSel
                                        })
                                      } finally {
                                        setReassigningCity('')
                                      }
                                    }}
                                    disabled={reassigningCity === city.id}
                                  >
                                    <SelectTrigger id={`assigned-caller-${city.id}`} className="h-8 text-xs mt-1">
                                      <SelectValue placeholder={reassigningCity === city.id ? "Reassigning..." : "Select caller..."} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">
                                        <span className="text-red-600">Unassigned</span>
                                      </SelectItem>
                                      {callers.map(caller => (
                                        <SelectItem key={caller.id} value={caller.id}>
                                          {caller.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>
          {/* Leads Tab */}
          <TabsContent value="leads" className="space-y-6">
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <div className="space-y-1">
              <CardTitle>View All Leads</CardTitle>
              <CardDescription>Monitor all leads and their current assignment status</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshLeadsTab()}
              disabled={tabLoadingStates.leads}
              className="h-8 w-8 p-0"
              title="Reload table"
            >
              {tabLoadingStates.leads ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {leads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads available yet. Create leads in the Lead Generator to view them here.</p>
            ) : (
              <>
                {/* Search and Filters */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Search by lead name..."
                      value={leadSearchFilter}
                      onChange={(e) => setLeadSearchFilter(e.target.value)}
                      className="w-full rounded-lg"
                    />
                  </div>
                  <div className="w-[120px] shrink-0">
                    <Select value={leadNicheFilter} onValueChange={(v) => {
                      setLeadNicheFilter(v)
                      setLeadCityFilter('') // Reset city filter when niche changes
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Niche..." />
                      </SelectTrigger>
                      <SelectContent>
                        {niches.map(niche => (
                          <SelectItem key={niche.id} value={niche.id}>{niche.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[120px] shrink-0">
                    <Select value={leadCityFilter} onValueChange={setLeadCityFilter} disabled={!leadNicheFilter}>
                      <SelectTrigger className="truncate">
                        <SelectValue placeholder={!leadNicheFilter ? "Niche first..." : "City..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {cities
                          .filter(city => !leadNicheFilter || city.niche_id === leadNicheFilter)
                          .map(city => (
                            <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px] shrink-0">
                    <Select value={leadCreatedByFilter} onValueChange={setLeadCreatedByFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Created..." />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Get unique creators from leads */}
                        {Array.from(new Set(leads.map(l => l.creator?.id))).map(creatorId => {
                          const creator = leads.find(l => l.creator?.id === creatorId)?.creator
                          return creator ? (
                            <SelectItem key={creator.id} value={creator.id}>{creator.name}</SelectItem>
                          ) : null
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px] shrink-0">
                    <Select value={leadAssignedToFilter} onValueChange={setLeadAssignedToFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Caller..." />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Get unique callers from city assignments */}
                        {Array.from(new Set(cityAssignmentsData.map(ca => ca.caller_id))).map(callerId => {
                          const caller = allUsers.find(u => u.id === callerId)
                          return caller ? (
                            <SelectItem key={caller.id} value={caller.id}>{caller.name}</SelectItem>
                          ) : null
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px] shrink-0">
                    <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unactioned">Unactioned</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLeadSearchFilter('')
                      setLeadNicheFilter('')
                      setLeadCityFilter('')
                      setLeadCreatedByFilter('')
                      setLeadAssignedToFilter('')
                      setLeadStatusFilter('')
                    }}
                    className="shrink-0"
                  >
                    Clear All
                  </Button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">#</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Lead Name</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Niche</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">City</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Created At</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Actioned At</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Created By</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Assigned To</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Assigned By</th>
                        <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads
                        .filter(lead => {
                          const searchMatch = !debouncedSearchFilter || (lead.data?.name || 'Lead').toLowerCase().includes(debouncedSearchFilter.toLowerCase())
                          const nicheMatch = !leadNicheFilter || lead.niche_id === leadNicheFilter
                          const cityMatch = !leadCityFilter || lead.city_id === leadCityFilter
                          const createdByMatch = !leadCreatedByFilter || lead.creator?.id === leadCreatedByFilter
                          
                          // For assigned to, find the caller assigned to this lead's city
                          let assignedToMatch = true
                          if (leadAssignedToFilter) {
                            const cityAssignment = cityAssignmentsData.find(ca => ca.city_id === lead.city_id)
                            assignedToMatch = cityAssignment?.caller_id === leadAssignedToFilter
                          }

                          // For status filter
                          let statusMatch = true
                          if (leadStatusFilter) {
                            if (leadStatusFilter === 'unactioned') {
                              // Unactioned means no status or unassigned status
                              statusMatch = !lead.status || lead.status === 'unassigned'
                            } else {
                              const leadStatus = lead.status?.toLowerCase() || ''
                              statusMatch = leadStatus === leadStatusFilter.toLowerCase()
                            }
                          }
                          
                          return searchMatch && nicheMatch && cityMatch && createdByMatch && assignedToMatch && statusMatch
                        })
                        .map((lead, index) => {
                          const niche = niches.find(n => n.id === lead.niche_id)
                          const city = cities.find(c => c.id === lead.city_id)
                          
                          // Find the city assignment for this lead's city
                          const cityAssignment = cityAssignmentsData.find(ca => ca.city_id === lead.city_id)
                          // Get caller assigned to this city (from allUsers which includes both callers and managers)
                          const assignedCaller = cityAssignment ? allUsers.find(u => u.id === cityAssignment.caller_id) : null
                          // Get manager who made the assignment (from allUsers)
                          const assignedByManager = cityAssignment ? allUsers.find(u => u.id === cityAssignment.assigned_by) : null
                          
                          // Get last action taken on this lead
                          const lastResponse = leadResponses[lead.id]

                          const getActionDisplay = () => {
                            // First check if lead has a current status (from direct update)
                            if (lead.status) {
                              const statusLower = lead.status.toLowerCase()
                              if (statusLower === 'approved') {
                                return <Badge className="bg-green-100 text-green-700">Approved</Badge>
                              }
                              if (statusLower === 'declined') {
                                return <Badge className="bg-red-100 text-red-700">Declined</Badge>
                              }
                              if (statusLower === 'scheduled') {
                                if (lead.follow_up_date) {
                                  const daysRemaining = getRemainingDays(lead.follow_up_date)
                                  return (
                                    <span className="text-xs text-amber-600">
                                      Scheduled - {daysRemaining > 0 ? `${daysRemaining} days` : 'Due'}
                                    </span>
                                  )
                                }
                                return <Badge className="bg-amber-100 text-amber-700">Scheduled</Badge>
                              }
                            }
                            
                            // Fallback to last response action if no direct status is set
                            if (!lastResponse) return <span className="text-xs text-muted-foreground">—</span>
                            
                            let actionText = lastResponse.action
                            if (lastResponse.action === 'later') {
                              actionText = 'Schedule'
                            } else if (lastResponse.action) {
                              actionText = lastResponse.action?.charAt(0).toUpperCase() + lastResponse.action?.slice(1)
                            }
                            
                            if (lastResponse.action === 'later' && lastResponse.scheduled_for) {
                              const daysRemaining = getRemainingDays(lastResponse.scheduled_for)
                              return (
                                <span className="text-xs text-amber-600">
                                  {actionText} - {daysRemaining > 0 ? `${daysRemaining} days` : 'Due'}
                                </span>
                              )
                            }
                            
                            if (lastResponse.action === 'approve' || lastResponse.action === 'approved') {
                              return <Badge className="bg-green-100 text-green-700">Approved</Badge>
                            }
                            if (lastResponse.action === 'decline' || lastResponse.action === 'declined') {
                              return <Badge className="bg-red-100 text-red-700">Declined</Badge>
                            }
                            if (lastResponse.action === 'schedule' || lastResponse.action === 'later') {
                              return <Badge className="bg-amber-100 text-amber-700">Scheduled</Badge>
                            }
                            
                            return <Badge variant="outline">{actionText}</Badge>
                          }
                          
                          return (
                            <tr key={lead.id} className="border-b border-border hover:bg-muted/50">
                              <td className="px-2 py-2 font-medium text-muted-foreground text-xs">{index + 1}</td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setSelectedLeadForDetails(lead)
                                    setLeadDetailsDialogOpen(true)
                                  }}
                                  className="text-primary hover:underline cursor-pointer font-medium text-xs"
                                >
                                  {lead.data?.name || 'Lead'}
                                </button>
                              </td>
                              <td className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap">{niche?.name}</td>
                              <td className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap">{city?.name}</td>
                              <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(lead.created_at)}</td>
                              <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                {lead.actioned_at ? formatDateTime(lead.actioned_at) : '—'}
                              </td>
                              <td className="px-2 py-2 text-xs whitespace-nowrap">
                                <Badge variant="secondary" className="text-xs">{lead.creator?.name || 'Unknown'}</Badge>
                              </td>
                              <td className="px-2 py-2 text-xs whitespace-nowrap">
                                {assignedCaller ? (
                                  <Badge variant="outline" className="text-xs">{assignedCaller.name}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Unassigned</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs whitespace-nowrap">
                                {assignedByManager ? (
                                  <Badge variant="outline" className="bg-blue-50 text-xs">{assignedByManager.name}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs whitespace-nowrap">
                                <div
                                  onDoubleClick={() => {
                                    const cityAssignment = cityAssignmentsData.find(ca => ca.city_id === lead.city_id)
                                    const assignedCaller = cityAssignment ? allUsers.find(u => u.id === cityAssignment.caller_id) : null
                                    
                                    // Pre-fill days if lead is scheduled
                                    let daysValue = ''
                                    if (lead.status === 'scheduled' && lead.follow_up_date) {
                                      const followUpDate = new Date(lead.follow_up_date)
                                      const today = new Date()
                                      today.setHours(0, 0, 0, 0)
                                      followUpDate.setHours(0, 0, 0, 0)
                                      daysValue = Math.max(1, Math.ceil((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))).toString()
                                    }
                                    
                                    setEditingStatusLeadId(lead.id)
                                    setStatusUpdate(lead.status === 'scheduled' ? 'schedule' : (lead.status || ''))
                                    setScheduleDays(daysValue)
                                    // Pre-fill message with existing response_text if available
                                    const existingResponse = leadResponses[lead.id]
                                    setStatusMessage(existingResponse?.response_text || '')
                                    
                                    // Get last action employee name and time
                                    let lastActionBy = 'Unknown'
                                    let lastActionTime = ''
                                    if (existingResponse?.employee_id) {
                                      const actionEmployee = allUsers.find(u => u.id === existingResponse.employee_id)
                                      lastActionBy = actionEmployee?.name || 'Unknown'
                                      if (existingResponse.actioned_at) {
                                        const actionDate = new Date(existingResponse.actioned_at)
                                        lastActionTime = actionDate.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                      }
                                    }
                                    
                                    const niche = niches.find(n => n.id === lead.niche_id)
                                    const city = cities.find(c => c.id === lead.city_id)
                                    
                                    setEditingLeadDetails({
                                      index: index + 1,
                                      name: lead.data?.name || 'Lead',
                                      callerName: assignedCaller?.name || 'Unassigned',
                                      leadId: lead.id,
                                      nicheId: lead.niche_id,
                                      cityId: lead.city_id,
                                      lastActionBy,
                                      lastActionTime
                                    })
                                    setStatusDialogOpen(true)
                                  }}
                                  className="cursor-pointer hover:opacity-70 transition-opacity py-1"
                                  title="Double-click to edit"
                                >
                                  {getActionDisplay()}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

          </TabsContent>

          {/* Status Update Dialog */}
          <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Update Lead Status</DialogTitle>
                <DialogDescription>Change the status for the selected lead</DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {editingLeadDetails && (
                  <div className="bg-muted p-4 rounded space-y-2 text-sm">
                    <div><span className="font-semibold">S.No:</span> {editingLeadDetails.index}</div>
                    <div><span className="font-semibold">Business Name:</span> {editingLeadDetails.name}</div>
                    <div><span className="font-semibold">Caller Name:</span> {editingLeadDetails.callerName}</div>
                    {editingLeadDetails.nicheId && (
                      <div><span className="font-semibold">Niche:</span> {niches.find(n => n.id === editingLeadDetails.nicheId)?.name || 'Unknown'}</div>
                    )}
                    {editingLeadDetails.cityId && (
                      <div><span className="font-semibold">City:</span> {cities.find(c => c.id === editingLeadDetails.cityId)?.name || 'Unknown'}</div>
                    )}
                    {editingLeadDetails.lastActionBy && editingLeadDetails.lastActionBy !== 'Unknown' && (
                      <div className="pt-2 border-t mt-2 space-y-1">
                        <div><span className="font-semibold">Last Action By:</span> {editingLeadDetails.lastActionBy}</div>
                        {editingLeadDetails.lastActionTime && (
                          <div><span className="font-semibold">Last Action Time:</span> {editingLeadDetails.lastActionTime}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <Label htmlFor="status-select" className="mb-2 block">New Status</Label>
                  <Select value={statusUpdate} onValueChange={(value) => {
                    setStatusUpdate(value)
                    // Clear days when changing from schedule
                    if (value !== 'schedule') {
                      setScheduleDays('')
                    }
                  }}>
                    <SelectTrigger id="status-select">
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="declined">Declined</SelectItem>
                      <SelectItem value="schedule">Schedule Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {statusUpdate === 'schedule' && (
                  <div>
                    <Label htmlFor="schedule-days" className="mb-2 block">Follow-up Days</Label>
                    <Input
                      id="schedule-days"
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Enter number of days"
                      value={scheduleDays}
                      onChange={(e) => setScheduleDays(e.target.value)}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Number of days from today to schedule the follow-up
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="status-message" className="mb-2 block">Message</Label>
                  <Textarea
                    id="status-message"
                    placeholder="Add notes or message (optional)"
                    value={statusMessage}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStatusMessage(e.target.value)}
                    className="w-full min-h-20"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional: Add notes or feedback about this action
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStatusDialogOpen(false)
                      setEditingStatusLeadId(null)
                      setStatusUpdate('')
                      setScheduleDays('')
                      setStatusMessage('')
                      setEditingLeadDetails(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={async () => {
                      if (editingStatusLeadId && statusUpdate) {
                        await handleUpdateLeadStatus(editingStatusLeadId, statusUpdate)
                        setStatusDialogOpen(false)
                        setEditingLeadDetails(null)
                      }
                    }}
                    disabled={updatingStatus || !statusUpdate || (statusUpdate === 'schedule' && !scheduleDays)}
                    className="gap-2"
                  >
                    {updatingStatus && <Loader2 className="w-4 h-4 animate-spin" />}
                    {updatingStatus ? 'Updating...' : 'Update'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Setup Tab - Add Niches, Cities, and Leads */}
          <TabsContent value="setup" className="space-y-6">
            <Card className="mt-6">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle>Setup Management</CardTitle>
                  <CardDescription>Add and manage niches, cities, and leads</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshSetupTab()}
                  disabled={tabLoadingStates.setup}
                  className="h-8 w-8 p-0"
                  title="Reload setup"
                >
                  {tabLoadingStates.setup ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Niches & Cities Combined Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Niches & Cities</h3>
                    <div className="flex gap-2">
                      <Dialog open={setupDialogs.niche} onOpenChange={(open) => setSetupDialogs({...setupDialogs, niche: open})}>
                        <Button onClick={() => setSetupDialogs({...setupDialogs, niche: true})} size="sm" className="gap-2">
                          <Plus className="w-4 h-4" />
                          Add Niche
                        </Button>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Niche</DialogTitle>
                            <DialogDescription>Create a new niche</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={async (e) => {
                            e.preventDefault()
                            setSetupSaving(true)
                            try {
                              const { error } = await supabase
                                .from('niches')
                                .insert({ name: setupForms.nicheName })
                              if (error) throw error
                              toast({
                                title: 'Success',
                                description: 'Niche added successfully',
                              })
                              setSetupForms({...setupForms, nicheName: ''})
                              setSetupDialogs({...setupDialogs, niche: false})
                              await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab(), refreshSetupTab()])
                            } catch (error) {
                              toast({
                                title: 'Error',
                                description: 'Failed to add niche',
                                variant: 'destructive',
                              })
                            } finally {
                              setSetupSaving(false)
                            }
                          }} className="space-y-5">
                            <div>
                              <Label htmlFor="niche-name" className="mb-2 block">Niche Name</Label>
                              <Input
                                id="niche-name"
                                placeholder="e.g., Real Estate, Salons"
                                value={setupForms.nicheName || ''}
                                onChange={(e) => setSetupForms({...setupForms, nicheName: e.target.value})}
                              />
                            </div>
                            <Button type="submit" disabled={setupSaving} className="w-full">
                              {setupSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Add Niche
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={setupDialogs.city} onOpenChange={(open) => setSetupDialogs({...setupDialogs, city: open})}>
                        <Button onClick={() => setSetupDialogs({...setupDialogs, city: true})} size="sm" className="gap-2">
                          <Plus className="w-4 h-4" />
                          Add City
                        </Button>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add City</DialogTitle>
                            <DialogDescription>Create a new city under a niche</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={async (e) => {
                            e.preventDefault()
                            if (!setupForms.cityName || !setupForms.selectedNiche) {
                              toast({
                                title: 'Error',
                                description: 'Please select a niche and enter city name',
                                variant: 'destructive',
                              })
                              return
                            }
                            setSetupSaving(true)
                            try {
                              const { error } = await supabase
                                .from('cities')
                                .insert({ name: setupForms.cityName, niche_id: setupForms.selectedNiche })
                              if (error) throw error
                              toast({
                                title: 'Success',
                                description: 'City added successfully',
                              })
                              setSetupForms({...setupForms, cityName: '', selectedNiche: ''})
                              setSetupDialogs({...setupDialogs, city: false})
                              await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab(), refreshSetupTab()])
                            } catch (error) {
                              toast({
                                title: 'Error',
                                description: 'Failed to add city',
                                variant: 'destructive',
                              })
                            } finally {
                              setSetupSaving(false)
                            }
                          }} className="space-y-5">
                            <div>
                              <Label htmlFor="city-niche" className="mb-2 block">Select Niche</Label>
                              <Select value={setupForms.selectedNiche || ''} onValueChange={(value) => setSetupForms({...setupForms, selectedNiche: value})}>
                                <SelectTrigger id="city-niche">
                                  <SelectValue placeholder="Choose a niche" />
                                </SelectTrigger>
                                <SelectContent>
                                  {niches.map(niche => (
                                    <SelectItem key={niche.id} value={niche.id}>{niche.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="city-name" className="mb-2 block">City Name</Label>
                              <Input
                                id="city-name"
                                placeholder="e.g., New York, Los Angeles"
                                value={setupForms.cityName || ''}
                                onChange={(e) => setSetupForms({...setupForms, cityName: e.target.value})}
                              />
                            </div>
                            <Button type="submit" disabled={setupSaving} className="w-full">
                              {setupSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                              Add City
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  {niches.length > 0 ? (
                    <div className="space-y-3">
                      {niches.map(niche => {
                        const nicheCities = cities.filter(c => c.niche_id === niche.id)
                        return (
                          <div key={niche.id} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold">{niche.name} →</p>
                              <Dialog open={editingNiche?.id === niche.id} onOpenChange={(open) => !open && setEditingNiche(null)}>
                                <button
                                  onClick={() => setEditingNiche({id: niche.id, name: niche.name})}
                                  className="p-1 hover:bg-background rounded transition-colors"
                                  title="Edit niche"
                                >
                                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Edit Niche</DialogTitle>
                                    <DialogDescription>Update niche name</DialogDescription>
                                  </DialogHeader>
                                  <form onSubmit={async (e) => {
                                    e.preventDefault()
                                    if (!editingNiche?.name) return
                                    setSetupSaving(true)
                                    try {
                                      const { error } = await supabase
                                        .from('niches')
                                        .update({ name: editingNiche.name })
                                        .eq('id', editingNiche.id)
                                      if (error) throw error
                                      toast({
                                        title: 'Success',
                                        description: 'Niche updated successfully',
                                      })
                                      setEditingNiche(null)
                                      await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab(), refreshSetupTab()])
                                    } catch (error) {
                                      toast({
                                        title: 'Error',
                                        description: 'Failed to update niche',
                                        variant: 'destructive',
                                      })
                                    } finally {
                                      setSetupSaving(false)
                                    }
                                  }} className="space-y-5">
                                    <div>
                                      <Label htmlFor="edit-niche-name" className="mb-2 block">Niche Name</Label>
                                      <Input
                                        id="edit-niche-name"
                                        placeholder="e.g., Real Estate, Salons"
                                        value={editingNiche?.name || ''}
                                        onChange={(e) => setEditingNiche({...editingNiche!, name: e.target.value})}
                                      />
                                    </div>
                                    <Button type="submit" disabled={setupSaving} className="w-full">
                                      {setupSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                      Save Niche
                                    </Button>
                                  </form>
                                </DialogContent>
                              </Dialog>
                            </div>
                            <div className="flex flex-wrap gap-2 ml-4">
                              {nicheCities.length > 0 ? (
                                nicheCities.map(city => (
                                  <div key={city.id} className="flex items-center gap-1">
                                    <Badge variant="outline">{city.name}</Badge>
                                    <Dialog open={editingCity?.id === city.id} onOpenChange={(open) => !open && setEditingCity(null)}>
                                      <button
                                        onClick={() => setEditingCity({id: city.id, name: city.name, niche_id: city.niche_id})}
                                        className="p-0.5 hover:bg-muted rounded transition-colors"
                                        title="Edit city"
                                      >
                                        <Edit2 className="w-3 h-3 text-muted-foreground" />
                                      </button>
                                      <DialogContent>
                                        <DialogHeader>
                                          <DialogTitle>Edit City</DialogTitle>
                                          <DialogDescription>Update city details</DialogDescription>
                                        </DialogHeader>
                                        <form onSubmit={async (e) => {
                                          e.preventDefault()
                                          if (!editingCity?.name) return
                                          setSetupSaving(true)
                                          try {
                                            const { error } = await supabase
                                              .from('cities')
                                              .update({ name: editingCity.name, niche_id: editingCity.niche_id })
                                              .eq('id', editingCity.id)
                                            if (error) throw error
                                            toast({
                                              title: 'Success',
                                              description: 'City updated successfully',
                                            })
                                            setEditingCity(null)
                                            await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab(), refreshSetupTab()])
                                          } catch (error) {
                                            toast({
                                              title: 'Error',
                                              description: 'Failed to update city',
                                              variant: 'destructive',
                                            })
                                          } finally {
                                            setSetupSaving(false)
                                          }
                                        }} className="space-y-5">
                                          <div>
                                            <Label htmlFor="edit-city-niche" className="mb-2 block">Select Niche</Label>
                                            <Select value={editingCity?.niche_id || ''} onValueChange={(value) => setEditingCity({...editingCity!, niche_id: value})}>
                                              <SelectTrigger id="edit-city-niche">
                                                <SelectValue placeholder="Choose a niche" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {niches.map(n => (
                                                  <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div>
                                            <Label htmlFor="edit-city-name" className="mb-2 block">City Name</Label>
                                            <Input
                                              id="edit-city-name"
                                              placeholder="e.g., New York, Los Angeles"
                                              value={editingCity?.name || ''}
                                              onChange={(e) => setEditingCity({...editingCity!, name: e.target.value})}
                                            />
                                          </div>
                                          <Button type="submit" disabled={setupSaving} className="w-full">
                                            {setupSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                            Save City
                                          </Button>
                                        </form>
                                      </DialogContent>
                                    </Dialog>
                                  </div>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">No cities assigned</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No niches created yet</p>
                  )}
                </div>

                {/* Leads Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Leads</h3>
                    <Dialog open={setupDialogs.lead} onOpenChange={(open) => setSetupDialogs({...setupDialogs, lead: open})}>
                      <Button onClick={() => setSetupDialogs({...setupDialogs, lead: true})} size="sm" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Add Lead
                      </Button>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add Lead</DialogTitle>
                          <DialogDescription>Create a new lead in a specific city</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={async (e) => {
                          e.preventDefault()
                          if (!setupForms.leadName || !setupForms.selectedLeadNiche || !setupForms.selectedLeadCity) {
                            toast({
                              title: 'Error',
                              description: 'Please fill all required fields',
                              variant: 'destructive',
                            })
                            return
                          }
                          setSetupSaving(true)
                          try {
                            const detailsObj: Record<string, any> = {}
                            if (setupForms.leadDetails?.trim()) {
                              setupForms.leadDetails.split('\n').forEach((line) => {
                                const trimmedLine = line.trim()
                                if (!trimmedLine) return
                                const [key, ...valueParts] = trimmedLine.split('=')
                                if (key && key.trim() && valueParts.length > 0) {
                                  const trimmedKey = key.trim()
                                  const trimmedValue = valueParts.join('=').trim()
                                  if (trimmedValue) {
                                    detailsObj[trimmedKey] = trimmedValue
                                  }
                                }
                              })
                            }

                            const leadData = {
                              name: setupForms.leadName,
                              ...detailsObj,
                            }

                            const { error } = await supabase
                              .from('leads')
                              .insert({
                                niche_id: setupForms.selectedLeadNiche,
                                city_id: setupForms.selectedLeadCity,
                                data: leadData,
                                created_by: session?.user_id,
                              })
                            if (error) throw error
                            toast({
                              title: 'Success',
                              description: 'Lead added successfully',
                            })
                            setSetupForms({...setupForms, leadName: '', selectedLeadNiche: '', selectedLeadCity: '', leadDetails: ''})
                            setSetupDialogs({...setupDialogs, lead: false})
                            await Promise.all([refreshDashboard(), refreshAssignmentTab(), refreshLeadsTab(), refreshSetupTab()])
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to add lead',
                              variant: 'destructive',
                            })
                          } finally {
                            setSetupSaving(false)
                          }
                        }} className="space-y-5">
                          <div>
                            <Label htmlFor="lead-niche" className="mb-2 block">Select Niche</Label>
                            <Select value={setupForms.selectedLeadNiche || ''} onValueChange={(value) => {
                              setSetupForms({...setupForms, selectedLeadNiche: value, selectedLeadCity: ''})
                            }}>
                              <SelectTrigger id="lead-niche">
                                <SelectValue placeholder="Choose a niche" />
                              </SelectTrigger>
                              <SelectContent>
                                {niches.map(niche => (
                                  <SelectItem key={niche.id} value={niche.id}>{niche.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="lead-city" className="mb-2 block">Select City</Label>
                            <Select value={setupForms.selectedLeadCity || ''} onValueChange={(value) => setSetupForms({...setupForms, selectedLeadCity: value})}>
                              <SelectTrigger id="lead-city">
                                <SelectValue placeholder="Choose a city" />
                              </SelectTrigger>
                              <SelectContent>
                                {cities.filter(c => c.niche_id === setupForms.selectedLeadNiche).map(city => (
                                  <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="lead-name" className="mb-2 block">Lead Name</Label>
                            <Input
                              id="lead-name"
                              placeholder="e.g., John Doe"
                              value={setupForms.leadName || ''}
                              onChange={(e) => setSetupForms({...setupForms, leadName: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label htmlFor="lead-details" className="mb-2 block flex items-center justify-between">
                              <span>Lead Details</span>
                              <span className="text-xs text-muted-foreground">(Double-click to expand)</span>
                            </Label>
                            <div className="relative border rounded-md bg-background h-32 overflow-y-auto">
                              <Textarea
                                id="lead-details"
                                placeholder="e.g., email=johndoe@example.com&#10;phone=123-456-7890"
                                value={setupForms.leadDetails || ''}
                                onChange={(e) => setSetupForms({...setupForms, leadDetails: e.target.value})}
                                onDoubleClick={() => {
                                  setSetupEditDetailsText(setupForms.leadDetails || '')
                                  setSetupEditDetailsModalOpen(true)
                                }}
                                rows={3}
                                className="resize-none h-full border-0"
                              />
                            </div>
                          </div>
                          <Button type="submit" disabled={setupSaving} className="w-full">
                            {setupSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Add Lead
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <p className="text-sm text-muted-foreground">{leads.length} leads created</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Setup Edit Lead Details Modal */}
        <Dialog open={setupEditDetailsModalOpen} onOpenChange={setSetupEditDetailsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Lead Details</DialogTitle>
            </DialogHeader>
            
            <Textarea
              value={setupEditDetailsText}
              onChange={(e) => setSetupEditDetailsText(e.target.value)}
              placeholder="e.g., email=johndoe@example.com&#10;phone=123-456-7890&#10;address=123 Main St"
              rows={16}
              className="w-full resize-none"
            />
              
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setSetupEditDetailsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSetupForms({...setupForms, leadDetails: setupEditDetailsText})
                  setSetupEditDetailsModalOpen(false)
                }}
              >
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Lead Details Dialog */}
        <Dialog open={leadDetailsDialogOpen} onOpenChange={setLeadDetailsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedLeadForDetails && (
              <>
                <DialogHeader>
                  <div>
                    <DialogTitle className="text-xl">
                      {selectedLeadForDetails.data?.name || 'Lead Details'}
                    </DialogTitle>
                    <div className="text-xs font-normal text-muted-foreground mt-2 space-y-1">
                      <div>
                        {selectedLeadForDetails.niche_id && <span className="font-bold">{niches.find(n => n.id === selectedLeadForDetails.niche_id)?.name || 'Unknown'}</span>}
                        {selectedLeadForDetails.niche_id && selectedLeadForDetails.city_id && ' • '}
                        {selectedLeadForDetails.city_id && <span className="font-bold">{cities.find(c => c.id === selectedLeadForDetails.city_id)?.name || 'Unknown'}</span>}
                        {(selectedLeadForDetails.niche_id || selectedLeadForDetails.city_id) && selectedLeadForDetails.status && ' • '}
                        {selectedLeadForDetails.status && <Badge variant="outline" className="ml-1">{selectedLeadForDetails.status}</Badge>}
                      </div>
                    </div>
                    <DialogDescription className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                      <span className="text-muted-foreground">
                        Created on {formatDate(selectedLeadForDetails.created_at)}
                      </span>
                      {leadResponses[selectedLeadForDetails.id] && (
                        <span className="text-muted-foreground">
                          • Actioned on {formatDateTime(leadResponses[selectedLeadForDetails.id].created_at)}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                </DialogHeader>

                {/* Lead Data */}
                <div className="space-y-4">
                  <div>
                    <div className="space-y-4">
                      {selectedLeadForDetails.data && Object.keys(selectedLeadForDetails.data).length > 0 ? (
                        <>
                          {Object.entries(selectedLeadForDetails.data)
                            .filter(([key]) => key.toLowerCase() !== 'name')
                            .map(([key, value]) => {
                            const stringValue = String(value)
                            let parsedEntries: Array<[string, string]> = []
                            
                            // Parse key=value pairs from the string
                            if (stringValue.includes('=') && stringValue.includes(',')) {
                              parsedEntries = stringValue.split(',').map(pair => {
                                const [k, v] = pair.split('=').map(s => s.trim())
                                return [k || '', v || ''] as [string, string]
                              }).filter(([k]) => k)
                            } else if (stringValue.includes('=') && !stringValue.includes(',')) {
                              const [k, v] = stringValue.split('=').map(s => s.trim())
                              if (k) {
                                parsedEntries = [[k, v || '']]
                              }
                            }
                            
                            // If we have parsed entries, display them as separate sections
                            if (parsedEntries.length > 0) {
                              return (
                                <div key={key}>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {parsedEntries.map(([pKey, pValue]) => {
                                      const valueLines = pValue.includes(';') 
                                        ? pValue.split(';').map(v => v.trim()).filter(v => v)
                                        : [pValue]
                                      
                                      return (
                                        <div key={`${key}-${pKey}`} className="pb-3 border-b border-border last:border-b-0">
                                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                                            {pKey.replace(/_/g, ' ')}
                                          </label>
                                          <div className="space-y-1">
                                            {valueLines.map((line, idx) => (
                                              <p key={idx} className="text-sm text-foreground">
                                                {line}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            }
                            
                            // Otherwise display as single section
                            return (
                              <div key={key} className="pb-3 border-b border-border last:border-b-0">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                                  {key.replace(/_/g, ' ')}
                                </label>
                                {stringValue.includes(';') ? (
                                  <div className="space-y-1">
                                    {stringValue.split(';').map((line, idx) => (
                                      <p key={idx} className="text-sm text-foreground">
                                        {line.trim()}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-foreground">{stringValue}</p>
                                )}
                              </div>
                            )
                          })}

                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No lead details available</p>
                      )}
                    </div>
                  </div>

                  {/* Creator & Assignment Info */}
                  <div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Created By</p>
                        <p className="mt-1">{selectedLeadForDetails.creator?.name || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned To</p>
                        <p className="mt-1">
                          {(() => {
                            const assignment = cityAssignmentsData.find(
                              (a: any) => a.city_id === selectedLeadForDetails.city_id
                            )
                            if (!assignment) return 'Unassigned'
                            const caller = allUsers.find((u: any) => u.id === assignment.caller_id)
                            return caller?.name || 'Unknown'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned By</p>
                        <p className="mt-1">
                          {(() => {
                            const assignment = cityAssignmentsData.find(
                              (a: any) => a.city_id === selectedLeadForDetails.city_id
                            )
                            if (!assignment) return '—'
                            const manager = allUsers.find((u: any) => u.id === assignment.assigned_by)
                            return manager?.name || 'Unknown'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Action</p>
                        <div className="mt-1">
                          {(() => {
                            const response = leadResponses[selectedLeadForDetails.id]
                            if (!response) return '—'
                            if (response.action === 'approve') return <Badge variant="default" className="bg-green-600">✓ Approved</Badge>
                            if (response.action === 'decline') return <Badge variant="destructive">✕ Declined</Badge>
                            if (response.action === 'later') {
                              const remaining = getRemainingDays(response.scheduled_for)
                              return <span className="text-amber-600 text-xs font-medium">⏱ Later - {remaining === 0 ? 'Due' : remaining + ' days'}</span>
                            }
                            return '—'
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action/Response from Caller */}
                  {leadResponses[selectedLeadForDetails.id] && leadResponses[selectedLeadForDetails.id].response_text && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold text-sm text-muted-foreground mb-2">Caller's Notes</h3>
                      <p className="text-sm text-foreground bg-muted/50 p-3 rounded whitespace-pre-wrap">{leadResponses[selectedLeadForDetails.id].response_text}</p>
                    </div>
                  )}

                  {/* Send for Correction Button */}
                  <div className="border-t pt-4 flex gap-2">
                    <Button
                      onClick={() => {
                        setCorrectionLeadId(selectedLeadForDetails.id)
                        setCorrectionNotes('')
                        setCorrectionDialogOpen(true)
                        setLeadDetailsDialogOpen(false)
                      }}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Send for Correction
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Send for Correction Dialog */}
        <Dialog open={correctionDialogOpen} onOpenChange={setCorrectionDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send Lead for Correction</DialogTitle>
              <DialogDescription>
                Request the lead generator to review and correct this lead's information
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedLeadForDetails && (
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-2">
                    Lead: {selectedLeadForDetails.data?.name}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {niches.find(n => n.id === selectedLeadForDetails.niche_id)?.name} - {cities.find(c => c.id === selectedLeadForDetails.city_id)?.name}
                  </p>
                </div>
              )}

              {existingCorrectionMessage && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-2">
                    ⚠️ This lead is already awaiting correction
                  </p>
                  <p className="text-xs text-amber-800 mb-2">Current message:</p>
                  <p className="text-xs text-amber-700 bg-white p-2 rounded border border-amber-100 italic">
                    "{existingCorrectionMessage}"
                  </p>
                  <p className="text-xs text-amber-700 mt-2">Update the message below to send new instructions to the lead generator:</p>
                </div>
              )}

              <div>
                <label htmlFor="correction-notes" className="text-sm font-semibold text-foreground block mb-2">
                  {existingCorrectionMessage ? 'Updated notes (will replace previous message):' : 'What needs correction?'} *
                </label>
                <Textarea
                  id="correction-notes"
                  placeholder="Describe what information needs to be corrected or clarified..."
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  className="text-sm resize-none"
                  rows={4}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setCorrectionDialogOpen(false)
                  setLeadDetailsDialogOpen(true)
                  setExistingCorrectionMessage(null)
                  setCorrectionNotes('')
                }}
                disabled={submittingCorrection}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendForCorrection}
                disabled={submittingCorrection || !correctionNotes.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {submittingCorrection ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {existingCorrectionMessage ? 'Updating...' : 'Sending...'}
                  </>
                ) : (
                  existingCorrectionMessage ? 'Update Message' : 'Send for Correction'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
