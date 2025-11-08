import type { DurableObjectState } from '@cloudflare/workers-types';
import type { 
  Env, 
  JobProgress, 
  BulkCopyParams, 
  BulkTTLParams, 
  BulkTagParams, 
  BulkDeleteParams 
} from '../types';
import { createCfApiRequest, getD1Binding, auditLog } from '../utils/helpers';

interface SessionAttachment {
  sessionId: string;
}

/**
 * Durable Object for orchestrating bulk KV operations with WebSocket progress updates
 * Uses Hibernation API to minimize duration charges
 */
export class BulkOperationDO {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, SessionAttachment>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  /**
   * Handle incoming requests (WebSocket upgrades and job initiation)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Job processing endpoints
    if (url.pathname.startsWith('/process/')) {
      const jobType = url.pathname.split('/')[2];
      
      try {
        const body = await request.json() as Record<string, unknown>;
        
        switch (jobType) {
          case 'bulk-copy':
            await this.processBulkCopy(body as unknown as BulkCopyParams & { jobId: string });
            break;
          case 'bulk-ttl':
            await this.processBulkTTL(body as unknown as BulkTTLParams & { jobId: string });
            break;
          case 'bulk-tag':
            await this.processBulkTag(body as unknown as BulkTagParams & { jobId: string });
            break;
          case 'bulk-delete':
            await this.processBulkDelete(body as unknown as BulkDeleteParams & { jobId: string });
            break;
          default:
            return new Response(JSON.stringify({ error: 'Unknown job type' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[BulkOperationDO] Processing error:', error);
        return new Response(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle WebSocket upgrade
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleWebSocketUpgrade(_request: Request): Response {
    // @ts-expect-error - WebSocketPair is available in Workers runtime
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Use Hibernation API - allows DO to hibernate without disconnecting clients
    // @ts-expect-error - WebSocket types differ between DOM and Workers runtime but are compatible
    this.state.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    // @ts-expect-error - WebSocket types differ between DOM and Workers runtime but are compatible
    this.sessions.set(server, { sessionId });

    console.log('[BulkOperationDO] WebSocket connected:', sessionId);

    return new Response(null, {
      status: 101,
      // @ts-expect-error - webSocket property is available in Workers runtime
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages (Hibernation API)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    try {
      const data = typeof message === 'string' ? message : new TextDecoder().decode(message);
      console.log('[BulkOperationDO] Received message:', data);
      
      // Clients can send ping messages to keep connection alive
      const parsed = JSON.parse(data);
      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('[BulkOperationDO] Message error:', error);
    }
  }

  /**
   * Handle WebSocket close (Hibernation API)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): Promise<void> {
    const session = this.sessions.get(ws);
    if (session) {
      console.log('[BulkOperationDO] WebSocket closed:', session.sessionId, code, reason);
      this.sessions.delete(ws);
    }
    ws.close(code, 'Durable Object is closing WebSocket');
  }

  /**
   * Handle WebSocket errors (Hibernation API)
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[BulkOperationDO] WebSocket error:', error);
    this.sessions.delete(ws);
  }

  /**
   * Broadcast progress to all connected WebSocket clients
   */
  private broadcastProgress(progress: JobProgress): void {
    const message = JSON.stringify(progress);
    
    this.state.getWebSockets().forEach((ws) => {
      try {
        ws.send(message);
      } catch (error) {
        console.error('[BulkOperationDO] Failed to send to client:', error);
      }
    });
  }

  /**
   * Update job status in D1
   */
  private async updateJobInDB(
    jobId: string, 
    updates: {
      status?: string;
      processed_keys?: number;
      error_count?: number;
      current_key?: string;
      percentage?: number;
    }
  ): Promise<void> {
    const db = getD1Binding(this.env);
    if (!db) return;

    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (updates.status !== undefined) {
        setClauses.push('status = ?');
        values.push(updates.status);
        if (updates.status === 'completed' || updates.status === 'failed') {
          setClauses.push('completed_at = CURRENT_TIMESTAMP');
        }
      }
      if (updates.processed_keys !== undefined) {
        setClauses.push('processed_keys = ?');
        values.push(updates.processed_keys);
      }
      if (updates.error_count !== undefined) {
        setClauses.push('error_count = ?');
        values.push(updates.error_count);
      }
      if (updates.current_key !== undefined) {
        setClauses.push('current_key = ?');
        values.push(updates.current_key);
      }
      if (updates.percentage !== undefined) {
        setClauses.push('percentage = ?');
        values.push(updates.percentage);
      }

      values.push(jobId);

      await db.prepare(`
        UPDATE bulk_jobs 
        SET ${setClauses.join(', ')}
        WHERE job_id = ?
      `).bind(...values).run();
    } catch (error) {
      console.error('[BulkOperationDO] DB update error:', error);
    }
  }

  /**
   * Process bulk copy operation
   */
  async processBulkCopy(params: BulkCopyParams & { jobId: string }): Promise<void> {
    const { jobId, sourceNamespaceId, targetNamespaceId, keys, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      // Update status to running
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: keys.length, processed: 0, errors: 0, percentage: 0 }
      });

      const copyData: Array<{ key: string; value: string }> = [];
      let errorCount = 0;

      // Fetch all key values from source
      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        
        try {
          const valueRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${sourceNamespaceId}/values/${encodeURIComponent(keyName)}`,
            this.env
          );
          const valueResponse = await fetch(valueRequest);

          if (valueResponse.ok) {
            const value = await valueResponse.text();
            copyData.push({ key: keyName, value: value });
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error('[BulkOperationDO] Failed to fetch key:', keyName, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 50); // First 50% is fetching
          await this.updateJobInDB(jobId, { 
            processed_keys: i + 1, 
            error_count: errorCount,
            current_key: keyName,
            percentage
          });
          this.broadcastProgress({
            jobId,
            status: 'running',
            progress: { 
              total: keys.length, 
              processed: i + 1, 
              errors: errorCount, 
              currentKey: keyName,
              percentage 
            }
          });
        }
      }

      // Write to target namespace using bulk API
      const batchSize = 10000;
      let writeProcessed = 0;

      for (let i = 0; i < copyData.length; i += batchSize) {
        const batch = copyData.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${targetNamespaceId}/bulk`,
            this.env,
            {
              method: 'PUT',
              body: JSON.stringify(batch),
        headers: { 'Content-Type': 'application/json' }
      }
    );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            writeProcessed += batch.length;
          } else {
            console.error('[BulkOperationDO] Bulk copy failed:', await bulkResponse.text());
            errorCount += batch.length;
          }
        } catch (err) {
          console.error('[BulkOperationDO] Batch copy error:', err);
          errorCount += batch.length;
        }

        // Broadcast progress (second 50% is writing)
        const percentage = 50 + Math.round((writeProcessed / copyData.length) * 50);
        await this.updateJobInDB(jobId, { 
          processed_keys: keys.length,
          error_count: errorCount,
          percentage
        });
        this.broadcastProgress({
          jobId,
          status: 'running',
          progress: { 
            total: keys.length, 
            processed: keys.length, 
            errors: errorCount,
            percentage 
          }
        });
      }

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed', 
        processed_keys: writeProcessed,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: keys.length, 
          processed: writeProcessed, 
          errors: errorCount,
          percentage: 100 
        },
        result: { processed: writeProcessed, errors: errorCount }
      });

      // Audit log
      await auditLog(db, {
        namespace_id: sourceNamespaceId,
        operation: 'bulk_copy',
        user_email: userEmail,
        details: JSON.stringify({ 
          target_namespace_id: targetNamespaceId,
          total: keys.length,
          processed: writeProcessed,
          errors: errorCount,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[BulkOperationDO] Bulk copy error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: keys.length, processed: 0, errors: keys.length, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process bulk TTL update operation
   */
  async processBulkTTL(params: BulkTTLParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, keys, ttl, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: keys.length, processed: 0, errors: 0, percentage: 0 }
      });

      let processedCount = 0;
      let errorCount = 0;

      // Update TTL for each key
      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];
        
        try {
          // Get current value
          const getRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
            this.env
          );
          const getResponse = await fetch(getRequest);

          if (!getResponse.ok) {
            errorCount++;
            continue;
          }

          const value = await getResponse.text();

          // Update with new TTL
          const putRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}?expiration_ttl=${ttl}`,
            this.env,
            {
              method: 'PUT',
              body: value,
              headers: { 'Content-Type': 'text/plain' }
            }
          );

          const putResponse = await fetch(putRequest);

          if (putResponse.ok) {
            processedCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error('[BulkOperationDO] Failed to update TTL for key:', keyName, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 100);
          await this.updateJobInDB(jobId, { 
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage
          });
          this.broadcastProgress({
            jobId,
            status: 'running',
            progress: { 
              total: keys.length, 
              processed: i + 1, 
              errors: errorCount,
              currentKey: keyName,
              percentage 
            }
          });
        }
      }

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed',
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: keys.length, 
          processed: processedCount, 
          errors: errorCount,
          percentage: 100 
        },
        result: { processed: processedCount, errors: errorCount }
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_ttl_update',
        user_email: userEmail,
        details: JSON.stringify({ 
          ttl,
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[BulkOperationDO] Bulk TTL error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: keys.length, processed: 0, errors: keys.length, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process bulk tag operation
   */
  async processBulkTag(params: BulkTagParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, keys, tags, operation, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: keys.length, processed: 0, errors: 0, percentage: 0 }
      });

      let processedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < keys.length; i++) {
        const keyName = keys[i];

        try {
          if (!db) {
            errorCount++;
            continue;
          }

          // Get existing metadata
          const existing = await db.prepare(
            'SELECT tags FROM key_metadata WHERE namespace_id = ? AND key_name = ?'
          ).bind(namespaceId, keyName).first();

          let existingTags: string[] = [];
          if (existing && existing.tags) {
            try {
              existingTags = JSON.parse(existing.tags as string) as string[];
            } catch {
              existingTags = [];
            }
          }

          // Apply tag operation
          let newTags: string[];
          switch (operation) {
            case 'add':
              newTags = [...new Set([...existingTags, ...tags])];
              break;
            case 'remove':
              newTags = existingTags.filter(t => !tags.includes(t));
              break;
            case 'replace':
              newTags = tags;
              break;
            default:
              newTags = existingTags;
          }

          // Upsert metadata
          await db.prepare(`
            INSERT INTO key_metadata (namespace_id, key_name, tags, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(namespace_id, key_name) 
            DO UPDATE SET tags = excluded.tags, updated_at = CURRENT_TIMESTAMP
          `).bind(namespaceId, keyName, JSON.stringify(newTags)).run();

          processedCount++;
        } catch (err) {
          console.error('[BulkOperationDO] Failed to tag key:', keyName, err);
          errorCount++;
        }

        // Broadcast progress every 10 keys or on last key
        if ((i + 1) % 10 === 0 || i === keys.length - 1) {
          const percentage = Math.round(((i + 1) / keys.length) * 100);
          await this.updateJobInDB(jobId, { 
            processed_keys: i + 1,
            error_count: errorCount,
            current_key: keyName,
            percentage
          });
          this.broadcastProgress({
            jobId,
            status: 'running',
            progress: { 
              total: keys.length, 
              processed: i + 1, 
              errors: errorCount,
              currentKey: keyName,
              percentage 
            }
          });
        }
      }

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed',
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: keys.length, 
          processed: processedCount, 
          errors: errorCount,
          percentage: 100 
        },
        result: { processed: processedCount, errors: errorCount }
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_tag',
        user_email: userEmail,
        details: JSON.stringify({ 
          operation,
          tags,
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[BulkOperationDO] Bulk tag error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: keys.length, processed: 0, errors: keys.length, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process bulk delete operation
   */
  async processBulkDelete(params: BulkDeleteParams & { jobId: string }): Promise<void> {
    const { jobId, namespaceId, keys, userEmail } = params;
    const db = getD1Binding(this.env);

    try {
      await this.updateJobInDB(jobId, { status: 'running', processed_keys: 0, error_count: 0 });
      this.broadcastProgress({
        jobId,
        status: 'running',
        progress: { total: keys.length, processed: 0, errors: 0, percentage: 0 }
      });

      let processedCount = 0;
      let errorCount = 0;

      // Delete keys using bulk API
      const batchSize = 10000;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);

        try {
          const bulkRequest = createCfApiRequest(
            `/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
            this.env,
            {
              method: 'DELETE',
              body: JSON.stringify(batch),
              headers: { 'Content-Type': 'application/json' }
            }
          );

          const bulkResponse = await fetch(bulkRequest);

          if (bulkResponse.ok) {
            processedCount += batch.length;
          } else {
            console.error('[BulkOperationDO] Bulk delete failed:', await bulkResponse.text());
            errorCount += batch.length;
          }
        } catch (err) {
          console.error('[BulkOperationDO] Batch delete error:', err);
          errorCount += batch.length;
        }

        // Broadcast progress
        const percentage = Math.round(((i + batch.length) / keys.length) * 100);
        await this.updateJobInDB(jobId, { 
          processed_keys: i + batch.length,
          error_count: errorCount,
          percentage
        });
        this.broadcastProgress({
          jobId,
          status: 'running',
          progress: { 
            total: keys.length, 
            processed: i + batch.length, 
            errors: errorCount,
            percentage 
          }
        });
      }

      // Mark as completed
      await this.updateJobInDB(jobId, { 
        status: 'completed',
        processed_keys: processedCount,
        error_count: errorCount,
        percentage: 100
      });

      this.broadcastProgress({
        jobId,
        status: 'completed',
        progress: { 
          total: keys.length, 
          processed: processedCount, 
          errors: errorCount,
          percentage: 100 
        },
        result: { processed: processedCount, errors: errorCount }
      });

      // Audit log
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_delete',
        user_email: userEmail,
        details: JSON.stringify({ 
          total: keys.length,
          processed: processedCount,
          errors: errorCount,
          job_id: jobId
        })
      });

    } catch (error) {
      console.error('[BulkOperationDO] Bulk delete error:', error);
      
      await this.updateJobInDB(jobId, { status: 'failed' });
      
      this.broadcastProgress({
        jobId,
        status: 'failed',
        progress: { total: keys.length, processed: 0, errors: keys.length, percentage: 0 },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
