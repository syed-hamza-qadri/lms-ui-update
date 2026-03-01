// lib/auth.ts - Role-based authorization utilities
// All functions accept a supabase client parameter to avoid creating multiple GoTrueClient instances.
// The caller must pass the singleton client obtained from useSupabaseClient().

import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'manager' | 'caller' | 'lead_generator'

/**
 * Check if user has specific role
 */
export async function hasRole(supabase: SupabaseClient, userId: string, role: UserRole): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) return false
  return data.role === role
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(supabase: SupabaseClient, userId: string, roles: UserRole[]): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) return false
  return roles.includes(data.role as UserRole)
}

/**
 * Get user's role
 */
export async function getUserRole(supabase: SupabaseClient, userId: string): Promise<UserRole | null> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data.role as UserRole
}

/**
 * Check if manager has access to caller
 */
export async function managerHasCallerAccess(
  supabase: SupabaseClient,
  managerId: string,
  callerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_assignments')
    .select('id')
    .eq('manager_id', managerId)
    .eq('caller_id', callerId)
    .single()

  if (error) return false
  return !!data
}

/**
 * Get all callers for a manager (with optimization)
 */
export async function getManagerCallers(supabase: SupabaseClient, managerId: string) {
  const { data, error } = await supabase
    .from('user_assignments')
    .select(`
      id,
      caller_id,
      users!inner (
        id,
        name,
        email,
        is_active,
        created_at
      )
    `)
    .eq('manager_id', managerId)
    .order('assigned_at', { ascending: false })

  if (error) return []
  
  return data.map(assignment => ({
    assignmentId: assignment.id,
    ...assignment.users
  }))
}

/**
 * Get all niches for a caller
 */
export async function getCallerNiches(supabase: SupabaseClient, callerId: string) {
  const { data, error } = await supabase
    .from('niche_assignments')
    .select(`
      id,
      niche_id,
      assigned_at,
      niches!inner (
        id,
        name,
        description
      )
    `)
    .eq('caller_id', callerId)
    .order('assigned_at', { ascending: false })

  if (error) return []
  
  return data.map(assignment => ({
    assignmentId: assignment.id,
    ...assignment.niches,
    assignedAt: assignment.assigned_at
  }))
}

/**
 * Get all cities for a caller
 */
export async function getCallerCities(supabase: SupabaseClient, callerId: string) {
  const { data, error } = await supabase
    .from('city_assignments')
    .select(`
      id,
      city_id,
      assigned_at,
      cities!inner (
        id,
        name,
        niche_id
      )
    `)
    .eq('caller_id', callerId)
    .order('assigned_at', { ascending: false })

  if (error) return []
  
  return data.map(assignment => ({
    assignmentId: assignment.id,
    ...assignment.cities,
    assignedAt: assignment.assigned_at
  }))
}

/**
 * Get all leads for a caller (with pagination)
 */
export async function getCallerLeads(supabase: SupabaseClient, callerId: string) {
  const { data, error } = await supabase
    .from('city_assignments')
    .select('city_id')
    .eq('caller_id', callerId)

  if (error || !data) return []

  const cityIds = data.map(ca => ca.city_id)
  
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .in('city_id', cityIds)
    .order('created_at', { ascending: false })
    .limit(100) // Pagination - limit to first 100

  if (leadsError || !leads) return []
  return leads.slice(0, 100)
}

/**
 * Assign caller to manager
 */
export async function assignCallerToManager(
  supabase: SupabaseClient,
  managerId: string,
  callerId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('user_assignments')
    .insert({
      manager_id: managerId,
      caller_id: callerId
    })
    .select()

  return !error
}

/**
 * Unassign caller from manager
 */
export async function unassignCallerFromManager(
  supabase: SupabaseClient,
  managerId: string,
  callerId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('user_assignments')
    .delete()
    .eq('manager_id', managerId)
    .eq('caller_id', callerId)

  return !error
}

/**
 * Assign niche to caller (fast - no authorization check needed, manager is already authenticated)
 */
export async function assignNicheToCaller(
  supabase: SupabaseClient,
  callerId: string,
  nicheId: string,
  assignedBy: string
): Promise<boolean> {
  const { error } = await supabase
    .from('niche_assignments')
    .insert({
      caller_id: callerId,
      niche_id: nicheId,
      assigned_by: assignedBy
    })

  return !error
}

/**
 * Unassign niche from caller
 */
export async function unassignNicheFromCaller(
  supabase: SupabaseClient,
  callerId: string,
  nicheId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('niche_assignments')
    .delete()
    .eq('caller_id', callerId)
    .eq('niche_id', nicheId)

  return !error
}

/**
 * Assign city to caller (fast - no authorization check needed, manager is already authenticated)
 */
export async function assignCityToCaller(
  supabase: SupabaseClient,
  callerId: string,
  cityId: string,
  assignedBy: string
): Promise<boolean> {
  const { error } = await supabase
    .from('city_assignments')
    .insert({
      caller_id: callerId,
      city_id: cityId,
      assigned_by: assignedBy
    })

  return !error
}

/**
 * Unassign city from caller
 */
export async function unassignCityFromCaller(
  supabase: SupabaseClient,
  callerId: string,
  cityId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('city_assignments')
    .delete()
    .eq('caller_id', callerId)
    .eq('city_id', cityId)

  return !error
}

/**
 * Check if a lead was previously scheduled (Later - Unassigned)
 * Returns true if there's a 'scheduled' action in lead_responses for this lead
 * This persists even after the scheduled date passes and status becomes 'unassigned'
 */
export async function wasLeadPreviouslyScheduled(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('lead_responses')
    .select('id')
    .eq('lead_id', leadId)
    .in('action', ['scheduled', 'later', 'schedule'])
    .limit(1)

  if (error) return false
  return !!data && data.length > 0
}

/**
 * Get the display status for a lead accounting for Later - Unassigned
 * Returns { status, wasScheduled } to help with UI rendering
 */
export async function getLeadDisplayStatus(supabase: SupabaseClient, leadId: string, currentStatus: string) {
  if (currentStatus === 'unassigned') {
    const wasScheduled = await wasLeadPreviouslyScheduled(supabase, leadId)
    return {
      status: currentStatus,
      wasScheduled,
      displayStatus: wasScheduled ? 'later-unassigned' : 'unassigned'
    }
  }
  
  return {
    status: currentStatus,
    wasScheduled: false,
    displayStatus: currentStatus
  }
}

/**
 * Send a lead for correction (from manager or caller to lead generator)
 * Creates a record in lead_corrections table and updates lead status
 */
export async function sendLeadForCorrection(
  supabase: SupabaseClient,
  leadId: string,
  requestedByUserId: string,
  requestedByUserName: string,
  requestedByRole: 'manager' | 'caller',
  reasonNotes?: string
): Promise<{ 
  success: boolean
  error?: string
  existingCorrection?: any
  isUpdate?: boolean
}> {
  try {
    // Check if there's already a pending correction for this lead
    const { data: existingCorrection, error: checkError } = await supabase
      .from('lead_corrections')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // If pending correction already exists, allow update instead of creating duplicate
    if (existingCorrection && !checkError) {
      // Update existing correction with new message
      const { error: updateError } = await supabase
        .from('lead_corrections')
        .update({
          reason_notes: reasonNotes || existingCorrection.reason_notes,
          requested_by: requestedByUserId,
          requested_by_name: requestedByUserName,
          requested_by_role: requestedByRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCorrection.id)

      if (updateError) {
        return { 
          success: false, 
          error: `Failed to update correction: ${updateError.message}` 
        }
      }

      return { 
        success: true, 
        existingCorrection: {
          ...existingCorrection,
          reason_notes: reasonNotes || existingCorrection.reason_notes
        },
        isUpdate: true
      }
    }

    // No existing pending correction, create new one
    const { error: correctionError, data } = await supabase
      .from('lead_corrections')
      .insert({
        lead_id: leadId,
        requested_by: requestedByUserId,
        requested_by_name: requestedByUserName,
        requested_by_role: requestedByRole,
        reason_notes: reasonNotes || '',
        status: 'pending'
      })
      .select()

    if (correctionError) {
      return { 
        success: false, 
        error: `Database error: ${correctionError.message}` 
      }
    }

    // Update lead to mark as pending correction
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        correction_status: 'pending'
      })
      .eq('id', leadId)

    if (leadError) {
      return {
        success: false,
        error: `Failed to update lead status: ${leadError.message}`
      }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { 
      success: false, 
      error: errorMessage 
    }
  }
}

/**
 * Get all pending corrections for leads created by a user (lead-generator)
 * Used to show corrections in lead-generator portal
 */
export async function getPendingCorrectionsForLeadGenerator(supabase: SupabaseClient, leadGeneratorId: string) {
  try {
    if (!leadGeneratorId) return []

    const { data, error } = await supabase
      .from('lead_corrections')
      .select(`
        id,
        lead_id,
        requested_by,
        requested_by_name,
        requested_by_role,
        reason_notes,
        status,
        created_at,
        completed_at
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) return []

    if (!data || data.length === 0) return []

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, created_by')
      .eq('created_by', leadGeneratorId)

    if (leadsError) return []

    if (!leads || leads.length === 0) return []

    const userLeadIds = new Set(leads.map(l => l.id))
    return data.filter(c => userLeadIds.has(c.lead_id))
  } catch {
    return []
  }
}

/**
 * Get a specific correction with its lead details
 */
export async function getCorrectionDetails(supabase: SupabaseClient, correctionId: string) {
  const { data, error } = await supabase
    .from('lead_corrections')
    .select(`
      *,
      leads!inner (
        id,
        data,
        niche_id,
        city_id,
        status,
        follow_up_date
      )
    `)
    .eq('id', correctionId)
    .single()

  if (error) return null
  return data
}

/**
 * Complete a correction (lead-generator confirmed changes)
 * Marks correction as completed and updates lead with corrected status
 */
export async function completeLeadCorrection(supabase: SupabaseClient, correctionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get correction details to know which lead to update
    const correction = await getCorrectionDetails(supabase, correctionId)
    if (!correction) {
      return { 
        success: false, 
        error: 'Correction not found' 
      }
    }

    const leadId = correction.lead_id
    const now = new Date().toISOString()

    // Update correction status to completed
    const { error: correctionError } = await supabase
      .from('lead_corrections')
      .update({
        status: 'completed',
        completed_at: now
      })
      .eq('id', correctionId)

    if (correctionError) {
      return { 
        success: false, 
        error: correctionError.message || 'Failed to update correction' 
      }
    }

    // Update lead: reset to unassigned with corrected status badge
    const { error: leadError } = await supabase
      .from('leads')
      .update({ 
        status: 'unassigned',
        correction_status: 'corrected',  // Mark as corrected (for badge display)
        corrected_at: now,               // Timestamp for tracking
        actioned_at: null                // Clear actioned_at so it's truly fresh
      })
      .eq('id', leadId)

    if (leadError) {
      return { 
        success: false, 
        error: leadError.message || 'Failed to update lead' 
      }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { 
      success: false, 
      error: errorMessage 
    }
  }
}

/**
 * Check if a lead has any pending corrections
 */
export async function hasPendingCorrection(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('lead_corrections')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .limit(1)

  if (error) return false
  return !!data && data.length > 0
}

/**
 * Get pending correction for a specific lead
 */
export async function getPendingCorrectionForLead(supabase: SupabaseClient, leadId: string) {
  const { data, error } = await supabase
    .from('lead_corrections')
    .select('*')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data
}

/**
 * Get correction status information for a lead
 * Returns badge type and message for UI display
 */
export async function getCorrectionStatusInfo(supabase: SupabaseClient, leadId: string): Promise<{
  hasCorrection: boolean
  status: 'pending' | 'corrected' | null
  badge: 'wrong' | 'corrected' | null
  message: string
  pendingCorrection?: any
}> {
  try {
    // Get lead correction status
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('correction_status, corrected_at')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return {
        hasCorrection: false,
        status: null,
        badge: null,
        message: 'No correction info'
      }
    }

    // If no correction status, return normal
    if (!lead.correction_status) {
      return {
        hasCorrection: false,
        status: null,
        badge: null,
        message: 'Normal lead'
      }
    }

    // If pending correction, get the correction details
    if (lead.correction_status === 'pending') {
      const pendingCorrection = await getPendingCorrectionForLead(supabase, leadId)
      return {
        hasCorrection: true,
        status: 'pending',
        badge: 'wrong',
        message: `Sent for correction: ${pendingCorrection?.reason_notes || 'No details provided'}`,
        pendingCorrection
      }
    }

    // If corrected
    if (lead.correction_status === 'corrected') {
      return {
        hasCorrection: true,
        status: 'corrected',
        badge: 'corrected',
        message: `Corrected on ${new Date(lead.corrected_at).toLocaleDateString()}`
      }
    }

    return {
      hasCorrection: false,
      status: null,
      badge: null,
      message: 'Unknown status'
    }
  } catch {
    return {
      hasCorrection: false,
      status: null,
      badge: null,
      message: 'Error checking status'
    }
  }
}

/**
 * Reset correction status for a lead (after caller has processed corrected lead)
 * Called when caller takes action on a corrected lead
 */
export async function resetCorrectionStatus(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('leads')
      .update({
        correction_status: null,
        corrected_at: null
      })
      .eq('id', leadId)

    return !error
  } catch {
    return false
  }
}

/**
 * Log role access for audit
 */
export async function logRoleAccess(
  userId: string,
  role: UserRole,
  action: string
): Promise<void> {
  await supabase
    .from('role_access_log')
    .insert({
      user_id: userId,
      role,
      action
    })
}
