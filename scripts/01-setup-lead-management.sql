-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'caller', 'lead_generator')), -- admin, manager, caller, or lead_generator
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create niches table
CREATE TABLE niches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cities table
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  niche_id UUID NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, niche_id)
);

-- Create leads table with flexible JSON fields
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id UUID NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}', -- Flexible field for any lead data (name, phone, email, etc.)
  status TEXT DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'approved', 'declined', 'scheduled')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create lead responses table to track employee actions
CREATE TABLE lead_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approve', 'decline', 'later', 'response')), -- Type of action
  response_text TEXT, -- For general responses
  scheduled_for TIMESTAMP WITH TIME ZONE, -- When to follow up if "later"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create activity log to track all admin/employee actions
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- e.g., 'approve', 'decline', 'later', 'response'
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  description TEXT, -- Description of the action taken
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sessions table for authentication
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee', 'caller', 'lead_generator')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_cities_niche_id ON cities(niche_id);
CREATE INDEX idx_leads_niche_id ON leads(niche_id);
CREATE INDEX idx_leads_city_id ON leads(city_id);
CREATE INDEX idx_leads_created_by ON leads(created_by);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_lead_responses_lead_id ON lead_responses(lead_id);
CREATE INDEX idx_lead_responses_employee_id ON lead_responses(employee_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_lead_id ON activity_log(lead_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Enable RLS (Row Level Security) 
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE niches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies - Allow all access since we use custom authentication (not Supabase Auth)
-- These permissive policies allow the application to manage data access control
CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all access to niches" ON niches FOR ALL USING (true);
CREATE POLICY "Allow all access to cities" ON cities FOR ALL USING (true);
CREATE POLICY "Allow all access to leads" ON leads FOR ALL USING (true);
CREATE POLICY "Allow all access to lead_responses" ON lead_responses FOR ALL USING (true);
CREATE POLICY "Allow all access to activity_log" ON activity_log FOR ALL USING (true);
CREATE POLICY "Allow all access to sessions" ON sessions FOR ALL USING (true);

-- Insert sample data for testing
INSERT INTO niches (name, description) VALUES
  ('Real Estate', 'Real estate business leads'),
  ('Technology', 'Tech industry leads'),
  ('Finance', 'Financial services leads');

INSERT INTO cities (name, niche_id) VALUES
  ('New York', (SELECT id FROM niches WHERE name = 'Real Estate')),
  ('Los Angeles', (SELECT id FROM niches WHERE name = 'Real Estate')),
  ('San Francisco', (SELECT id FROM niches WHERE name = 'Technology')),
  ('New York', (SELECT id FROM niches WHERE name = 'Technology'));
