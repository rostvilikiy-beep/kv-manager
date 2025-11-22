# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **WebSocket Support**: Removed unused WebSocket infrastructure
  - Removed WebSocket upgrade endpoint from worker
  - Removed WebSocket handler methods from Durable Objects (BulkOperationDO, ImportExportDO)
  - Removed WebSocket session tracking and broadcasting
  - Converted `broadcastProgress()` to no-op methods to preserve compatibility
  - Updated comments to reflect HTTP polling architecture
  - Rationale: Frontend exclusively uses HTTP polling; WebSocket code was dead weight adding complexity

- **Job Cancellation Feature**: Removed non-functional job cancellation capability
  - Removed cancel button from bulk progress dialog
  - Removed `cancelJob` function from progress tracking hook
  - Removed cancellation logic from Durable Objects (BulkOperationDO, ImportExportDO)
  - Removed `'cancelled'` status from TypeScript type definitions
  - Removed cancelled status UI indicators from job history
  - Note: Database schema retains `'cancelled'` status for backward compatibility with existing historical records
  - Rationale: Feature never worked after migration to HTTP polling, and jobs complete too quickly to make cancellation practical

### Added
- **Batch R2 Backup & Restore**: Multi-namespace backup and restore operations to/from R2
  - **Batch Backup Selected to R2**: Back up multiple selected namespaces to R2 in a single operation
  - **Batch Restore Selected from R2**: Restore multiple namespaces from R2 backups simultaneously
  - New batch action toolbar buttons when namespaces are selected
  - Format selection (JSON/NDJSON) for batch backups
  - Per-namespace backup selection in batch restore dialog
  - Progress tracking for batch operations with namespace count
  - Individual audit log entries for each namespace in batch
  - Job history integration with `batch_r2_backup` and `batch_r2_restore` operation types
  - Two new API endpoints:
    - `POST /api/r2-backup/batch` - Start batch backup of multiple namespaces
    - `POST /api/r2-restore/batch` - Start batch restore of multiple namespaces
  - Batch processing with progress updates and error handling per namespace
  - Metadata column added to `bulk_jobs` table for storing batch operation details

- **R2 Backup & Restore**: Complete R2 integration for namespace backups
  - **Backup to R2**: Create full snapshots of namespaces directly to R2 storage
  - **Restore from R2**: Select and restore from available R2 backups via UI
  - **List Backups**: View all available backups with timestamps and file sizes
  - Organized storage structure: `backups/{namespaceId}/{timestamp}.json`
  - Support for both JSON and NDJSON backup formats
  - Progress tracking identical to Import/Export operations (HTTP polling)
  - Job history integration with R2 backup/restore operation types
  - Optional R2 bucket binding (app works without R2 configured)
  - Mock data support in local development mode
  - Three new API endpoints:
    - `GET /api/r2-backup/:namespaceId/list` - List available backups
    - `POST /api/r2-backup/:namespaceId` - Start async backup to R2
    - `POST /api/r2-restore/:namespaceId` - Start async restore from R2
  - New wrangler.toml R2 bucket binding: `BACKUP_BUCKET`
  - UI buttons added to namespace cards for easy access
  - Backup/Restore dialogs with format selection and backup list
  - Audit logging for both r2_backup and r2_restore operations
  - Complete documentation in README with setup instructions

- **Import/Export Metadata Support**: Enhanced import functionality with dual metadata system support
  - Import now supports both `metadata` (KV native) and `custom_metadata` (D1) fields
  - `metadata` field stores data in Cloudflare KV (1024 byte limit, retrieved with key)
  - `custom_metadata` field stores data in D1 database (unlimited size, searchable)
  - `tags` field stores tags in D1 for organization and search
  - Support for both `ttl` and `expiration_ttl` field names in imports
  - Bulk write API implementation for proper KV native metadata storage
  - Comprehensive import format documentation with field descriptions

### Changed
- **Progress Tracking Simplified**: Removed WebSocket connections in favor of HTTP polling for increased reliability
  - Polling-only approach with 1-second intervals until job completion
  - Eliminates WebSocket connection failures, rate limiting, and complexity
  - Reduced progress hook from 320 lines to 150 lines (~47% reduction)
  - Export files download automatically when ready via polling detection
  - API still returns `ws_url` for compatibility, but it's not used
  - Note: WebSocket infrastructure remains in Durable Objects but is not utilized by frontend

- **Import Processing**: Switched from individual PUT requests to bulk write API
  - Improves import performance with batched writes (100 keys per batch)
  - Properly handles KV native metadata via bulk write API
  - Separates KV native metadata from D1 custom metadata storage
  - D1 entries always created for imported keys (enables search indexing)

### Fixed
- **Import Metadata Handling**: Fixed incorrect metadata field mapping during imports
  - `metadata` field now correctly stored in KV native metadata (not D1)
  - `custom_metadata` field correctly stored in D1 database
  - Previous bug caused `metadata` to be duplicated into D1 custom metadata
  - Import now properly distinguishes between the two metadata systems

- **TTL Validation**: Added minimum TTL validation to prevent API errors
  - Cloudflare KV requires minimum 60 seconds for TTL
  - Added validation in both Create Key and Edit Key dialogs
  - Clear error message: "TTL must be at least 60 seconds (Cloudflare KV minimum)"
  - HTML5 `min="60"` attribute added to TTL input fields
  - Updated placeholder text and help text to indicate minimum value

- **Edit Key Dialog**: Fixed Save Changes button not enabling when only metadata/TTL changed
  - Button now tracks changes to value, metadata, and TTL separately
  - Changing only KV Native Metadata now enables Save Changes button
  - Changing only TTL now enables Save Changes button
  - Added state tracking for original metadata and TTL values

- **Accessibility**: Removed empty label warnings in Job History UI
  - Removed unconnected `<Label>` elements from Select components
  - Added `aria-label` attributes to all SelectTrigger components
  - Replaced spacing hack (`<Label>&nbsp;</Label>`) with proper flex layout
  
- **Database Schema**: Added missing columns to production databases
  - Created migrations for `job_audit_events` table
  - Created migrations for `current_key` and `percentage` columns in `bulk_jobs`
  - Created migration for `metadata` column in `bulk_jobs` (required for batch operations)
  - All migrations are idempotent and safe to run multiple times
  - Migration guide provided at [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

### Technical Improvements
- **TypeScript Types**: Updated `ImportParams` interface to support dual metadata system
  - Clarified `metadata` field for KV native metadata
  - Added `custom_metadata` field for D1 database storage
  - Added `expiration` field for Unix timestamp expiration
  - Comprehensive inline documentation for each field

### Added
- **Migration Infrastructure**: Comprehensive migration system for database updates
  - Single migration file: `apply_all_migrations.sql` for one-step updates
  - Idempotent migrations safe to run multiple times
  - Detailed migration guide with troubleshooting and verification steps
  - Instructions for both production (`--remote`) and development (`--local`) databases

- **Advanced Job History Filters**: Comprehensive filtering and sorting system for job history
  - **Namespace Filter**: Filter jobs by specific namespace from dropdown
  - **Date Range Filter**: Select preset ranges (Last 24h, Last 7 days, Last 30 days) or custom date range with calendar picker
  - **Job ID Search**: Debounced text search with partial matching (500ms delay)
  - **Error Threshold Filter**: Filter jobs by minimum error count
  - **Multi-Column Sorting**: Sort by Started At, Completed At, Total Keys, Error Count, or Progress Percentage
  - **Sort Order Toggle**: Switch between ascending/descending with visual arrow indicators
  - **Clear All Filters**: Single button to reset all filters to defaults
  - **Combinable Filters**: All filters work simultaneously for precise job discovery
  - **Enhanced UI Layout**: Responsive 3-column grid with 9 filter controls organized in 3 rows
  - New UI components: Popover and Calendar (react-day-picker with date-fns)
  - Real-time filter updates with automatic data reload
  
- **Enhanced Job History API**:
  - Extended `GET /api/jobs` endpoint with 7 new query parameters:
    - `namespace_id` - Filter by specific namespace
    - `start_date`, `end_date` - Filter by date range (ISO timestamps)
    - `job_id` - Search by job ID (partial match with SQL LIKE)
    - `min_errors` - Filter jobs with error_count >= threshold
    - `sort_by` - Column to sort by (started_at, completed_at, total_keys, error_count, percentage)
    - `sort_order` - Sort direction (asc or desc, default: desc)
  - SQL injection prevention: Sort column validation with whitelist
  - Enhanced mock data with varied namespaces and timestamps for testing
  - Backward compatible with existing filter parameters (status, operation_type)

- **Job History UI**: Comprehensive user interface for viewing job event timelines and operation history
  - New "Job History" navigation tab displaying all user's bulk operations
  - Job list view with filtering by status (completed, failed, cancelled, running, queued) and operation type
  - Pagination support with "Load More" functionality for large job histories
  - Job cards showing operation type, namespace, status, timestamps, and progress summary
  - Click any job card to view detailed event timeline in modal dialog
  - Event timeline visualization with color-coded status indicators and milestone markers
  - "View History" button in BulkProgressDialog appears after job completion
  - Visual timeline showing: started → progress_25 → progress_50 → progress_75 → completed/failed/cancelled
  - Detailed event metadata display including processed counts, error counts, and percentages
  - Relative and absolute timestamp formatting (e.g., "2h ago" with hover for full date/time)
  - User authorization: users can only view their own job history
  - Empty state handling and error messaging
  - Dual access: view history from both progress dialog and dedicated history page

- **New API Endpoints for Job History**:
  - `GET /api/jobs` - Retrieve paginated list of user's jobs with filtering support
    - Query params: `limit`, `offset`, `status`, `operation_type`
    - Returns job metadata, timestamps, progress stats, and status
    - Ordered by `started_at DESC` (newest first)
  - Enhanced `GET /api/jobs/:jobId/events` endpoint now integrated with UI components

- **Operation Cancellation Support**: Users can now cancel in-progress bulk operations
  - Cancel button appears in progress dialog during `queued` or `running` operations
  - WebSocket-based cancellation via `{ type: "cancel", jobId }` message protocol
  - Graceful cancellation: operations complete current batch/item before stopping
  - Job status updates to `cancelled` in D1 database
  - Cancellation events logged to `job_audit_events` table with partial progress
  - Visual feedback: orange status indicator, cancelled summary with processed counts
  - Cancel button disabled when WebSocket is not connected (polling fallback limitation)
  - Cancelled jobs auto-close progress dialog after 5 seconds

- **Job Audit Event Logging**: Comprehensive lifecycle event tracking for all bulk operations and import/export jobs
  - New `job_audit_events` D1 table stores milestone events: `started`, `progress_25`, `progress_50`, `progress_75`, `completed`, `failed`, `cancelled`
  - Events include detailed JSON metadata: processed counts, error counts, percentages, and operation-specific data
  - User-based access control: users can only view events for their own jobs
  - Foundation for job history viewing and event replay functionality
  - New API endpoint: `GET /api/jobs/:jobId/events` - Returns chronological event history for a specific job

- **WebSocket-based Real-time Progress Tracking**: All bulk operations now use WebSocket connections for live progress updates
  - Async processing via Cloudflare Durable Objects for bulk delete, copy, TTL update, and tag operations
  - Real-time progress updates showing current key being processed, processed count, error count, and completion percentage
  - WebSocket connections managed by Durable Objects using the Hibernation API for cost efficiency
  - Automatic fallback to HTTP polling if WebSocket connection fails or is not supported
  - Exponential backoff reconnection strategy for dropped WebSocket connections
  - Progress dialog component (`BulkProgressDialog`) showing detailed operation status
  - Custom React hook (`useBulkJobProgress`) for managing WebSocket/polling lifecycle

- **Enhanced Import/Export Operations**:
  - Import and export operations now run asynchronously with real-time progress tracking
  - Export files are temporarily stored in Durable Object storage and served via dedicated download endpoint
  - Automatic download trigger when export job completes
  - Live progress updates during large import/export operations

- **New API Endpoints**:
  - `GET /api/jobs/:jobId/ws` - WebSocket endpoint for real-time job progress updates
  - `GET /api/jobs/:jobId/download` - Download endpoint for completed export files
  - `GET /api/jobs/:jobId/events` - Retrieve audit event history for a specific job (user-authorized)

- **Database Schema Enhancements**:
  - Added `current_key` column to `bulk_jobs` table to track the key currently being processed
  - Added `percentage` column to `bulk_jobs` table to store completion percentage (0-100)
  - Added `job_audit_events` table with foreign key to `bulk_jobs` for lifecycle event tracking
  - Indexed by `job_id` and `user_email` for efficient querying
  - Schema already supports `cancelled` status in `bulk_jobs.status` and `job_audit_events.event_type`

### Changed
- **Navigation Structure**:
  - Added "Job History" as a primary navigation tab alongside Namespaces, Search, and Audit Log
  - Reordered navigation to place Job History before Audit Log for better user flow
  
- **Bulk Operations Architecture**:
  - Refactored all bulk operations (delete, copy, TTL, tag) to be asynchronous
  - Operations now return immediately with `job_id`, `status`, and `ws_url` instead of waiting for completion
  - Progress tracking moved from simple status checks to detailed WebSocket-based updates
  - Bulk operations now show detailed progress: X of Y keys processed, current key name, percentage
  
- **Import/Export Flow**:
  - Export operations no longer block the HTTP request
  - Import operations process files asynchronously in the background
  - Export results are served from Durable Object storage instead of inline response

- **Frontend User Experience**:
  - Progress dialog now shows real-time updates instead of static loading spinner
  - Users can see which key is currently being processed
  - Connection status indicator shows whether using WebSocket or polling fallback
  - Auto-close progress dialog on successful completion after brief delay
  - Cancel button with loading state during cancellation
  - Visual distinction for cancelled operations (orange indicator, dedicated summary section)
  - Post-completion "View History" button for immediate access to job event timeline
  - Persistent job history accessible from dedicated navigation tab

### Technical Improvements
- **New Frontend Components**:
  - `JobHistory.tsx` - Full-page job list view with filtering and pagination
  - `JobHistoryDialog.tsx` - Modal component for detailed event timeline visualization
  - Enhanced `BulkProgressDialog.tsx` with "View History" button integration
- **New API Methods**:
  - `api.getJobList(options)` - Fetch paginated job list with filters (status, operation_type)
  - `api.getJobEvents(jobId)` - Retrieve event timeline for specific job
- **TypeScript Type Definitions**:
  - `JobEvent` - Individual event structure with type-safe event_type enum
  - `JobEventDetails` - Parsed JSON metadata for event details
  - `JobEventsResponse` - API response structure for events endpoint
  - `JobListItem` - Job metadata including progress and timestamps
  - `JobListResponse` - Paginated job list response with total count
- Implemented two Durable Object classes:
  - `BulkOperationDO` - Handles bulk delete, copy, TTL, and tag operations with milestone event logging and cancellation support
  - `ImportExportDO` - Handles import and export operations with file storage, milestone event logging, and cancellation support
- Added `logJobEvent()` helper function in `worker/utils/helpers.ts` for consistent event logging
- Added `JobAuditEvent` TypeScript interface for type-safe event handling
- All 6 operation methods (bulk copy, delete, TTL, tag, import, export) now log milestone events automatically
- Events stored indefinitely in D1 for complete job history tracking
- Added proper TypeScript type definitions for all WebSocket messages and job parameters
- Implemented graceful error handling and recovery for WebSocket connections
- Added comprehensive logging for debugging WebSocket connections and job processing
- Fixed all ESLint and TypeScript linting errors related to React hooks and Workers types
- Cancellation logic integrated into all 6 operation processing methods (copy, delete, TTL, tag, import, export)
- Added `cancelledJobs: Set<string>` to track cancellation requests in Durable Objects
- `cancelJob()` function in `useBulkJobProgress` hook sends cancellation messages via WebSocket
- `handleCancellation()` helper method in both Durable Objects for consistent cancellation handling
- TypeScript types updated: `JobProgress.status` now includes `'cancelled'` in all type definitions
- Cancel button component in `BulkProgressDialog` with appropriate disabled states and visual feedback

### Fixed
- **Bulk Operations Job Completion**: Fixed bulk operations never completing due to Durable Object not being invoked
  - Changed fire-and-forget pattern to `await stub.fetch(doRequest)` in all bulk operation routes
  - Affects bulk delete, bulk copy, bulk TTL, and bulk tag operations
  - Jobs now properly transition from "queued" to "running" to "completed"/"failed"
  - Added logging for Durable Object invocation status

- **CRITICAL**: HTTP polling rate limit errors causing 429 responses
  - Implemented exponential backoff for polling intervals on 429 errors
  - Increased base polling interval from 1s to 2s
  - Dynamic interval adjustment: increases by 3s on rate limit (up to 10s max)
  - Interval resets to 2s on successful polls
  - Rate limit errors handled silently (no user-facing error messages)
  - Fixed React hooks dependency loop causing multiple polling instances
  - Used `useRef` for callbacks to prevent unnecessary effect re-runs
  - Added guard to prevent multiple interval timers from being created

- **CRITICAL**: WebSocket connection loop causing 429 rate limit errors
  - Added parameter validation in `useBulkJobProgress` hook to prevent connection attempts with empty jobId or wsUrl
  - Added conditional guard in `BulkProgressDialog` to only invoke hook when dialog is open and has valid parameters
  - Prevents infinite reconnection loops and API request floods
- **SECURITY**: Log injection vulnerability in WebSocket message handling
  - Modified logging to only output safe, non-user-controlled fields (status, percentage, processed count, total count)
  - Removed logging of potentially malicious user-controlled strings like key names, error messages, and close reasons
  - Prevents malicious log forging via WebSocket messages
  - Uses defensive logging approach: only log known-safe data types (numbers, enums)
- React hooks immutability issues in `useBulkJobProgress` hook
- Circular dependency in WebSocket connection callback
- TypeScript type compatibility issues between DOM and Cloudflare Workers WebSocket types
- Proper cleanup of WebSocket connections and polling intervals on component unmount

## [1.0.0] - 2025-11-05

### Added
- Initial release of Cloudflare KV Manager
- Full namespace management (create, delete, rename, browse)
- Complete key operations with CRUD functionality
- Cursor-based pagination for key listings
- TTL (expiration) management for keys
- D1-backed metadata and unlimited tagging system
- Cross-namespace search with tag filtering
- Bulk operations (delete, copy, TTL update, tag)
- Import/Export in JSON and NDJSON formats
- Single-version backup and restore
- Comprehensive audit logging with CSV export
- Cloudflare Access (Zero Trust) authentication
- Dark/Light/System theme support
- Responsive design for desktop and mobile
- Docker deployment support
- Kubernetes deployment examples
- Reverse proxy configurations (Nginx, Traefik, Caddy)

### Technical
- React 19.2.0 + TypeScript 5.9.3 frontend
- Vite 7.1.12 build system
- Tailwind CSS 3.4.18 + shadcn/ui components
- Cloudflare Workers backend
- Cloudflare KV for key-value storage
- Cloudflare D1 for metadata and audit logs
- Cloudflare Durable Objects for orchestration
- JWT validation for all API requests
- CORS configuration for local development

---

## Links

- [GitHub Repository](https://github.com/neverinfamous/kv-manager)
- [Docker Hub](https://hub.docker.com/r/writenotenow/kv-manager)
- [Live Demo](https://kv.adamic.tech/)
- [Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)

