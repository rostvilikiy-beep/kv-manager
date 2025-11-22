# Migration Guide

This guide helps you migrate your KV Manager database to work with the latest version.

## Do I Need to Migrate?

If you deployed KV Manager **before November 22, 2025**, you need to run the migration.

If you're installing KV Manager for the first time, **no migration is needed** - just use the main `schema.sql`.

## Quick Migration

Run the migration script:

```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/migrations/apply_all_migrations.sql
```

This script is **idempotent** and safe to run multiple times. If tables/columns already exist, the migration will handle it gracefully.

## What Gets Migrated?

The migration script (`apply_all_migrations.sql`) applies three migrations:

### Migration 001: Job Audit Events Table
Adds the `job_audit_events` table for tracking job lifecycle events (started, progress milestones, completed, etc.). This powers the Job History UI's event timeline feature.

**Details:**
- Creates table with `IF NOT EXISTS` (safe to re-run)
- Creates indexes for efficient querying by job_id and user_email

### Migration 002: Progress Tracking Columns
Adds `current_key` and `percentage` columns to the `bulk_jobs` table for real-time progress tracking.

**Details:**
- Adds columns if they don't exist
- Note: SQLite will error if columns already exist, but this is harmless (see Troubleshooting)

### Migration 003: Metadata Column for Batch Operations
Adds `metadata` column to the `bulk_jobs` table to support batch operations (e.g., batch R2 backup/restore) that need to store multiple namespace IDs.

**Details:**
- Adds the `metadata` TEXT column to store JSON data
- Required for batch namespace R2 backup and restore features

## Troubleshooting

### Error: "duplicate column name"
This is expected if you run migrations 002 or 003 twice. The columns already exist, and the error is harmless. The migration is complete.

### Error: "table job_audit_events already exists"
This won't happen because we use `CREATE TABLE IF NOT EXISTS`, but if you see it, the table already exists and the migration is complete.

### Verify Migration Success

Check that the tables and columns exist:

```bash
# Check job_audit_events table
wrangler d1 execute kv-manager-metadata --remote --command="SELECT COUNT(*) FROM job_audit_events"

# Check bulk_jobs columns (should include current_key, percentage, and metadata)
wrangler d1 execute kv-manager-metadata --remote --command="PRAGMA table_info(bulk_jobs)"
```

You should see `current_key`, `percentage`, and `metadata` in the bulk_jobs columns list.

### Windows File Handle Errors
If you encounter file handle errors on Windows when running migrations with `--file`, you can run individual migrations using `--command` instead:

```bash
wrangler d1 execute kv-manager-metadata --remote --command="ALTER TABLE bulk_jobs ADD COLUMN metadata TEXT;"
```

## Local Development

For local development databases, use the `--local` flag instead of `--remote`:

```bash
wrangler d1 execute kv-manager-metadata-dev --local --file=worker/migrations/apply_all_migrations.sql
```

## Docker Users

If you're running KV Manager in Docker with a mounted D1 database, you'll need to run the migration from outside the container using Wrangler, or restart the container after updating to ensure the schema is current.

## Need Help?

If you encounter any issues with the migration, please open an issue on GitHub with:
- The error message
- Your database binding name
- Whether you're running in production (--remote) or development (--local)

