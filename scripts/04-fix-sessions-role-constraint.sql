-- ============================================================================
-- MIGRATION: Fix Sessions Table Role Constraint
-- Created: January 24, 2026
-- Purpose: Update sessions table to support new roles (caller, lead_generator)
-- ============================================================================

-- Drop old sessions role constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_role_check;

-- Add new sessions role constraint with expanded roles
ALTER TABLE sessions 
ADD CONSTRAINT sessions_role_check 
CHECK (role IN ('admin', 'manager', 'employee', 'caller', 'lead_generator'));

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
