-- ============================================================================
-- MIGRATION: Add Roles and Assignment Management
-- Created: January 24, 2026
-- Purpose: Add caller, lead_generator, manager roles and assignment system
-- ============================================================================

-- 1. Create assignment tables (users table already has correct role constraint from script 01)

-- Create user_assignments table to track caller assignments
CREATE TABLE IF NOT EXISTS user_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(manager_id, caller_id)
);

-- Create niche_assignments table to track niche access per caller
CREATE TABLE IF NOT EXISTS niche_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  niche_id UUID NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(caller_id, niche_id)
);

-- Create city_assignments table to track city access per caller
CREATE TABLE IF NOT EXISTS city_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(caller_id, city_id)
);

-- Create role_access_log table for audit trail
CREATE TABLE IF NOT EXISTS role_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- user_assignments indexes
CREATE INDEX IF NOT EXISTS idx_user_assignments_manager_id ON user_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_caller_id ON user_assignments(caller_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_assigned_at ON user_assignments(assigned_at);

-- niche_assignments indexes
CREATE INDEX IF NOT EXISTS idx_niche_assignments_caller_id ON niche_assignments(caller_id);
CREATE INDEX IF NOT EXISTS idx_niche_assignments_niche_id ON niche_assignments(niche_id);
CREATE INDEX IF NOT EXISTS idx_niche_assignments_assigned_by ON niche_assignments(assigned_by);

-- city_assignments indexes
CREATE INDEX IF NOT EXISTS idx_city_assignments_caller_id ON city_assignments(caller_id);
CREATE INDEX IF NOT EXISTS idx_city_assignments_city_id ON city_assignments(city_id);
CREATE INDEX IF NOT EXISTS idx_city_assignments_assigned_by ON city_assignments(assigned_by);

-- role_access_log indexes
CREATE INDEX IF NOT EXISTS idx_role_access_log_user_id ON role_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_role_access_log_created_at ON role_access_log(created_at);

-- users table - role index
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE niche_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_access_log ENABLE ROW LEVEL SECURITY;

-- user_assignments: Admin can see all, managers can see their callers
CREATE POLICY user_assignments_select ON user_assignments
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin' 
    OR manager_id = auth.uid()
    OR caller_id = auth.uid()
  );

CREATE POLICY user_assignments_insert ON user_assignments
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR manager_id = auth.uid()
  );

CREATE POLICY user_assignments_update ON user_assignments
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR manager_id = auth.uid()
  );

CREATE POLICY user_assignments_delete ON user_assignments
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR manager_id = auth.uid()
  );

-- niche_assignments: Admin can see all, managers can see their callers', callers can see their own
CREATE POLICY niche_assignments_select ON niche_assignments
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR assigned_by = auth.uid()
    OR caller_id = auth.uid()
  );

CREATE POLICY niche_assignments_insert ON niche_assignments
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())::text IN ('admin', 'manager')
    OR assigned_by = auth.uid()
  );

CREATE POLICY niche_assignments_update ON niche_assignments
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR assigned_by = auth.uid()
  );

-- city_assignments: Same as niche_assignments
CREATE POLICY city_assignments_select ON city_assignments
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR assigned_by = auth.uid()
    OR caller_id = auth.uid()
  );

CREATE POLICY city_assignments_insert ON city_assignments
  FOR INSERT WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid())::text IN ('admin', 'manager')
    OR assigned_by = auth.uid()
  );

CREATE POLICY city_assignments_update ON city_assignments
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR assigned_by = auth.uid()
  );

-- role_access_log: Admin and self can view
CREATE POLICY role_access_log_select ON role_access_log
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid())::text = 'admin'
    OR user_id = auth.uid()
  );

CREATE POLICY role_access_log_insert ON role_access_log
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get all callers assigned to a manager
CREATE OR REPLACE FUNCTION get_manager_callers(manager_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  email VARCHAR,
  is_active BOOLEAN,
  assigned_at TIMESTAMP WITH TIME ZONE
) AS $$
SELECT u.id, u.name, u.email, u.is_active, ua.assigned_at
FROM users u
INNER JOIN user_assignments ua ON u.id = ua.caller_id
WHERE ua.manager_id = $1
AND u.role = 'caller'
ORDER BY u.name;
$$ LANGUAGE SQL;

-- Get all niches assigned to a caller
CREATE OR REPLACE FUNCTION get_caller_niches(caller_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE
) AS $$
SELECT n.id, n.name, n.description, na.assigned_at
FROM niches n
INNER JOIN niche_assignments na ON n.id = na.niche_id
WHERE na.caller_id = $1
ORDER BY n.name;
$$ LANGUAGE SQL;

-- Get all cities assigned to a caller
CREATE OR REPLACE FUNCTION get_caller_cities(caller_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  niche_id UUID,
  assigned_at TIMESTAMP WITH TIME ZONE
) AS $$
SELECT c.id, c.name, c.niche_id, ca.assigned_at
FROM cities c
INNER JOIN city_assignments ca ON c.id = ca.city_id
WHERE ca.caller_id = $1
ORDER BY c.name;
$$ LANGUAGE SQL;

-- Get leads assigned to a caller (through city assignment)
CREATE OR REPLACE FUNCTION get_caller_leads(caller_id UUID)
RETURNS TABLE (
  id UUID,
  niche_id UUID,
  city_id UUID,
  data JSONB,
  status VARCHAR,
  assigned_to UUID,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
SELECT l.id, l.niche_id, l.city_id, l.data, l.status, l.assigned_to, l.created_at
FROM leads l
INNER JOIN city_assignments ca ON l.city_id = ca.city_id
WHERE ca.caller_id = $1
ORDER BY l.created_at DESC;
$$ LANGUAGE SQL;

-- Log role access for audit
CREATE OR REPLACE FUNCTION log_role_access(
  p_user_id UUID,
  p_role VARCHAR,
  p_action VARCHAR,
  p_ip_address INET DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO role_access_log (user_id, role, action, ip_address)
  VALUES (p_user_id, p_role, p_action, p_ip_address);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_assignments IS 'Tracks which callers are assigned to which managers';
COMMENT ON TABLE niche_assignments IS 'Tracks which niches are accessible to which callers';
COMMENT ON TABLE city_assignments IS 'Tracks which cities are accessible to which callers';
COMMENT ON TABLE role_access_log IS 'Audit log for role-based access';

COMMENT ON FUNCTION get_manager_callers IS 'Get all callers assigned to a manager';
COMMENT ON FUNCTION get_caller_niches IS 'Get all niches accessible to a caller';
COMMENT ON FUNCTION get_caller_cities IS 'Get all cities accessible to a caller';
COMMENT ON FUNCTION get_caller_leads IS 'Get all leads accessible to a caller through city assignments';
COMMENT ON FUNCTION log_role_access IS 'Log access attempts for audit trail';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
