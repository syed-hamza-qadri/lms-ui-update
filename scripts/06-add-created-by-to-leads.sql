-- ============================================================================
-- MIGRATION: Add created_by column to leads table
-- Created: January 24, 2026
-- Purpose: Track which user (lead_generator) created each lead
-- ============================================================================

-- Add created_by column to leads table (if it doesn't exist)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add index on created_by for performance
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);

-- Add index for filtering leads by creator
CREATE INDEX IF NOT EXISTS idx_leads_creator_status ON leads(created_by, status);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
