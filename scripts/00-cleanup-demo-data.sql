-- ============================================================================
-- CLEANUP SCRIPT: Remove all demo data from Supabase
-- Created: February 5, 2026
-- Purpose: Clear all data while preserving database structure, triggers, and functions
-- WARNING: This will DELETE all data. Make sure you have backups!
-- ============================================================================

-- ============================================================================
-- Step 1: Disable foreign key constraints temporarily (if needed)
-- ============================================================================
-- Supabase PostgreSQL handles this automatically with CASCADE, but we'll be explicit

-- ============================================================================
-- Step 2: Delete data in correct order to respect foreign key constraints
-- ============================================================================

-- 2.1 Delete from activity_log (references users and leads)
DELETE FROM activity_log;

-- 2.2 Delete from lead_responses (references leads and users)
DELETE FROM lead_responses;

-- 2.3 Delete from sessions (references users)
DELETE FROM sessions;

-- 2.4 Delete from leads (references cities and users)
DELETE FROM leads;

-- 2.5 Delete from cities (references niches)
DELETE FROM cities;

-- 2.6 Delete from niches
DELETE FROM niches;

-- 2.7 Delete from users (root table)
DELETE FROM users;

-- ============================================================================
-- Step 3: Reset auto-increment sequences
-- ============================================================================
-- This ensures that new records will start from ID 1 again

ALTER SEQUENCE IF EXISTS niches_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS cities_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS lead_responses_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS activity_log_id_seq RESTART WITH 1;

-- ============================================================================
-- Step 4: Verify data is cleared (optional - for verification)
-- ============================================================================
-- Uncomment these lines to verify the cleanup was successful:
/*
SELECT 'niches' as table_name, COUNT(*) as row_count FROM niches
UNION ALL
SELECT 'cities', COUNT(*) FROM cities
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'leads', COUNT(*) FROM leads
UNION ALL
SELECT 'lead_responses', COUNT(*) FROM lead_responses
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'activity_log', COUNT(*) FROM activity_log;
*/

-- ============================================================================
-- CLEANUP COMPLETE
-- ============================================================================
-- All demo data has been removed.
-- Database structure, indexes, triggers, and functions remain intact.
-- You can now add new data as needed.
-- ============================================================================
