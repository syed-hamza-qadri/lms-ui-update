-- ============================================================================
-- MIGRATION: Fix actioned_at trigger to handle both INSERT and UPDATE
-- Created: February 2, 2026
-- Purpose: Update the lead_responses trigger to fire on both INSERT and UPDATE
--          so that actioned_at timestamp is updated when responses are modified
-- ============================================================================

-- ============================================================================
-- 1. Update function to always set actioned_at on insert/update
-- ============================================================================
CREATE OR REPLACE FUNCTION set_lead_response_actioned_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update actioned_at to NOW() when record is inserted or updated
  NEW.actioned_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Drop and recreate trigger to handle both INSERT and UPDATE
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_set_lead_response_actioned_at ON lead_responses;
CREATE TRIGGER trigger_set_lead_response_actioned_at
  BEFORE INSERT OR UPDATE ON lead_responses
  FOR EACH ROW
  EXECUTE FUNCTION set_lead_response_actioned_at();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
