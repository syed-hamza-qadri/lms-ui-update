-- ============================================================================
-- FIX RLS POLICIES FOR ANON KEY (No auth.uid() context)
-- ============================================================================
-- The original policies assumed authenticated Supabase Auth users.
-- Since we're using custom authentication with HttpOnly cookies,
-- auth.uid() is NULL. We need to check users by their ID in the table.

-- IMPORTANT: Since we use anon key, we can't rely on auth.uid().
-- For now, we'll enable public access for assignment tables and rely on
-- application-level authorization checks. In production, implement
-- custom JWT tokens with user ID claims.

-- ============================================================================
-- Drop existing restrictive policies
-- ============================================================================
DROP POLICY IF EXISTS user_assignments_select ON user_assignments;
DROP POLICY IF EXISTS user_assignments_insert ON user_assignments;
DROP POLICY IF EXISTS user_assignments_update ON user_assignments;
DROP POLICY IF EXISTS user_assignments_delete ON user_assignments;

DROP POLICY IF EXISTS niche_assignments_select ON niche_assignments;
DROP POLICY IF EXISTS niche_assignments_insert ON niche_assignments;
DROP POLICY IF EXISTS niche_assignments_update ON niche_assignments;

DROP POLICY IF EXISTS city_assignments_select ON city_assignments;
DROP POLICY IF EXISTS city_assignments_insert ON city_assignments;
DROP POLICY IF EXISTS city_assignments_update ON city_assignments;

DROP POLICY IF EXISTS role_access_log_select ON role_access_log;
DROP POLICY IF EXISTS role_access_log_insert ON role_access_log;

-- ============================================================================
-- Create new permissive policies for assignment tables
-- ============================================================================
-- Note: With anon key (no auth.uid()), we allow all operations.
-- Authorization is enforced at the application layer.

-- user_assignments policies
CREATE POLICY user_assignments_select ON user_assignments FOR SELECT USING (true);
CREATE POLICY user_assignments_insert ON user_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY user_assignments_update ON user_assignments FOR UPDATE USING (true);
CREATE POLICY user_assignments_delete ON user_assignments FOR DELETE USING (true);

-- niche_assignments policies
CREATE POLICY niche_assignments_select ON niche_assignments FOR SELECT USING (true);
CREATE POLICY niche_assignments_insert ON niche_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY niche_assignments_update ON niche_assignments FOR UPDATE USING (true);
CREATE POLICY niche_assignments_delete ON niche_assignments FOR DELETE USING (true);

-- city_assignments policies
CREATE POLICY city_assignments_select ON city_assignments FOR SELECT USING (true);
CREATE POLICY city_assignments_insert ON city_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY city_assignments_update ON city_assignments FOR UPDATE USING (true);
CREATE POLICY city_assignments_delete ON city_assignments FOR DELETE USING (true);

-- role_access_log policies
CREATE POLICY role_access_log_select ON role_access_log FOR SELECT USING (true);
CREATE POLICY role_access_log_insert ON role_access_log FOR INSERT WITH CHECK (true);
