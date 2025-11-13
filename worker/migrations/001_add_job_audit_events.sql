-- Migration: Add job_audit_events table
-- Date: 2025-11-13
-- Description: Create job_audit_events table for tracking job lifecycle events

-- Check if table exists and create it if it doesn't
CREATE TABLE IF NOT EXISTS job_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'started', 'progress_25', 'progress_50', 'progress_75', 'completed', 'failed', 'cancelled'
  user_email TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  details TEXT, -- JSON object with event-specific data (processed_keys, error_count, percentage, error_message, etc.)
  FOREIGN KEY (job_id) REFERENCES bulk_jobs(job_id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_job_audit_events_job_id ON job_audit_events(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_job_audit_events_user ON job_audit_events(user_email, timestamp DESC);

