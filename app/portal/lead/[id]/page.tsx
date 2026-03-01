'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2, ArrowLeft, Mic, MicOff, Check, RefreshCw } from 'lucide-react'
import { useSession } from '@/lib/session'
import { wasLeadPreviouslyScheduled, sendLeadForCorrection, resetCorrectionStatus } from '@/lib/auth'

interface Lead {
  id: string
  data: Record<string, any>
  status: string
  niche_id: string
  city_id: string
  daysRemaining?: number
  scheduledFor?: string
  niche_name?: string
  city_name?: string
  wasScheduled?: boolean  // Track if lead was previously scheduled
  correction_status?: 'pending' | 'corrected' | null  // Track correction workflow status
}

interface PreviousResponse {
  id: string
  action: string
  response_text: string
  scheduled_for: string | null
  created_at: string
  actioned_at?: string
  employee_id: string
}

interface ResponseHistory extends PreviousResponse {
  employee_name?: string
}

export default function LeadDetail() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const leadId = params.id as string
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)
  const [action, setAction] = useState<'approve' | 'decline' | 'later' | 'scheduled' | null>(null)
  const [response, setResponse] = useState('')
  const [daysToLater, setDaysToLater] = useState('7')
  const [previousResponse, setPreviousResponse] = useState<PreviousResponse | null>(null)
  const [responseHistory, setResponseHistory] = useState<ResponseHistory[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [nextLeadId, setNextLeadId] = useState<string | null>(null)
  const [cityId, setCityId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmedAction, setConfirmedAction] = useState<{
    action: string
    notes: string
    days?: number
  } | null>(null)
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false)
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [submittingCorrection, setSubmittingCorrection] = useState(false)
  const [existingCorrectionMessage, setExistingCorrectionMessage] = useState<string | null>(null)
  const supabase = getSupabaseClient()
  const { userId, token, loading: sessionLoading, session } = useSession()

  useEffect(() => {
    const fetchLead = async () => {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('*, niches(name), cities(name)')
          .eq('id', leadId)
          .single()

        if (error) throw error

        // Add niche and city names to lead object
        data.niche_name = data.niches?.name
        data.city_name = data.cities?.name

        // Check if lead was previously scheduled (for Later - Unassigned display)
        if (data.status === 'unassigned') {
          data.wasScheduled = await wasLeadPreviouslyScheduled(leadId)
        }

        // Get scheduled_for if status is scheduled
        if (data.status === 'scheduled' && data.follow_up_date) {
          const scheduledDate = new Date(data.follow_up_date)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          scheduledDate.setHours(0, 0, 0, 0)
          const daysRemaining = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          data.scheduledFor = data.follow_up_date
          data.daysRemaining = daysRemaining
        }

        // Fetch all responses for history (ALL users, not just current user)
        const { data: allResponses } = await supabase
          .from('lead_responses')
          .select('id, action, response_text, scheduled_for, created_at, actioned_at, employee_id')
          .eq('lead_id', leadId)
          .order('actioned_at', { ascending: false })
        
        if (allResponses && allResponses.length > 0) {
          // Get unique employee IDs
          const employeeIds = Array.from(new Set(allResponses.map((r: any) => r.employee_id)))
          
          // Fetch employee names
          const { data: employees } = await supabase
            .from('users')
            .select('id, name')
            .in('id', employeeIds)
          
          const employeeMap = new Map(employees?.map((e: any) => [e.id, e.name]) || [])
          
          // Enrich responses with employee names
          const enrichedHistory = allResponses.map((response: any) => ({
            ...response,
            employee_name: employeeMap.get(response.employee_id) || 'Unknown'
          })) as ResponseHistory[]
          
          setResponseHistory(enrichedHistory)
        }
        
        // Select action based on CURRENT LEAD STATUS only
        // For 'Later - Unassigned' leads (wasScheduled=true && status=unassigned), don't select any action
        // For regular 'unassigned' leads, also don't select any action
        if (data.status === 'approved') {
          setAction('approve')
        } else if (data.status === 'declined') {
          setAction('decline')
        } else if (data.status === 'scheduled') {
          setAction('later')
          // Pre-fill days from follow_up_date
          if (data.daysRemaining !== undefined) {
            setDaysToLater(Math.max(1, data.daysRemaining).toString())
          }
        }
        // For 'unassigned' or 'Later - Unassigned', don't select any action
        
        // Fetch latest response (from ANY user) to pre-fill notes
        // NOTE: responseHistory is already fetched above with all responses ordered by actioned_at DESC
        if (allResponses && allResponses.length > 0) {
          // The first response is the latest since ordered by actioned_at DESC
          const latestResponse = allResponses[0]
          setPreviousResponse(latestResponse as PreviousResponse)
          // Pre-fill notes with the latest response from anyone (caller or manager)
          setResponse(latestResponse.response_text || '')
        }

        setLead(data)

        // Store city_id for later navigation
        setCityId(data.city_id)

        // Fetch next UNASSIGNED lead in the same city
        const { data: nextLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('city_id', data.city_id)
          .eq('status', 'unassigned')
          .neq('id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)

        if (nextLeads && nextLeads.length > 0) {
          setNextLeadId(nextLeads[0].id)
        } else {
          setNextLeadId(null)
        }
      } catch (error) {
        console.error('[v0] Error fetching lead:', error)
        toast({
          title: 'Error',
          description: 'Failed to load lead details',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    if (leadId) {
      fetchLead()
    }
  }, [leadId, supabase, userId])

  // Fetch existing correction message when correction dialog opens
  useEffect(() => {
    if (correctionDialogOpen && leadId) {
      const fetchExistingCorrection = async () => {
        try {
          const { data, error } = await supabase
            .from('lead_corrections')
            .select('reason_notes')
            .eq('lead_id', leadId)
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
  }, [correctionDialogOpen, leadId, supabase])

  const handleAction = async () => {
    if (!userId) {
      toast({
        title: 'Error',
        description: 'User session not found. Please login again.',
        variant: 'destructive',
      })
      router.push('/portal')
      return
    }

    if (!action) {
      toast({
        title: 'Error',
        description: 'Please select an action',
        variant: 'destructive',
      })
      return
    }

    setResponding(true)
    try {
      // Map action to valid database action values
      const actionMap: Record<string, string> = {
        'approve': 'approved',
        'decline': 'declined',
        'later': 'scheduled',
        'response': 'response',
      }
      
      const mappedAction = actionMap[action] || action
      
      // Prepare response data with proper action value
      const followUpDate = (action === 'later' || action === 'scheduled') ? new Date(Date.now() + (parseInt(daysToLater) || 7) * 24 * 60 * 60 * 1000).toISOString() : null
      
      const responseData = {
        response_text: response,
        action: mappedAction,
        scheduled_for: followUpDate,
        // actioned_at is automatically set by database trigger
      }

      // Either update existing response or create new one
      if (previousResponse) {
        const { error: updateError } = await supabase
          .from('lead_responses')
          .update(responseData)
          .eq('id', previousResponse.id)

        if (updateError) {
          console.error('Update error:', updateError)
          throw new Error(updateError.message || 'Failed to update response')
        }
      } else {
        const { error: responseError } = await supabase
          .from('lead_responses')
          .insert({
            lead_id: leadId,
            employee_id: userId,
            ...responseData,
          })

        if (responseError) {
          console.error('Response error:', responseError)
          throw new Error(responseError.message || 'Failed to save response')
        }
      }

      // Map action to status value (same as action for these statuses)
      const statusMap: Record<string, string> = {
        'approve': 'approved',
        'decline': 'declined',
        'later': 'scheduled',
        'response': 'unassigned',
      }

      // Update lead status and follow_up_date (actioned_at is automatically set by database trigger)
      const { error: updateError } = await supabase
        .from('leads')
        .update({ 
          status: statusMap[action] || action,
          follow_up_date: followUpDate
        })
        .eq('id', leadId)

      if (updateError) {
        console.error('Update error:', updateError)
        throw new Error(updateError.message || 'Failed to update lead status')
      }

      // Reset correction status if this lead was corrected
      // This clears the "Corrected" badge after caller has taken an action
      if (lead?.correction_status === 'corrected') {
        await resetCorrectionStatus(leadId)
      }

      // Log activity
      const { error: logError } = await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          lead_id: leadId,
          action_type: action,
          description: `Lead ${action}${response ? ': ' + response : ''}`,
        })

      if (logError) {
        console.error('Log error:', logError)
        // Don't throw - activity log is not critical
      }

      // Show confirmation dialog instead of navigating immediately
      setConfirmedAction({
        action: action,
        notes: response,
        days: action === 'later' ? parseInt(daysToLater) : undefined
      })
      setConfirmDialogOpen(true)
    } catch (error) {
      console.error('[v0] Error handling action:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to process action'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setResponding(false)
    }
  }

  const handleConfirmAction = () => {
    toast({
      title: 'Success',
      description: `Lead ${previousResponse ? 'updated' : 'marked'} as ${confirmedAction?.action}`,
    })

    // Close dialog and navigate to next unassigned lead if available, otherwise go to city page assigned tab
    setConfirmDialogOpen(false)
    
    setTimeout(() => {
      if (nextLeadId) {
        router.push(`/portal/lead/${nextLeadId}`)
      } else if (cityId) {
        router.push(`/portal/city/${cityId}?tab=assigned`)
      } else {
        router.back()
      }
    }, 300) // Small delay to allow dialog to close smoothly
  }

  const handleSendForCorrection = async () => {
    if (!userId || !session?.user_name) {
      toast({
        title: 'Error',
        description: 'User session not found',
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
      // Determine role from path
      const pathParts = window.location.pathname.split('/')
      const role = pathParts[2] === 'manager' ? 'manager' : 'caller'

      // Call sendLeadForCorrection from auth
      const { success, error, isUpdate } = await sendLeadForCorrection(
        leadId,
        userId,
        session.user_name,
        role,
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

      // Navigate back
      setTimeout(() => {
        if (cityId) {
          router.push(`/portal/city/${cityId}`)
        } else {
          router.back()
        }
      }, 300)
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

  const startVoiceRecording = () => {
    // Check for browser support - handles Chrome, Edge, Safari, and Firefox
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition

    const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().indexOf('firefox') > -1

    if (!SpeechRecognition && !isFirefox) {
      toast({ 
        title: 'Browser Not Supported', 
        description: 'Speech recognition requires Chrome, Edge, Safari, or Firefox. Please upgrade or use a supported browser.',
        variant: 'destructive' 
      })
      return
    }

    // For Firefox - use MediaRecorder API
    if (isFirefox && !SpeechRecognition) {
      startFirefoxVoiceRecording()
      return
    }

    try {
      const recognition = new SpeechRecognition()
      
      // Configure for better cross-browser compatibility
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      let isRecording = false
      let finalTranscript = ''

      recognition.onstart = () => {
        setIsListening(true)
        isRecording = true
        finalTranscript = ''
      }

      recognition.onend = () => {
        setIsListening(false)
        isRecording = false
      }

      recognition.onresult = (event: any) => {
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        // Add final transcript to notes
        if (finalTranscript) {
          setResponse((prev) => {
            const updated = prev ? prev + ' ' + finalTranscript.trim() : finalTranscript.trim()
            finalTranscript = '' // Reset for next batch
            return updated
          })
        }
      }

      recognition.onerror = (event: any) => {
        setIsListening(false)
        
        // Provide specific error messages for different error types
        const errorMessages: Record<string, string> = {
          'no-speech': 'No speech detected. Please try again.',
          'audio-capture': 'No microphone found. Please check your audio devices.',
          'network': 'Network error. Please check your internet connection.',
          'service-not-allowed': 'Speech recognition service is not allowed. Check your browser permissions.',
          'bad-grammar': 'Grammar error in recognition. Please try again.',
          'aborted': 'Speech recognition was aborted.',
        }

        const errorMsg = errorMessages[event.error] || `Speech recognition error: ${event.error}`
        toast({ title: 'Recording Error', description: errorMsg, variant: 'destructive' })
      }

      if (isListening) {
        // Stop recording
        recognition.stop()
        setIsListening(false)
      } else {
        // Start recording
        try {
          recognition.start()
        } catch (err) {
          console.warn('Recognition already started, attempting to stop and restart')
          recognition.stop()
          setTimeout(() => recognition.start(), 100)
        }
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to initialize speech recognition. Please try again.',
        variant: 'destructive' 
      })
      setIsListening(false)
    }
  }

  const startFirefoxVoiceRecording = async () => {
    try {
      if (isListening) {
        setIsListening(false)
        return
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setIsListening(true)

      const mediaRecorder = new MediaRecorder(stream)
      const audioChunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false)
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())

        // Show loading toast
        toast({
          title: 'Transcribing...',
          description: 'Converting your speech to text...',
          variant: 'default'
        })

        try {
          // Send audio to transcription API
          const formData = new FormData()
          formData.append('audio', audioBlob, 'audio.webm')

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })

          const data = await response.json() as any

          if (!response.ok) {
            if (data.message?.includes('not configured')) {
              toast({
                title: 'Service Not Configured',
                description: 'For Firefox support, please use Chrome, Edge, or Safari. They have built-in speech recognition.',
                variant: 'default'
              })
            } else {
              toast({
                title: 'Transcription Error',
                description: data.error || 'Failed to transcribe audio',
                variant: 'destructive'
              })
            }
            return
          }

          if (data.transcript) {
            setResponse((prev) => {
              const updated = prev ? prev + ' ' + data.transcript : data.transcript
              return updated
            })
            toast({
              title: 'Success',
              description: `Transcribed: "${data.transcript}"`,
              variant: 'default'
            })
          } else {
            toast({
              title: 'No Speech Detected',
              description: 'Please try again and speak clearly.',
              variant: 'default'
            })
          }
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to send audio for transcription',
            variant: 'destructive'
          })
          console.error('Transcription error:', error)
        }
      }

      mediaRecorder.onerror = (event) => {
        setIsListening(false)
        stream.getTracks().forEach(track => track.stop())
        toast({
          title: 'Recording Error',
          description: 'Failed to record audio. Please check microphone permissions.',
          variant: 'destructive'
        })
      }

      // Record for up to 10 seconds, then auto-stop
      mediaRecorder.start()
      const timeoutId = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
        }
      }, 10000)

      // Store timeout ID for potential early stop
      ;(window as any).__mediaRecorderTimeout = timeoutId
      ;(window as any).__mediaRecorder = mediaRecorder
    } catch (error) {
      setIsListening(false)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')) {
        toast({
          title: 'Microphone Access Denied',
          description: 'Please allow microphone access in Firefox settings to use voice recording.',
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Error',
          description: `Failed to access microphone: ${errorMsg}`,
          variant: 'destructive'
        })
      }
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  if (!lead) {
    return (
      <main className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Lead not found</p>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cityId && router.push(`/portal/city/${cityId}`)}
            className="mb-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-foreground mb-2">
                {lead.data?.name || 'Lead Details'}
              </h1>
              <div className="flex gap-6 flex-wrap">
                {lead.niche_name && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Niche</p>
                    <p className="text-lg font-semibold text-foreground">{lead.niche_name}</p>
                  </div>
                )}
                {lead.city_name && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</p>
                    <p className="text-lg font-semibold text-foreground">{lead.city_name}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
              <div className="flex flex-col gap-2 items-end">
                <Badge className={`text-base px-4 py-2 font-semibold ${
                  lead.wasScheduled && lead.status === 'unassigned' ? 'bg-purple-100 text-purple-700' :
                  lead.status === 'unassigned' ? 'bg-emerald-100 text-emerald-700' :
                  lead.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                  lead.status === 'declined' ? 'bg-red-100 text-red-700' :
                  lead.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {lead.wasScheduled && lead.status === 'unassigned' 
                    ? 'LATER - UNASSIGNED' 
                    : lead.status.toUpperCase()
                  }
                </Badge>
                {lead.correction_status === 'pending' && (
                  <Badge className="bg-red-100 text-red-700 text-xs font-semibold">Wrong</Badge>
                )}
                {lead.correction_status === 'corrected' && (
                  <Badge className="bg-green-100 text-green-700 text-xs font-semibold">Corrected</Badge>
                )}
                {lead.status === 'scheduled' && lead.daysRemaining !== undefined && (
                  <p className="text-sm font-semibold text-yellow-600">
                    ⏰ {lead.daysRemaining} days remaining
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lead Details (2 columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Lead Information Card */}
            <Card className="overflow-hidden border-0 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 border-b py-4 flex items-center">
                <CardTitle className="text-xl">Lead Information</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {lead.data && Object.keys(lead.data).length > 0 ? (
                  <div className="space-y-8">
                    {Object.entries(lead.data)
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
                                  <div key={`${key}-${pKey}`} className="pb-4 border-b border-slate-200 last:border-b-0">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                                      {pKey.replace(/_/g, ' ')}
                                    </label>
                                    <div className="space-y-2">
                                      {valueLines.map((line, idx) => (
                                        <p key={idx} className="text-base text-foreground leading-relaxed">
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
                        <div key={key} className="pb-4 border-b border-slate-200 last:border-b-0">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                            {key.replace(/_/g, ' ')}
                          </label>
                          {stringValue.includes(';') ? (
                            <div className="space-y-2">
                              {stringValue.split(';').map((line, idx) => (
                                <p key={idx} className="text-base text-foreground leading-relaxed">
                                  {line.trim()}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-base text-foreground leading-relaxed">{stringValue}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No lead details available</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Action Panel (1 column) */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="overflow-hidden border-0 shadow-sm sticky top-6 z-10">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b py-4 flex items-center justify-center">
                <CardTitle className="text-lg">Take Action</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Button
                    onClick={() => setAction('approve')}
                    className={`w-full ${action === 'approve' ? 'bg-primary hover:bg-primary/90' : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'}`}
                  >
                    ✓ Approve
                  </Button>
                  <Button
                    onClick={() => setAction('decline')}
                    className={`w-full ${action === 'decline' ? 'bg-primary hover:bg-primary/90' : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'}`}
                  >
                    ✕ Decline
                  </Button>
                  <Button
                    onClick={() => setAction('later')}
                    className={`w-full ${action === 'later' ? 'bg-primary hover:bg-primary/90' : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'}`}
                  >
                    ⏰ Follow Up Later
                  </Button>
                </div>

                {action === 'later' && (
                  <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <label className="text-xs font-semibold text-muted-foreground block mb-2">Days to Follow Up</label>
                    <input
                      type="number"
                      min="1"
                      value={daysToLater}
                      onChange={(e) => setDaysToLater(e.target.value)}
                      className="w-full px-3 py-2 border border-primary/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}

                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-muted-foreground">Add Notes</label>
                    <button
                      onClick={startVoiceRecording}
                      className={`p-2 rounded-lg transition-colors ${
                        isListening
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={isListening ? 'Stop recording' : 'Start voice recording'}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>
                  {isListening && <p className="text-xs text-red-600 mb-2 animate-pulse">🎤 Listening...</p>}
                  <Textarea
                    placeholder="Add any notes or comments about this lead... (or use the microphone button)"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    className="text-sm resize-none"
                    rows={4}
                  />
                </div>

                <Button
                  onClick={handleAction}
                  disabled={!action || responding}
                  className="w-full mt-6 bg-primary hover:bg-primary/90 text-white font-semibold py-2"
                >
                  {responding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Submit Decision'
                  )}
                </Button>

                <Button
                  onClick={() => setCorrectionDialogOpen(true)}
                  variant="outline"
                  className="w-full mt-2"
                  disabled={responding || submittingCorrection}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Send for Correction
                </Button>

                {nextLeadId && (
                  <Button
                    onClick={() => router.push(`/portal/lead/${nextLeadId}`)}
                    variant="outline"
                    className="w-full mt-3"
                    disabled={responding}
                  >
                    ➜ Go to Next Lead
                  </Button>
                )}

                {/* Response History Section */}
                {responseHistory.length > 0 && (
                  <>
                    <div className="border-t border-slate-300 mt-6 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-foreground">Response History</p>
                        <Badge variant="outline" className="bg-slate-100">
                          {responseHistory.length} {responseHistory.length === 1 ? 'task' : 'tasks'}
                        </Badge>
                      </div>
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {responseHistory.map((response, index) => {
                          const actionDisplay = response.action === 'scheduled' || response.action === 'later' ? 'Scheduled' : response.action?.charAt(0).toUpperCase() + response.action?.slice(1)
                          const responseDate = new Date(response.actioned_at || response.created_at)
                          const formattedDate = responseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                          const formattedTime = responseDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                          const taskNumber = responseHistory.length - index  // Latest is #1
                          
                          return (
                            <div key={response.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                  <Badge 
                                    className={`text-xs font-semibold ${
                                      actionDisplay === 'Approve' ? 'bg-green-100 text-green-700' :
                                      actionDisplay === 'Decline' ? 'bg-red-100 text-red-700' :
                                      actionDisplay === 'Scheduled' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    #{taskNumber} {actionDisplay}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground">
                                    By: <span className="text-foreground">{response.employee_name}</span>
                                  </p>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                📅 {formattedDate} at {formattedTime}
                              </p>
                              {response.response_text && (
                                <div className="bg-white p-3 rounded border border-slate-200 mb-2">
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                                  <p className="text-xs text-foreground leading-relaxed">{response.response_text}</p>
                                </div>
                              )}
                              {(response.action === 'scheduled' || response.action === 'later') && response.scheduled_for && (
                                <div className="text-xs text-amber-600 font-semibold">
                                  ⏰ Follow-up: {new Date(response.scheduled_for).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Confirmation Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                Action Confirmed
              </DialogTitle>
              <DialogDescription>
                Review the action you just completed
              </DialogDescription>
            </DialogHeader>

            {confirmedAction && (
              <div className="space-y-4">
                {/* Action Display */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Action Taken</p>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-sm px-3 py-1 ${
                      confirmedAction.action === 'approve' ? 'bg-green-100 text-green-700' :
                      confirmedAction.action === 'decline' ? 'bg-red-100 text-red-700' :
                      confirmedAction.action === 'later' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {confirmedAction.action.charAt(0).toUpperCase() + confirmedAction.action.slice(1)}
                    </Badge>
                    {confirmedAction.days && (
                      <span className="text-sm text-muted-foreground">in {confirmedAction.days} days</span>
                    )}
                  </div>
                </div>

                {/* Notes Display */}
                {confirmedAction.notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{confirmedAction.notes}</p>
                    </div>
                  </div>
                )}

                {!confirmedAction.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground italic">No additional notes provided</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => setConfirmDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAction}
                className="bg-primary hover:bg-primary/90"
              >
                Continue
              </Button>
            </DialogFooter>
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
              <div>
                <label className="text-sm font-semibold text-foreground block mb-2">Lead: {lead?.data?.name}</label>
                <p className="text-xs text-muted-foreground">{lead?.niche_name} - {lead?.city_name}</p>
              </div>

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

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCorrectionDialogOpen(false)
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
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
