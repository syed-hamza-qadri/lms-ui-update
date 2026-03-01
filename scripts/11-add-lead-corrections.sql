-- ============================================================================
-- MIGRATION: Add Lead Corrections Workflow
-- Created: February 7, 2026
-- Purpose: Allow managers/callers to send leads back to lead-generator for
--          corrections with notes. Lead-generator can edit and resubmit.
-- ============================================================================

-- ============================================================================
-- 1. Create lead_corrections table to track correction requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_role VARCHAR(50) NOT NULL CHECK (requested_by_role IN ('manager', 'caller')),
  requested_by_name VARCHAR(255) NOT NULL,
  reason_notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lead_corrections_lead_id ON lead_corrections(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_corrections_requested_by ON lead_corrections(requested_by);
CREATE INDEX IF NOT EXISTS idx_lead_corrections_status ON lead_corrections(status);
CREATE INDEX IF NOT EXISTS idx_lead_corrections_created_at ON lead_corrections(created_at DESC);

-- Composite index for finding pending corrections for a specific lead generator's leads
CREATE INDEX IF NOT EXISTS idx_lead_corrections_pending ON lead_corrections(status, created_at DESC) 
WHERE status = 'pending';

-- ============================================================================
-- 3. Enable RLS on lead_corrections table
-- ============================================================================
ALTER TABLE lead_corrections ENABLE ROW LEVEL SECURITY;

-- Allow all access since we use custom authentication (not Supabase Auth)
CREATE POLICY "Allow all access to lead_corrections" ON lead_corrections FOR ALL USING (true);

-- ============================================================================
-- 4. Optional: Create trigger to auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_lead_corrections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lead_corrections_updated_at ON lead_corrections;
CREATE TRIGGER trigger_update_lead_corrections_updated_at
  BEFORE UPDATE ON lead_corrections
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_corrections_updated_at();

-- ============================================================================
-- NOTES
-- ============================================================================
-- This table supports the correction workflow:
--
-- 1. MANAGER/CALLER SENDS FOR CORRECTION:
--    - Insert record into lead_corrections with status='pending'
--    - Lead status stays as is (or can be temporarily marked if needed)
--    - Reason_notes contains what needs to be fixed
--
-- 2. LEAD-GENERATOR SEES CORRECTION:
--    - Query lead_corrections for their created leads with status='pending'
--    - Shows in "new leads" tab with "Correction" badge
--    - Can edit lead details
--
-- 3. LEAD-GENERATOR CONFIRMS:
--    - Update lead_corrections status='completed'
--    - Set completed_at=NOW()
--    - Reset lead status to 'unassigned'
--    - Lead is back in system for caller to process again
--
-- Audit Trail:
--    - requested_by: User who requested correction
--    - requested_by_role: Whether manager or caller requested
--    - requested_by_name: Name for display (denormalized for performance)
--    - reason_notes: What was wrong with the lead
--    - created_at: When correction was requested
--    - completed_at: When lead-generator completed the correction
