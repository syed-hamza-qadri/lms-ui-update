-- ============================================================================
-- MIGRATION: Add actioned_at timestamp tracking and fix action types
-- Created: February 2, 2026
-- Purpose: Track when leads are actioned (status changed) with timestamps
--          Update lead_responses action constraint to include all status types
-- ============================================================================

-- ============================================================================
-- 1. Add actioned_at column to leads table
-- ============================================================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMP WITH TIME ZONE;

-- Create index for actioned_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_leads_actioned_at ON leads(actioned_at DESC);

-- ============================================================================
-- 2. Add actioned_at column to lead_responses table
-- ============================================================================
ALTER TABLE lead_responses
ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMP WITH TIME ZONE;

-- Create index for actioned_at in lead_responses
CREATE INDEX IF NOT EXISTS idx_lead_responses_actioned_at ON lead_responses(actioned_at DESC);

-- ============================================================================
-- 3. Update the action CHECK constraint in lead_responses
-- ============================================================================
-- Drop old constraint
ALTER TABLE lead_responses DROP CONSTRAINT IF EXISTS lead_responses_action_check;

-- Add new constraint that includes all valid status types
ALTER TABLE lead_responses
ADD CONSTRAINT lead_responses_action_check 
CHECK (action IN ('approve', 'decline', 'later', 'response', 'scheduled', 'schedule', 'unassigned', 'approved', 'declined'));

-- ============================================================================
-- 4. Create function to update actioned_at when lead status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_lead_actioned_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update actioned_at if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.actioned_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function on lead updates
DROP TRIGGER IF EXISTS trigger_update_lead_actioned_at ON leads;
CREATE TRIGGER trigger_update_lead_actioned_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_actioned_at();

-- ============================================================================
-- 5. Create function to automatically set actioned_at on lead_responses insert/update
-- ============================================================================
CREATE OR REPLACE FUNCTION set_lead_response_actioned_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update actioned_at to NOW() when record is inserted or updated
  NEW.actioned_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for lead_responses on INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_set_lead_response_actioned_at ON lead_responses;
CREATE TRIGGER trigger_set_lead_response_actioned_at
  BEFORE INSERT OR UPDATE ON lead_responses
  FOR EACH ROW
  EXECUTE FUNCTION set_lead_response_actioned_at();

-- ============================================================================
-- 6. Update existing leads with actioned_at = created_at if null
-- ============================================================================
UPDATE leads 
SET actioned_at = created_at 
WHERE actioned_at IS NULL;

-- ============================================================================
-- 7. Update existing lead_responses with actioned_at = created_at if null
-- ============================================================================
UPDATE lead_responses
SET actioned_at = created_at
WHERE actioned_at IS NULL;

-- ============================================================================
-- 8. Comments for documentation
-- ============================================================================
COMMENT ON COLUMN leads.actioned_at IS 'Timestamp when lead status was last changed - automatically updated by trigger';
COMMENT ON COLUMN lead_responses.actioned_at IS 'Timestamp when the response/action was recorded - automatically set by trigger';
COMMENT ON FUNCTION update_lead_actioned_at IS 'Trigger function to automatically set actioned_at timestamp when lead status changes';
COMMENT ON FUNCTION set_lead_response_actioned_at IS 'Trigger function to automatically set actioned_at timestamp on lead_response insert';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
