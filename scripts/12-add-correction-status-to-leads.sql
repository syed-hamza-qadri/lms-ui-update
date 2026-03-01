-- ============================================================================
-- MIGRATION: Add Correction Status Tracking to Leads
-- Created: February 28, 2026
-- Purpose: Track leads in correction workflow with badges (Wrong/Corrected)
-- ============================================================================

-- ============================================================================
-- 1. Add columns to leads table for correction workflow tracking
-- ============================================================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS correction_status VARCHAR(50) DEFAULT NULL CHECK (correction_status IN ('pending', 'corrected', NULL));

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================================================
-- 2. Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_correction_status ON leads(correction_status);
CREATE INDEX IF NOT EXISTS idx_leads_corrected_at ON leads(corrected_at DESC);

-- Composite index for finding pending corrections
CREATE INDEX IF NOT EXISTS idx_leads_correction_pending ON leads(correction_status, created_at DESC) 
WHERE correction_status = 'pending';

-- Composite index for finding corrected leads
CREATE INDEX IF NOT EXISTS idx_leads_correction_corrected ON leads(correction_status, corrected_at DESC) 
WHERE correction_status = 'corrected';

-- ============================================================================
-- 3. Add updated_at column to lead_corrections table for tracking updates
-- ============================================================================
ALTER TABLE lead_corrections
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================================================
-- 4. Add comment explaining the column
-- ============================================================================
COMMENT ON COLUMN leads.correction_status IS 'Status in correction workflow: pending (sent for correction), corrected (correction completed), NULL (normal)';
COMMENT ON COLUMN leads.corrected_at IS 'Timestamp when correction was completed by lead generator';
COMMENT ON COLUMN lead_corrections.updated_at IS 'Timestamp when correction message was last updated by caller/manager';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
