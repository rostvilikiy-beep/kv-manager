# Migration Instructions for job_audit_events Table

## Problem
The `job_audit_events` table is missing from the production D1 database, causing 500 errors when trying to view job event history.

## Solution
Run the migration to create the missing table.

## Steps to Apply Migration

### Option 1: Using Wrangler CLI (Recommended)

```bash
# Navigate to the project directory
cd C:\Users\chris\Desktop\kv-manager

# Apply the migration to production D1 database
wrangler d1 execute kv-manager-metadata --remote --file=worker/migrations/001_add_job_audit_events.sql
```

### Option 2: Using Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages > D1
3. Select your `kv-manager-metadata` database
4. Click on "Console" tab
5. Copy and paste the contents of `worker/migrations/001_add_job_audit_events.sql`
6. Click "Execute"

### Verification

After running the migration, verify the table was created:

```bash
# Check if table exists
wrangler d1 execute kv-manager-metadata --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='job_audit_events';"
```

Expected output should show the `job_audit_events` table.

### Test

After the migration is complete:
1. Visit https://kv.adamic.tech
2. Navigate to Job History
3. Click on any job card
4. The event timeline dialog should now open without errors

## What This Migration Does

- Creates the `job_audit_events` table if it doesn't exist
- Creates indexes for efficient querying by job_id and user_email
- Safe to run multiple times (uses `IF NOT EXISTS`)

## Background

The `job_audit_events` table was added to track lifecycle events (started, 25%, 50%, 75%, completed/failed/cancelled) for all bulk operations. This table should have been created during initial deployment but was missing from the production database.

