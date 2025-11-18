import type { Env, APIResponse, R2BackupListItem } from '../types';
import { getD1Binding } from '../utils/helpers';

export async function handleR2BackupRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/r2-backup/:namespaceId/list - List available backups
    const listMatch = url.pathname.match(/^\/api\/r2-backup\/([^/]+)\/list$/);
    if (listMatch && request.method === 'GET') {
      const namespaceId = listMatch[1];

      console.log('[R2Backup] Listing backups for namespace:', namespaceId);

      if (isLocalDev || !env.BACKUP_BUCKET) {
        // Return mock backups for local dev
        const response: APIResponse<R2BackupListItem[]> = {
          success: true,
          result: [
            {
              path: `backups/${namespaceId}/1234567890.json`,
              timestamp: Date.now() - 86400000,
              size: 1024,
              uploaded: new Date(Date.now() - 86400000).toISOString()
            },
            {
              path: `backups/${namespaceId}/1234567800.json`,
              timestamp: Date.now() - 172800000,
              size: 2048,
              uploaded: new Date(Date.now() - 172800000).toISOString()
            }
          ]
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // List backups from R2
      const prefix = `backups/${namespaceId}/`;
      const listed = await env.BACKUP_BUCKET.list({ prefix });

      const backups: R2BackupListItem[] = listed.objects.map(obj => {
        // Extract timestamp from filename (format: backups/ns-id/timestamp.json)
        const filename = obj.key.split('/').pop() || '';
        const timestamp = parseInt(filename.replace('.json', '').replace('.ndjson', '')) || 0;

        return {
          path: obj.key,
          timestamp,
          size: obj.size,
          uploaded: obj.uploaded.toISOString()
        };
      });

      // Sort by timestamp descending (newest first)
      backups.sort((a, b) => b.timestamp - a.timestamp);

      const response: APIResponse<R2BackupListItem[]> = {
        success: true,
        result: backups
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/r2-backup/:namespaceId - Start backup to R2
    const backupMatch = url.pathname.match(/^\/api\/r2-backup\/([^/]+)$/);
    if (backupMatch && request.method === 'POST') {
      const namespaceId = backupMatch[1];
      const format = url.searchParams.get('format') || 'json';

      console.log('[R2Backup] Starting backup for namespace:', namespaceId, 'format:', format);

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-backup-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: 'queued',
            ws_url: `/api/jobs/${jobId}/ws`
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create job ID for tracking
      const jobId = `r2-backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry in D1
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'r2_backup', 'queued', CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, userEmail).run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Fire and forget - start processing in DO
      const doRequest = new Request(`https://do/process/r2-backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          namespaceId,
          format: format as 'json' | 'ndjson',
          userEmail
        })
      });

      console.log('[R2Backup] Starting async processing in DO for job:', jobId);

      // Start processing - await to ensure the request is actually sent
      // @ts-expect-error - Request types are compatible at runtime
      const doResponse = await stub.fetch(doRequest);
      console.log('[R2Backup] DO processing initiated, response status:', doResponse.status);

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'queued',
          ws_url: `/api/jobs/${jobId}/ws`
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/r2-restore/:namespaceId - Start restore from R2
    const restoreMatch = url.pathname.match(/^\/api\/r2-restore\/([^/]+)$/);
    if (restoreMatch && request.method === 'POST') {
      const namespaceId = restoreMatch[1];
      const body = await request.json() as { backupPath: string };
      const backupPath = body.backupPath;

      console.log('[R2Restore] Starting restore for namespace:', namespaceId, 'from:', backupPath);

      if (isLocalDev || !env.BACKUP_BUCKET) {
        const jobId = `r2-restore-${Date.now()}`;
        const response: APIResponse = {
          success: true,
          result: {
            job_id: jobId,
            status: 'queued',
            ws_url: `/api/jobs/${jobId}/ws`
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Verify backup exists
      const backupObject = await env.BACKUP_BUCKET.head(backupPath);
      if (!backupObject) {
        return new Response(JSON.stringify({ 
          success: false,
          error: 'Backup not found' 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create job ID
      const jobId = `r2-restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create job entry
      if (db) {
        await db.prepare(`
          INSERT INTO bulk_jobs (job_id, namespace_id, operation_type, status, started_at, user_email)
          VALUES (?, ?, 'r2_restore', 'queued', CURRENT_TIMESTAMP, ?)
        `).bind(jobId, namespaceId, userEmail).run();
      }

      // Get Durable Object stub and start async processing
      const id = env.IMPORT_EXPORT_DO.idFromName(jobId);
      const stub = env.IMPORT_EXPORT_DO.get(id);

      // Start processing in DO
      const doRequest = new Request(`https://do/process/r2-restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          namespaceId,
          backupPath,
          userEmail
        })
      });

      console.log('[R2Restore] Starting async processing in DO for job:', jobId);

      // Await to ensure the request is actually sent
      // @ts-expect-error - Request types are compatible at runtime
      const doResponse = await stub.fetch(doRequest);
      console.log('[R2Restore] DO processing initiated, response status:', doResponse.status);

      // Return immediately with job info
      const response: APIResponse = {
        success: true,
        result: {
          job_id: jobId,
          status: 'queued',
          ws_url: `/api/jobs/${jobId}/ws`
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    console.error('[R2Backup] Error:', error);
    // Log detailed error information but don't expose to users
    if (error instanceof Error) {
      console.error('[R2Backup] Error message:', error.message);
      console.error('[R2Backup] Error stack:', error.stack);
    }
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

