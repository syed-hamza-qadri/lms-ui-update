'use client'

import React from "react"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, ArrowLeft, Edit2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Niche {
  id: string
  name: string
}

interface City {
  id: string
  name: string
  niche_id: string
  niche_name?: string
}

interface Lead {
  id: string
  niche_id: string
  city_id: string
  data: Record<string, any>
  created_at: string
  actioned_at?: string
  status?: string
  creator?: { id: string; name: string }
  created_by?: string
}

export default function SetupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = getSupabaseClient()
  const { session, loading: sessionLoading } = useSession()

  // Niche States
  const [niches, setNiches] = useState<Niche[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<Lead | null>(null)
  const [leadDetailsDialogOpen, setLeadDetailsDialogOpen] = useState(false)
  const [leadResponses, setLeadResponses] = useState<Record<string, any>>({})
  const [cityAssignmentsData, setCityAssignmentsData] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])

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

  // Dialog States
  const [nicheDialog, setNicheDialog] = useState(false)
  const [cityDialog, setCityDialog] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmType, setDeleteConfirmType] = useState<'niche' | 'city' | 'lead' | null>(null)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [leadDialog, setLeadDialog] = useState(false)

  // Form States
  const [nicheName, setNicheName] = useState('')
  const [cityName, setCityName] = useState('')
  const [selectedNiche, setSelectedNiche] = useState('')
  const [leadName, setLeadName] = useState('')
  const [selectedLeadNiche, setSelectedLeadNiche] = useState('')
  const [selectedLeadCity, setSelectedLeadCity] = useState('')
  const [leadDetails, setLeadDetails] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Edit States
  const [editingNicheId, setEditingNicheId] = useState<string | null>(null)
  const [editingCityId, setEditingCityId] = useState<string | null>(null)
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)

  const resetForm = () => {
    setNicheName('')
    setCityName('')
    setLeadName('')
    setLeadDetails('')
    setSelectedNiche('')
    setSelectedLeadNiche('')
    setSelectedLeadCity('')
    setEditingNicheId(null)
    setEditingCityId(null)
    setEditingLeadId(null)
  }

  const fetchData = async () => {
    try {
      const [nicheRes, cityRes, leadRes, usersRes, cityAssignRes] = await Promise.all([
        supabase.from('niches').select('*').order('name'),
        supabase.from('cities').select('*').order('name'),
        supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(100), // Pagination
        supabase.from('users').select('id, name'),
        supabase.from('city_assignments').select('*'),
      ])

      setNiches(nicheRes.data || [])

      // Enrich cities with niche names
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

      // Set users and city assignments
      setAllUsers(usersRes.data || [])
      setCityAssignmentsData(cityAssignRes.data || [])

      // Enrich leads with creator info
      const usersMap = new Map<string, any>()
      ;(usersRes.data || []).forEach((u: any) => usersMap.set(u.id, u))
      
      const enrichedLeads = (leadRes.data || []).map((lead: any) => ({
        ...lead,
        creator: lead.created_by ? usersMap.get(lead.created_by) : undefined,
      }))
      setLeads(enrichedLeads.slice(0, 100)) // Ensure max 100 leads

      // Fetch lead responses
      const { data: responsesData } = await supabase
        .from('lead_responses')
        .select('lead_id, action, response_text, employee_id, created_at, actioned_at')
        .order('created_at', { ascending: false })
        .limit(1000)

      const responseMap: Record<string, any> = {}
      ;(responsesData || []).forEach((response: any) => {
        if (!responseMap[response.lead_id]) {
          responseMap[response.lead_id] = response
        }
      })
      setLeadResponses(responseMap)
    } catch (error) {
      console.error('[v0] Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // fetchData is already called in the session validation useEffect above

  const handleAddNiche = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nicheName) return

    // If editing, use update handler
    if (editingNicheId) {
      handleUpdateNiche(e)
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('niches')
        .insert({ name: nicheName })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Niche added successfully',
      })
      setNicheName('')
      setNicheDialog(false)

      // Refresh data
      fetchData()
    } catch (error) {
      console.error('[v0] Error adding niche:', error)
      toast({
        title: 'Error',
        description: 'Failed to add niche',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cityName || !selectedNiche) {
      toast({
        title: 'Validation Error',
        description: 'Please select a niche and enter a city name',
        variant: 'destructive',
      })
      return
    }

    // If editing, use update handler
    if (editingCityId) {
      handleUpdateCity(e)
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('cities')
        .insert({
          name: cityName,
          niche_id: selectedNiche,
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'City added successfully',
      })
      setCityName('')
      setSelectedNiche('')
      setCityDialog(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Error adding city:', error)
      toast({
        title: 'Error',
        description: 'Failed to add city',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadName || !selectedLeadNiche || !selectedLeadCity) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      })
      return
    }

    // If editing, use update handler
    if (editingLeadId) {
      handleUpdateLead(e)
      return
    }

    setSaving(true)
    try {
      // Parse lead details using key=value format
      const detailsObj: Record<string, any> = {}
      if (leadDetails.trim()) {
        leadDetails.split('\n').forEach((line) => {
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

      // Prepare data object with name included
      const leadData = {
        name: leadName,
        ...detailsObj,
      }

      const { error } = await supabase
        .from('leads')
        .insert({
          niche_id: selectedLeadNiche,
          city_id: selectedLeadCity,
          data: leadData,
          status: 'unassigned',
        })

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Lead added successfully',
      })
      setLeadName('')
      setLeadDetails('')
      setSelectedLeadNiche('')
      setSelectedLeadCity('')
      setLeadDialog(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Error adding lead:', error)
      toast({
        title: 'Error',
        description: 'Failed to add lead',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const parseLeadDetails = (details: string): Record<string, any> => {
    const lines = details.trim().split('\n').filter(line => line.trim())
    const parsedDetails: Record<string, any> = {}

    lines.forEach((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine) return // Skip empty lines

      const [key, ...valueParts] = trimmedLine.split('=')
      
      // Validate that we have both key and value
      if (!key || !key.trim() || valueParts.length === 0) {
        console.warn(`[v0] Invalid detail format: "${trimmedLine}". Use "key=value" format.`)
        return
      }

      const trimmedKey = key.trim()
      const trimmedValue = valueParts.join('=').trim() // Rejoin in case value contains '='

      if (trimmedKey && trimmedValue) {
        parsedDetails[trimmedKey] = trimmedValue
      }
    })

    return parsedDetails
  }

  const handleEditNiche = (niche: Niche) => {
    setNicheName(niche.name)
    setEditingNicheId(niche.id)
    setNicheDialog(true)
  }

  const handleUpdateNiche = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nicheName || !editingNicheId) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('niches')
        .update({ name: nicheName })
        .eq('id', editingNicheId)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Niche updated successfully',
      })
      setNicheName('')
      setEditingNicheId(null)
      setNicheDialog(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Error updating niche:', error)
      toast({
        title: 'Error',
        description: 'Failed to update niche',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNiche = async (nicheId: string) => {
    setDeleteItemId(nicheId)
    setDeleteConfirmType('niche')
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteNiche = async () => {
    if (!deleteItemId) return
    try {
      await supabase.from('niches').delete().eq('id', deleteItemId)
      toast({
        title: 'Success',
        description: 'Niche deleted successfully',
      })

      const { data } = await supabase.from('niches').select('*').order('name')
      setNiches(data || [])
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    } catch (error) {
      console.error('[v0] Error deleting niche:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete niche',
        variant: 'destructive',
      })
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    }
  }

  const handleEditCity = (city: City) => {
    setCityName(city.name)
    setSelectedNiche(city.niche_id)
    setEditingCityId(city.id)
    setCityDialog(true)
  }

  const handleUpdateCity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cityName || !selectedNiche || !editingCityId) {
      toast({
        title: 'Validation Error',
        description: 'Please select a niche and enter a city name',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('cities')
        .update({ name: cityName, niche_id: selectedNiche })
        .eq('id', editingCityId)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'City updated successfully',
      })
      setCityName('')
      setSelectedNiche('')
      setEditingCityId(null)
      setCityDialog(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Error updating city:', error)
      toast({
        title: 'Error',
        description: 'Failed to update city',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCity = async (cityId: string) => {
    setDeleteItemId(cityId)
    setDeleteConfirmType('city')
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteCity = async () => {
    if (!deleteItemId) return
    try {
      await supabase.from('cities').delete().eq('id', deleteItemId)
      toast({
        title: 'Success',
        description: 'City deleted successfully',
      })

      const { data } = await supabase.from('cities').select('*').order('name')
      setCities(
        (data || []).map((city: any) => {
          const niche = niches.find((n: any) => n.id === city.niche_id)
          return {
            ...city,
            niche_name: niche?.name || 'Unknown',
          }
        })
      )
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    } catch (error) {
      console.error('[v0] Error deleting city:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete city',
        variant: 'destructive',
      })
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    }
  }

  const handleEditLead = (lead: Lead) => {
    setLeadName(lead.data?.name || '')
    setSelectedLeadNiche(lead.niche_id)
    setSelectedLeadCity(lead.city_id)
    
    // Reconstruct details from data (excluding name) using key=value format
    const details = { ...lead.data }
    delete details.name
    setLeadDetails(Object.entries(details).map(([k, v]) => `${k}=${v}`).join('\n'))
    
    setEditingLeadId(lead.id)
    setLeadDialog(true)
  }

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadName || !selectedLeadNiche || !selectedLeadCity || !editingLeadId) {
      toast({
        title: 'Validation Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      // Parse lead details using key=value format
      const detailsObj: Record<string, any> = {}
      if (leadDetails.trim()) {
        leadDetails.split('\n').forEach((line) => {
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
        name: leadName,
        ...detailsObj,
      }

      const { error } = await supabase
        .from('leads')
        .update({
          niche_id: selectedLeadNiche,
          city_id: selectedLeadCity,
          data: leadData,
        })
        .eq('id', editingLeadId)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Lead updated successfully',
      })
      setLeadName('')
      setLeadDetails('')
      setSelectedLeadNiche('')
      setSelectedLeadCity('')
      setEditingLeadId(null)
      setLeadDialog(false)
      fetchData()
    } catch (error) {
      console.error('[v0] Error updating lead:', error)
      toast({
        title: 'Error',
        description: 'Failed to update lead',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    setDeleteItemId(leadId)
    setDeleteConfirmType('lead')
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteLead = async () => {
    if (!deleteItemId) return
    try {
      await supabase.from('leads').delete().eq('id', deleteItemId)
      toast({
        title: 'Success',
        description: 'Lead deleted successfully',
      })

      const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      setLeads(data || [])
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    } catch (error) {
      console.error('[v0] Error deleting lead:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete lead',
        variant: 'destructive',
      })
      setDeleteConfirmOpen(false)
      setDeleteItemId(null)
    }
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
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/admin')}
              className="h-9 w-9 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Edit2 className="w-4 h-4 text-indigo-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Setup & Manage Data</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">System Configuration</h2>
          <p className="text-gray-500 mt-1">Add niches, cities, and leads to your system</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="niches" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-gray-100/80 rounded-xl mb-6">
            <TabsTrigger value="niches" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">Niches & Cities</TabsTrigger>
            <TabsTrigger value="leads" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">Leads</TabsTrigger>
          </TabsList>

          {/* Niches & Cities Combined Tab */}
          <TabsContent value="niches" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="border-gray-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 border-b border-gray-100 pb-6">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900">Manage Niches & Cities</CardTitle>
                  <CardDescription className="text-gray-500">Create and organize niches with their associated cities</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={nicheDialog} onOpenChange={(open) => {
                    setNicheDialog(open)
                    if (!open) resetForm()
                  }}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-10 px-4">
                        <Plus className="w-4 h-4" />
                        Add Niche
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
                      <div className="bg-indigo-600 p-6 text-white">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold text-white">{editingNicheId ? 'Edit Niche' : 'Add New Niche'}</DialogTitle>
                          <DialogDescription className="text-indigo-100">{editingNicheId ? 'Update niche information' : 'Create a new business niche category'}</DialogDescription>
                        </DialogHeader>
                      </div>
                      <form onSubmit={handleAddNiche} className="p-6 space-y-5 bg-white">
                        <div className="space-y-2">
                          <Label htmlFor="niche-name" className="text-sm font-semibold text-gray-700">Niche Name</Label>
                          <Input
                            id="niche-name"
                            placeholder="e.g., Real Estate, Software Services"
                            value={nicheName}
                            onChange={(e) => setNicheName(e.target.value)}
                            className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                        <Button type="submit" disabled={saving} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {editingNicheId ? 'Save Niche' : 'Add Niche'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={cityDialog} onOpenChange={(open) => {
                    setCityDialog(open)
                    if (!open) resetForm()
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2 rounded-xl border-gray-200 hover:bg-gray-50 h-10 px-4">
                        <Plus className="w-4 h-4" />
                        Add City
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
                      <div className="bg-indigo-600 p-6 text-white">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold text-white">{editingCityId ? 'Edit City' : 'Add New City'}</DialogTitle>
                          <DialogDescription className="text-indigo-100">{editingCityId ? 'Update city information' : 'Create a new city in a niche'}</DialogDescription>
                        </DialogHeader>
                      </div>
                      <form onSubmit={handleAddCity} className="p-6 space-y-5 bg-white">
                        <div className="space-y-2">
                          <Label htmlFor="city-name" className="text-sm font-semibold text-gray-700">City Name</Label>
                          <Input
                            id="city-name"
                            placeholder="e.g., New York, London"
                            value={cityName}
                            onChange={(e) => setCityName(e.target.value)}
                            className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="niche-select" className="text-sm font-semibold text-gray-700">Select Niche</Label>
                          <Select value={selectedNiche} onValueChange={setSelectedNiche}>
                            <SelectTrigger className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500">
                              <SelectValue placeholder="Select a niche" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-gray-200 shadow-xl">
                              {niches.map((niche: any) => (
                                <SelectItem key={niche.id} value={niche.id}>
                                  {niche.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="submit" disabled={saving} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {editingCityId ? 'Save City' : 'Add City'}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {niches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Edit2 className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No niches yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {niches.map((niche: any) => {
                      const nicheCities = cities.filter(c => c.niche_id === niche.id)
                      return (
                        <div key={niche.id} className="border border-gray-200 rounded-2xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-lg text-gray-900">{niche.name}</h3>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditNiche(niche)}
                                className="h-8 w-8 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteNiche(niche.id)}
                                className="h-8 w-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {nicheCities.length === 0 ? (
                            <div className="bg-gray-50 rounded-xl p-4 text-center border border-dashed border-gray-200">
                              <p className="text-sm text-gray-500 italic">No cities in this niche</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {nicheCities.map((city: any) => (
                                <div
                                  key={city.id}
                                  className="flex items-center justify-between p-3 bg-gray-50/80 border border-gray-100 rounded-xl group hover:bg-gray-100 transition-colors"
                                >
                                  <span className="font-medium text-sm text-gray-700">{city.name}</span>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditCity(city)}
                                      className="h-7 w-7 rounded-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteCity(city.id)}
                                      className="h-7 w-7 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <Card className="border-gray-200/60 shadow-sm rounded-2xl overflow-hidden bg-white">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 border-b border-gray-100 pb-6">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900">Manage Leads</CardTitle>
                  <CardDescription className="text-gray-500">Create and manage leads within cities</CardDescription>
                </div>
                <Dialog open={leadDialog} onOpenChange={(open) => {
                  setLeadDialog(open)
                  if (!open) resetForm()
                }}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm h-10 px-4">
                      <Plus className="w-4 h-4" />
                      Add Lead
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
                    <div className="bg-indigo-600 p-6 text-white">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-white">{editingLeadId ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
                        <DialogDescription className="text-indigo-100">{editingLeadId ? 'Update lead information' : 'Create a new lead within a city'}</DialogDescription>
                      </DialogHeader>
                    </div>
                    <form onSubmit={handleAddLead} className="p-6 space-y-5 bg-white">
                      <div className="space-y-2">
                        <Label htmlFor="lead-name" className="text-sm font-semibold text-gray-700">Lead Name</Label>
                        <Input
                          id="lead-name"
                          placeholder="e.g., John Doe"
                          value={leadName}
                          onChange={(e) => setLeadName(e.target.value)}
                          className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lead-niche-select" className="text-sm font-semibold text-gray-700">Select Niche</Label>
                        <Select value={selectedLeadNiche} onValueChange={setSelectedLeadNiche}>
                          <SelectTrigger className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500">
                            <SelectValue placeholder="Select a niche" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-gray-200 shadow-xl">
                            {niches.map((niche) => (
                              <SelectItem key={niche.id} value={niche.id}>
                                {niche.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lead-city-select" className="text-sm font-semibold text-gray-700">Select City</Label>
                        <Select value={selectedLeadCity} onValueChange={setSelectedLeadCity}>
                          <SelectTrigger className="h-11 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500">
                            <SelectValue placeholder="Select a city" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-gray-200 shadow-xl">
                            {cities.map((city: any) => (
                              <SelectItem key={city.id} value={city.id}>
                                {city.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lead-details" className="text-sm font-semibold text-gray-700">Lead Details</Label>
                        <Textarea
                          id="lead-details"
                          placeholder="e.g., email=johndoe@example.com&#10;phone=123-456-7890"
                          value={leadDetails}
                          onChange={(e) => setLeadDetails(e.target.value)}
                          className="min-h-[100px] rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <Button type="submit" disabled={saving} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white mt-2">
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {editingLeadId ? 'Save Lead' : 'Add Lead'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {leads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Edit2 className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No leads yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 border-b border-gray-100">
                        <tr>
                          <th className="px-6 py-4 font-semibold tracking-wider w-8">#</th>
                          <th className="px-6 py-4 font-semibold tracking-wider">Name</th>
                          <th className="px-6 py-4 font-semibold tracking-wider">Niche</th>
                          <th className="px-6 py-4 font-semibold tracking-wider">City</th>
                          <th className="px-6 py-4 font-semibold tracking-wider">Created By</th>
                          <th className="px-6 py-4 font-semibold tracking-wider">Created At</th>
                          <th className="px-6 py-4 font-semibold tracking-wider text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {leads.map((lead: any, index) => {
                          const niche = niches.find(n => n.id === lead.niche_id)
                          const city = cities.find(c => c.id === lead.city_id)
                          const createdDate = new Date(lead.created_at).toLocaleDateString()
                          return (
                            <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                              <td className="px-6 py-4 text-gray-400 font-medium">{index + 1}</td>
                              <td className="px-6 py-4 font-medium">
                                <button
                                  onClick={() => {
                                    setSelectedLeadForDetails(lead)
                                    setLeadDetailsDialogOpen(true)
                                  }}
                                  className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-semibold"
                                >
                                  {lead.data?.name || 'Lead'}
                                </button>
                              </td>
                              <td className="px-6 py-4 text-gray-600">{niche?.name}</td>
                              <td className="px-6 py-4 text-gray-600">{city?.name}</td>
                              <td className="px-6 py-4 text-gray-600">{lead.creator?.name || 'Unknown'}</td>
                              <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{createdDate}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditLead(lead)}
                                    className="h-8 w-8 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteLead(lead.id)}
                                    className="h-8 w-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
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
          </TabsContent>
        </Tabs>

        {/* Lead Details Dialog */}
        <Dialog open={leadDetailsDialogOpen} onOpenChange={setLeadDetailsDialogOpen}>
          <DialogContent className="sm:max-w-2xl rounded-2xl border-0 shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
            {selectedLeadForDetails && (
              <>
                <div className="bg-indigo-600 p-6 text-white shrink-0">
                  <DialogHeader>
                    <div className="w-full">
                      <DialogTitle className="text-2xl font-bold text-white">
                        {selectedLeadForDetails.data?.name || 'Lead Details'}
                      </DialogTitle>
                      <div className="flex items-center gap-3 mt-3 flex-wrap text-sm text-indigo-100">
                        <span className="font-medium">{niches.find(n => n.id === selectedLeadForDetails.niche_id)?.name || 'Unknown'}</span>
                        <span>•</span>
                        <span className="font-medium">{cities.find(c => c.id === selectedLeadForDetails.city_id)?.name || 'Unknown'}</span>
                        <span>•</span>
                        <Badge variant="secondary" className="capitalize text-xs bg-white/20 text-white hover:bg-white/30 border-0">
                          {selectedLeadForDetails.status || 'unassigned'}
                        </Badge>
                      </div>
                      <DialogDescription className="mt-3 text-xs text-indigo-200 flex items-center gap-2 flex-wrap">
                        <span>
                          Created on {new Date(selectedLeadForDetails.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {leadResponses[selectedLeadForDetails.id] && (
                          <>
                            <span>•</span>
                            <span>
                              Actioned on {new Date(leadResponses[selectedLeadForDetails.id].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {new Date(leadResponses[selectedLeadForDetails.id].created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        )}
                      </DialogDescription>
                    </div>
                  </DialogHeader>
                </div>

                {/* Lead Data */}
                <div className="p-6 overflow-y-auto bg-gray-50/50">
                  <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {parsedEntries.map(([pKey, pValue]) => {
                                        const valueLines = pValue.includes(';') 
                                          ? pValue.split(';').map(v => v.trim()).filter(v => v)
                                          : [pValue]
                                        
                                        return (
                                          <div key={`${key}-${pKey}`} className="pb-3 border-b border-gray-100 last:border-b-0">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                              {pKey.replace(/_/g, ' ')}
                                            </label>
                                            <div className="space-y-1">
                                              {valueLines.map((line, idx) => (
                                                <p key={idx} className="text-sm font-medium text-gray-900">
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
                                <div key={key} className="pb-3 border-b border-gray-100 last:border-b-0">
                                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                                    {key.replace(/_/g, ' ')}
                                  </label>
                                  {stringValue.includes(';') ? (
                                    <div className="space-y-1">
                                      {stringValue.split(';').map((line, idx) => (
                                        <p key={idx} className="text-sm font-medium text-gray-900">
                                          {line.trim()}
                                        </p>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm font-medium text-gray-900">{stringValue}</p>
                                  )}
                                </div>
                              )
                            })}

                          </>
                        ) : (
                          <p className="text-sm text-gray-500 italic text-center py-4">No lead details available</p>
                        )}
                      </div>
                    </div>

                    {/* Creator, Created At, and Assignment Info */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created By</p>
                          <p className="mt-1 text-sm font-medium text-gray-900">{selectedLeadForDetails.creator?.name || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Created At</p>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {new Date(selectedLeadForDetails.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            <span className="text-xs text-gray-500 ml-2">{new Date(selectedLeadForDetails.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned By</p>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {(() => {
                              const assignment = cityAssignmentsData.find((a: any) => a.city_id === selectedLeadForDetails.city_id)
                              if (!assignment) return '—'
                              const manager = allUsers.find((u: any) => u.id === assignment.assigned_by)
                              return manager?.name || 'Unknown'
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned To</p>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {(() => {
                              const assignment = cityAssignmentsData.find((a: any) => a.city_id === selectedLeadForDetails.city_id)
                              if (!assignment) return 'Unassigned'
                              const caller = allUsers.find((u: any) => u.id === assignment.caller_id)
                              return caller?.name || 'Unknown'
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Actioned At</p>
                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {selectedLeadForDetails.actioned_at ? (
                              <>
                                {new Date(selectedLeadForDetails.actioned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                <span className="text-xs text-gray-500 ml-2">{new Date(selectedLeadForDetails.actioned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                          <div className="mt-1">
                            <Badge variant="secondary" className="capitalize text-xs bg-gray-100 text-gray-700">
                              {selectedLeadForDetails.status || 'unassigned'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Caller's Notes */}
                    {leadResponses[selectedLeadForDetails.id] && leadResponses[selectedLeadForDetails.id].response_text && (
                      <div className="bg-amber-50 rounded-xl border border-amber-100 p-5 shadow-sm">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Caller's Notes</p>
                        <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{leadResponses[selectedLeadForDetails.id].response_text}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="rounded-2xl border-0 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">
                Delete {deleteConfirmType === 'niche' ? 'Niche' : deleteConfirmType === 'city' ? 'City' : 'Lead'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500">
                {deleteConfirmType === 'niche' && 'Delete this niche? All associated data will be removed.'}
                {deleteConfirmType === 'city' && 'Delete this city? All associated leads will be removed.'}
                {deleteConfirmType === 'lead' && 'Delete this lead? This action cannot be undone.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end mt-4">
              <AlertDialogCancel className="rounded-xl h-11 border-gray-200 hover:bg-gray-50">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteConfirmType === 'niche') confirmDeleteNiche()
                  else if (deleteConfirmType === 'city') confirmDeleteCity()
                  else if (deleteConfirmType === 'lead') confirmDeleteLead()
                }}
                className="rounded-xl h-11 bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
