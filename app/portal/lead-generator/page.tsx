'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseClient } from '@/lib/supabase-context'
import { useSession } from '@/lib/session'
import { getPendingCorrectionsForLeadGenerator, completeLeadCorrection } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Edit2, LogOut, BarChart3, ChevronRight, Eye, EyeOff, RefreshCw, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Lead {
  id: string
  niche_id: string
  city_id: string
  data: Record<string, any>
  status: string
  created_at: string
  created_by?: string
  correction_status?: 'pending' | 'corrected' | null
  corrected_at?: string
}

interface Niche {
  id: string
  name: string
}

interface City {
  id: string
  name: string
  niche_id: string
}

export default function LeadGenerator() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useSupabaseClient()
  const { session, loading: sessionLoading } = useSession()

  const [loading, setLoading] = useState(true)
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [filteredCities, setFilteredCities] = useState<City[]>([])

  const [openDialog, setOpenDialog] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [selectedNiche, setSelectedNiche] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [leadName, setLeadName] = useState('')
  const [leadDetails, setLeadDetails] = useState('')
  
  // Tab state
  const [activeTab, setActiveTab] = useState('unassigned')
  
  // Performance metrics
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [performance, setPerformance] = useState({ 
    added: 0, 
    approved: 0, 
    declined: 0, 
    scheduled: 0, 
    pending: 0,
    wrong: 0,
    corrected: 0,
    conversionRate: 0
  })
  
  // Actioned leads view
  const [selectedActionNiche, setSelectedActionNiche] = useState<string>('')
  const [selectedActionCity, setSelectedActionCity] = useState<string>('')
  const [filteredActionCities, setFilteredActionCities] = useState<City[]>([])
  
  // Lead details dialog
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<any>(null)
  const [leadDetailsDialogOpen, setLeadDetailsDialogOpen] = useState(false)
  
  // Edit lead details in modal
  const [editDetailsModalOpen, setEditDetailsModalOpen] = useState(false)
  const [editDetailsText, setEditDetailsText] = useState('')
  
  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)

  // Reload loading state
  const [reloading, setReloading] = useState(false)

  // Corrections state
  const [corrections, setCorrections] = useState<any[]>([])
  const [completingCorrectionId, setCompletingCorrectionId] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push('/portal')
      return
    }
    if (session) {
      fetchData()
    }
  }, [session, sessionLoading, router])

  // Filter cities by selected niche for new lead creation
  useEffect(() => {
    if (selectedNiche) {
      const filtered = cities.filter(c => c.niche_id === selectedNiche)
      setFilteredCities(filtered)
      setSelectedCity('')
    }
  }, [selectedNiche, cities])

  // Filter cities by selected niche for actioned leads view
  useEffect(() => {
    if (selectedActionNiche) {
      const filtered = cities.filter(c => c.niche_id === selectedActionNiche)
      setFilteredActionCities(filtered)
      setSelectedActionCity('')
    }
  }, [selectedActionNiche, cities])

  const fetchData = async () => {
    try {
      setLoading(true)
      if (!session?.user_id) {
        router.push('/portal')
        return
      }
      const userId = session.user_id

      const { data: nichesData } = await supabase
        .from('niches')
        .select('*')
        .order('name')

      const { data: citiesData } = await supabase
        .from('cities')
        .select('*')
        .order('name')

      // Filter leads to only show those created by current user
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })

      setNiches(nichesData || [])
      setCities(citiesData || [])
      setAllLeads((leadsData || []).slice(0, 500))

      // Fetch pending corrections
      const correctionsData = await getPendingCorrectionsForLeadGenerator(userId)
      setCorrections(correctionsData || [])

      // Calculate performance metrics for this lead generator based on lead.status
      let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
      
      ;(leadsData || []).forEach((lead: any) => {
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
      
      setPerformance({
        added: (leadsData || []).length,
        approved,
        declined,
        scheduled,
        pending,
        wrong,
        corrected,
        conversionRate
      })
    } catch (error) {
      console.error('[Lead-Gen] Error fetching data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReloadTabs = async () => {
    try {
      setReloading(true)
      if (!session?.user_id) return

      // Filter leads to only show those created by current user
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('created_by', session.user_id)
        .order('created_at', { ascending: false })

      setAllLeads((leadsData || []).slice(0, 500))

      // Calculate performance metrics for this lead generator based on lead.status
      let approved = 0, declined = 0, scheduled = 0, pending = 0, wrong = 0, corrected = 0
      
      ;(leadsData || []).forEach((lead: any) => {
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
      
      setPerformance({
        added: (leadsData || []).length,
        approved,
        declined,
        scheduled,
        pending,
        wrong,
        corrected,
        conversionRate
      })

      // Fetch corrections
      const correctionsData = await getPendingCorrectionsForLeadGenerator(session.user_id)
      setCorrections(correctionsData || [])

      toast({
        title: 'Success',
        description: 'Tabs reloaded successfully',
      })
    } catch (error) {
      console.error('Error reloading tabs:', error)
      toast({
        title: 'Error',
        description: 'Failed to reload tabs',
        variant: 'destructive',
      })
    } finally {
      setReloading(false)
    }
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedNiche || !selectedCity || !leadName || !leadDetails) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    setCreating(true)
    try {
      const leadData = { name: leadName, details: leadDetails }
      
      if (isEditing && editingId) {
        // Update existing lead
        const { error } = await supabase
          .from('leads')
          .update({
            niche_id: selectedNiche,
            city_id: selectedCity,
            data: leadData,
          })
          .eq('id', editingId)

        if (error) {
          console.error('Supabase error (update):', error)
          throw new Error(error.message || 'Failed to update lead')
        }

        toast({
          title: 'Success',
          description: 'Lead updated successfully',
        })
        setIsEditing(false)
        setEditingId(null)
      } else {
        // Create new lead
        if (!session?.user_id) {
          throw new Error('Session not found')
        }
        const userId = session.user_id
        const { error } = await supabase
          .from('leads')
          .insert({
            niche_id: selectedNiche,
            city_id: selectedCity,
            data: leadData,
            status: 'unassigned',
            created_by: userId,
          })

        if (error) {
          console.error('Supabase error (insert):', error)
          throw new Error(error.message || 'Failed to create lead')
        }

        toast({
          title: 'Success',
          description: 'Lead created successfully',
        })
      }

      resetForm()
      setOpenDialog(false)
      handleReloadTabs()
    } catch (error) {
      console.error('Error:', error)
      let errorMessage = 'Failed to save lead'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String((error as any).message)
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const truncateDetails = (text: string, lines: number = 1) => {
    const lineArray = text.split('\n')
    if (lineArray.length > lines) {
      return lineArray.slice(0, lines).join('\n') + '...'
    }
    return text.length > 60 ? text.substring(0, 60) + '...' : text
  }

  const handleEditLead = (lead: Lead) => {
    setEditingId(lead.id)
    setIsEditing(true)
    setLeadName(lead.data.name || '')
    setLeadDetails(lead.data.details || '')
    
    // Set niche and city in sequence to allow filtering
    setSelectedNiche(lead.niche_id)
    setTimeout(() => {
      setSelectedCity(lead.city_id)
      setOpenDialog(true)
    }, 0)
  }

  const handleDeleteLead = async (leadId: string) => {
    setLeadToDelete(leadId)
    setDeletePassword('')
    setShowDeletePassword(false)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!leadToDelete || !deletePassword) {
      toast({
        title: 'Error',
        description: 'Please enter your password',
        variant: 'destructive',
      })
      return
    }

    try {
      // Get current user's password hash for verification
      if (!session?.user_id) {
        throw new Error('Session not found')
      }

      // Fetch current user to verify password
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('password')
        .eq('id', session.user_id)
        .single()

      if (userError || !userData) {
        throw new Error('Unable to verify credentials')
      }

      // Import comparePassword from lib
      const { comparePassword } = await import('@/lib/password')
      const passwordMatch = await comparePassword(deletePassword, userData.password)

      if (!passwordMatch) {
        toast({
          title: 'Error',
          description: 'Incorrect password',
          variant: 'destructive',
        })
        return
      }

      // Delete the lead
      const { error: deleteError } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadToDelete)

      if (deleteError) throw deleteError

      toast({
        title: 'Success',
        description: 'Lead deleted successfully',
      })

      setDeleteConfirmOpen(false)
      setLeadToDelete(null)
      setDeletePassword('')
      handleReloadTabs()
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete lead',
        variant: 'destructive',
      })
    }
  }

  const resetForm = () => {
    setSelectedNiche('')
    setSelectedCity('')
    setLeadName('')
    setLeadDetails('')
    setIsEditing(false)
    setEditingId(null)
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

  const handleCompleteCorrection = async (correctionId: string) => {
    setCompletingCorrectionId(correctionId)
    try {
      const { success, error } = await completeLeadCorrection(correctionId)

      if (!success) {
        throw new Error(error || 'Failed to complete correction')
      }

      toast({
        title: 'Success',
        description: 'Correction marked as complete. Lead reset to unassigned status.',
      })

      // Refresh corrections and refresh tabs to show updated lead
      setCorrections(prev => prev.filter(c => c.id !== correctionId))
      handleReloadTabs()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete correction'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setCompletingCorrectionId(null)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  // Helper function to get unassigned leads
  const unassignedLeads = allLeads.filter(l => l.status === 'unassigned')
  
  // Helper function to get actioned leads
  const actionedLeads = allLeads.filter(l => l.status !== 'unassigned')
  
  // Helper function to get actioned leads for selected city
  const actionedLeadsInCity = selectedActionCity 
    ? actionedLeads.filter(l => l.city_id === selectedActionCity)
    : actionedLeads

  return (
    <main className="min-h-screen bg-[#fcfcfc] p-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-[-10%] left-[-5%] w-[35%] h-[35%] rounded-full bg-blue-100/40 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[35%] h-[35%] rounded-full bg-indigo-100/40 blur-[100px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12 space-y-4">
          <div className="inline-flex items-center justify-center px-3 py-1 mb-4 rounded-full bg-white border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">Lead Generator</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900">Lead Generator</h1>
              <p className="text-gray-500 mt-2 text-lg">Create and manage leads across niches and cities</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleReloadTabs} disabled={reloading} className="flex items-center gap-2 rounded-xl h-11 px-4 border-gray-200 hover:bg-gray-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
                Reload
              </Button>
              <Button variant="outline" onClick={() => setPerformanceOpen(true)} className="flex items-center gap-2 rounded-xl h-11 px-4 border-gray-200 hover:bg-gray-50 transition-colors">
                <BarChart3 className="w-4 h-4" />
                Status
              </Button>
              <Dialog open={openDialog} onOpenChange={(open) => {
                setOpenDialog(open)
                if (!open) resetForm()
              }}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2 rounded-xl h-11 px-4 bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                    <Plus className="w-4 h-4" />
                    New Lead
                  </Button>
                </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-gray-900">{isEditing ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
                <DialogDescription className="text-gray-500">{isEditing ? 'Update lead information' : 'Create a new lead'}</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAddLead} className="space-y-5">
                <div>
                  <Label htmlFor="niche" className="mb-2 block text-sm font-semibold text-gray-700">Niche</Label>
                  <Select value={selectedNiche} onValueChange={setSelectedNiche}>
                    <SelectTrigger id="niche" className="h-11 rounded-lg border-gray-200">
                      <SelectValue placeholder="Select a niche" />
                    </SelectTrigger>
                    <SelectContent>
                      {niches.map(niche => (
                        <SelectItem key={niche.id} value={niche.id}>
                          {niche.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="city" className="mb-2 block text-sm font-semibold text-gray-700">City</Label>
                  <Select value={selectedCity} onValueChange={setSelectedCity} disabled={!selectedNiche}>
                    <SelectTrigger id="city" className="h-11 rounded-lg border-gray-200">
                      <SelectValue placeholder="Select a city" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCities.map(city => (
                        <SelectItem key={city.id} value={city.id}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-700">Lead Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., John Doe"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    className="h-11 rounded-lg border-gray-200"
                  />
                </div>

                <div>
                  <Label htmlFor="details" className="mb-2 block flex items-center justify-between text-sm font-semibold text-gray-700">
                    <span>Lead Details</span>
                    <span className="text-xs text-muted-foreground">(Double-click to expand)</span>
                  </Label>
                  <div className="relative border rounded-md bg-background h-32 overflow-y-auto">
                    <Textarea
                      id="details"
                      placeholder="e.g., email=johndoe@example.com&#10;phone=123-456-7890"
                      value={leadDetails}
                      onChange={(e) => setLeadDetails(e.target.value)}
                      onDoubleClick={() => {
                        setEditDetailsText(leadDetails)
                        setEditDetailsModalOpen(true)
                      }}
                      rows={3}
                      className="resize-none h-full border-0"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={creating} className="w-full">
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isEditing ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    isEditing ? 'Update Lead' : 'Add Lead'
                  )}
                </Button>
              </form>
            </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2 rounded-xl h-11 px-4 border-gray-200 hover:bg-gray-50 transition-colors">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Performance Dialog */}
        <Dialog open={performanceOpen} onOpenChange={setPerformanceOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-gray-900">Your Performance Metrics</DialogTitle>
              <DialogDescription className="text-gray-500">Overview of your performance and capacity</DialogDescription>
            </DialogHeader>
            
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-blue-900">{session?.user_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Leads Added:</span>
                  <Badge variant="outline" className="bg-white">{performance.added}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Approved:</span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">{performance.approved || 0}</Badge>
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
          </DialogContent>
        </Dialog>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-12">
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-gray-100/80 p-1 rounded-xl h-11">
            <TabsTrigger value="unassigned" disabled={reloading} className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all">
              New Leads
              {reloading && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
            <TabsTrigger value="actioned" disabled={reloading} className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all">
              Actioned Leads
              {reloading && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
            <TabsTrigger value="corrections" disabled={reloading} className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 transition-all">
              Corrections ({corrections.length})
              {reloading && <Loader2 className="w-4 h-4 animate-spin" />}
            </TabsTrigger>
          </TabsList>

          {/* Unassigned Leads Tab */}
          <TabsContent value="unassigned" className="mt-6">
            <Card className="border-gray-200 bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-md transition-shadow"
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 font-semibold text-sm w-8">#</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Niche</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">City</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Details</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Created At</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedLeads.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12">
                            <p className="text-muted-foreground">No new leads yet</p>
                          </td>
                        </tr>
                      ) : (
                      unassignedLeads.map((lead, index) => {
                        const niche = niches.find(n => n.id === lead.niche_id)
                        const city = cities.find(c => c.id === lead.city_id)
                        const createdDate = new Date(lead.created_at).toLocaleString()
                        return (
                          <tr key={lead.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{index + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium cursor-pointer text-primary hover:underline" onClick={() => {
                              setSelectedLeadForDetails(lead)
                              setLeadDetailsDialogOpen(true)
                            }}>{lead.data.name}</td>
                            <td className="px-4 py-3 text-sm">{niche?.name}</td>
                            <td className="px-4 py-3 text-sm">{city?.name}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground line-clamp-2 break-words max-w-xs">{truncateDetails(lead.data.details, 1)}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">{createdDate}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditLead(lead)}
                                  className="flex items-center gap-1 text-xs h-7 px-2"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="flex items-center gap-1 text-xs h-7 px-2"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                      )}
                    </tbody>
                  </table>
                </div>
            </CardContent>
          </Card>
          </TabsContent>

          {/* Actioned Leads Tab */}
          <TabsContent value="actioned" className="mt-6">
            {actionedLeads.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No actioned leads yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Niche Selection - Card View */}
                <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Select Niche</h3>
              {(() => {
                const nichesWithActionedLeads = niches.filter(niche => 
                  actionedLeads.some(l => l.niche_id === niche.id)
                )
                
                return nichesWithActionedLeads.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <p className="text-muted-foreground">No actioned leads available.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {nichesWithActionedLeads.map(niche => {
                      const nicheActionedCount = actionedLeads.filter(l => l.niche_id === niche.id).length
                      return (
                        <Card
                          key={niche.id}
                          className={`cursor-pointer hover:shadow-lg transition-shadow ${selectedActionNiche === niche.id ? 'ring-2 ring-primary' : ''}`}
                          onClick={() => {
                            if (selectedActionNiche === niche.id) {
                              setSelectedActionNiche('')
                              setSelectedActionCity('')
                            } else {
                              setSelectedActionNiche(niche.id)
                            }
                          }}
                        >
                          <CardHeader>
                            <CardTitle className="text-lg">{niche.name}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">
                                {nicheActionedCount} actioned lead{nicheActionedCount !== 1 ? 's' : ''}
                              </span>
                              <ChevronRight className={`w-4 h-4 transition-transform ${selectedActionNiche === niche.id ? 'rotate-90' : ''}`} />
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )
              })()}
                </div>

                {/* City Selection - Card View */}
                {selectedActionNiche && (
                  <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Cities in {niches.find(n => n.id === selectedActionNiche)?.name}
                </h3>
                {(() => {
                  const citiesWithActionedLeads = filteredActionCities.filter(city =>
                    actionedLeads.some(l => l.city_id === city.id)
                  )
                  
                  return citiesWithActionedLeads.length === 0 ? (
                    <Card>
                      <CardContent className="p-12 text-center">
                        <p className="text-muted-foreground">No actioned leads in this niche.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {citiesWithActionedLeads.map(city => {
                        const cityActionedCount = actionedLeads.filter(l => l.city_id === city.id).length
                        return (
                          <Card
                            key={city.id}
                            className={`cursor-pointer hover:shadow-lg transition-shadow ${selectedActionCity === city.id ? 'ring-2 ring-primary' : ''}`}
                            onClick={() => setSelectedActionCity(selectedActionCity === city.id ? '' : city.id)}
                          >
                            <CardHeader>
                              <CardTitle className="text-lg">{city.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                  {cityActionedCount} actioned lead{cityActionedCount !== 1 ? 's' : ''}
                                </span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${selectedActionCity === city.id ? 'rotate-90' : ''}`} />
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )
                })()}
                  </div>
                )}

                {/* Actioned Leads Table */}
                {selectedActionCity && (
                  <div className="space-y-4 mt-8">
                <h3 className="text-lg font-semibold text-foreground">
                  Actioned Leads in {cities.find(c => c.id === selectedActionCity)?.name}
                </h3>
                
                <Card>
                  <CardContent className="p-0">
                    {actionedLeadsInCity.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">No actioned leads in this city</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left px-4 py-3 font-semibold text-sm w-8">#</th>
                              <th className="text-left px-4 py-3 font-semibold text-sm">Name</th>
                              <th className="text-left px-4 py-3 font-semibold text-sm">Created At</th>
                              <th className="text-left px-4 py-3 font-semibold text-sm">Details</th>
                              <th className="text-left px-4 py-3 font-semibold text-sm">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {actionedLeadsInCity.map((lead, index) => {
                              const createdDate = new Date(lead.created_at).toLocaleString()
                              const statusColor = {
                                'approved': 'bg-green-100 text-green-700',
                                'declined': 'bg-red-100 text-red-700',
                                'scheduled': 'bg-yellow-100 text-yellow-700',
                              }[lead.status] || 'bg-gray-100 text-gray-700'
                              
                              return (
                                <tr key={lead.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                                  <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{index + 1}</td>
                                  <td className="px-4 py-3 text-sm font-medium cursor-pointer text-primary hover:underline" onClick={() => {
                                    setSelectedLeadForDetails(lead)
                                    setLeadDetailsDialogOpen(true)
                                  }}>{lead.data.name}</td>
                                  <td className="px-4 py-3 text-sm whitespace-nowrap">{createdDate}</td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground line-clamp-2 break-words max-w-xs">{truncateDetails(lead.data.details, 1)}</td>
                                  <td className="px-4 py-3">
                                    <Badge className={statusColor}>
                                      {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                                    </Badge>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Corrections Tab */}
          <TabsContent value="corrections" className="mt-6">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 font-semibold text-sm w-8">#</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Lead Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Requested By</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Niche</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">City</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Notes</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Date</th>
                        <th className="text-left px-4 py-3 font-semibold text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corrections.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12">
                            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <p className="text-muted-foreground">No pending corrections. All your leads are up to date!</p>
                          </td>
                        </tr>
                      ) : (
                        corrections.map((correction, index) => {
                          const lead = allLeads.find(l => l.id === correction.lead_id)
                          const niche = lead ? niches.find(n => n.id === lead.niche_id) : null
                          const city = lead ? cities.find(c => c.id === lead.city_id) : null
                          const correctionDate = new Date(correction.created_at).toLocaleDateString()
                          
                          return (
                            <tr key={correction.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium cursor-pointer text-primary hover:underline" onClick={() => {
                                setSelectedLeadForDetails(lead)
                                setLeadDetailsDialogOpen(true)
                              }}>
                                {lead?.data?.name || `Lead ${correction.lead_id.slice(0, 8)}...`}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <Badge className="bg-amber-100 text-amber-700 text-xs">
                                  {correction.requested_by_role} - {correction.requested_by_name}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-sm">{niche?.name || 'Unknown'}</td>
                              <td className="px-4 py-3 text-sm">{city?.name || 'Unknown'}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground line-clamp-2 max-w-xs">
                                {correction.reason_notes || '(No notes)'}
                              </td>
                              <td className="px-4 py-3 text-sm whitespace-nowrap">{correctionDate}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (lead) {
                                        setSelectedLeadForDetails(lead)
                                        setEditingId(lead.id)
                                        setIsEditing(true)
                                        setLeadName(lead.data?.name || '')
                                        setLeadDetails(lead.data?.details || '')
                                        
                                        // Set niche and city
                                        setSelectedNiche(lead.niche_id)
                                        setTimeout(() => {
                                          setSelectedCity(lead.city_id)
                                          setOpenDialog(true)
                                        }, 0)
                                      }
                                    }}
                                    className="flex items-center gap-1 text-xs h-7 px-2"
                                    title="Edit this lead"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Edit
                                  </Button>
                                  <Button
                                    onClick={() => handleCompleteCorrection(correction.id)}
                                    disabled={completingCorrectionId === correction.id}
                                    className="gap-1 bg-green-600 hover:bg-green-700 text-xs h-7 px-2"
                                  >
                                    {completingCorrectionId === correction.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Completing...
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3 h-3" />
                                        Done
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Lead Details Dialog */}
        <Dialog open={leadDetailsDialogOpen} onOpenChange={setLeadDetailsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">{selectedLeadForDetails?.data.name}</DialogTitle>
            </DialogHeader>
            {selectedLeadForDetails && (() => {
              const niche = niches.find(n => n.id === selectedLeadForDetails.niche_id)
              const city = cities.find(c => c.id === selectedLeadForDetails.city_id)
              const createdDate = new Date(selectedLeadForDetails.created_at).toLocaleString()
              return (
                <div className="space-y-6">
                  {/* Metadata */}
                  <div className="flex gap-6 flex-wrap pb-6 border-b">
                    {niche && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Niche</p>
                        <p className="text-base font-medium text-foreground">{niche.name}</p>
                      </div>
                    )}
                    {city && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</p>
                        <p className="text-base font-medium text-foreground">{city.name}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</p>
                      <p className="text-base font-medium text-foreground">{createdDate}</p>
                    </div>
                    {selectedLeadForDetails.status && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                        <p className="text-base font-medium text-foreground capitalize">{selectedLeadForDetails.status}</p>
                      </div>
                    )}
                  </div>

                  {/* Lead Details */}
                  <div className="space-y-8">
                    {selectedLeadForDetails.data && Object.keys(selectedLeadForDetails.data).length > 0 ? (
                      Object.entries(selectedLeadForDetails.data)
                        .filter(([key]) => key !== 'name')
                        .map(([key, value]) => {
                          const stringValue = String(value);
                          let parsedEntries: Array<[string, string]> = [];
                          
                          if (stringValue.includes('=') && stringValue.includes(',')) {
                            parsedEntries = stringValue.split(',').map(pair => {
                              const [k, v] = pair.split('=').map(s => s.trim());
                              return [k || '', v || ''] as [string, string];
                            }).filter(([k]) => k);
                          } else if (stringValue.includes('=') && !stringValue.includes(',')) {
                            const [k, v] = stringValue.split('=').map(s => s.trim());
                            if (k) {
                              parsedEntries = [[k, v || '']];
                            }
                          }
                          
                          if (parsedEntries.length > 0) {
                            return (
                              <div key={key}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {parsedEntries.map(([pKey, pValue]) => {
                                    const valueLines = pValue.includes(';') 
                                      ? pValue.split(';').map(v => v.trim()).filter(v => v)
                                      : [pValue];
                                    
                                    return (
                                      <div key={`${key}-${pKey}`} className="pb-4 border-b border-border last:border-b-0">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                                          {pKey.replace(/_/g, ' ')}
                                        </label>
                                        <div className="space-y-1">
                                          {valueLines.map((line, idx) => (
                                            <p key={idx} className="text-sm text-foreground leading-relaxed">
                                              {line}
                                            </p>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <div key={key} className="pb-4 border-b border-border last:border-b-0">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                                {key.replace(/_/g, ' ')}
                              </label>
                              {stringValue.includes(';') ? (
                                <div className="space-y-1">
                                  {stringValue.split(';').map((line, idx) => (
                                    <p key={idx} className="text-sm text-foreground leading-relaxed">
                                      {line.trim()}
                                    </p>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-foreground leading-relaxed">{stringValue}</p>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <p className="text-muted-foreground text-center py-8">No lead details available</p>
                    )}
                  </div>
                </div>
              )
            })()}
          </DialogContent>
        </Dialog>

        {/* Edit Lead Details Modal */}
        <Dialog open={editDetailsModalOpen} onOpenChange={setEditDetailsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Lead Details</DialogTitle>
            </DialogHeader>
            
            <Textarea
              value={editDetailsText}
              onChange={(e) => setEditDetailsText(e.target.value)}
              placeholder="e.g., email=johndoe@example.com&#10;phone=123-456-7890&#10;address=123 Main St"
              rows={16}
              className="w-full resize-none"
            />
              
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditDetailsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setLeadDetails(editDetailsText)
                  setEditDetailsModalOpen(false)
                }}
              >
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
              <DialogDescription>Enter your password to confirm lead deletion</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="delete-password" className="mb-2 block">Password</Label>
                <div className="relative">
                  <Input
                    id="delete-password"
                    type={showDeletePassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleConfirmDelete()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteConfirmOpen(false)
                    setLeadToDelete(null)
                    setDeletePassword('')
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  className="flex-1"
                >
                  Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
