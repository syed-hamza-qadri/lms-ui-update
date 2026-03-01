-- Add follow_up_date column to leads table for scheduled follow-ups
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP WITH TIME ZONE;

-- Update the status check constraint to include 'scheduled'
ALTER TABLE leads 
DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('unassigned', 'approved', 'declined', 'scheduled'));

-- Create index for follow_up_date for efficient querying of scheduled leads
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date)
WHERE status = 'scheduled';
