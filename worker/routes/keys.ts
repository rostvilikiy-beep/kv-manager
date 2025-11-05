import type { Env, APIResponse, KVKeyInfo } from '../types';
import { createCfApiRequest, getD1Binding, auditLog } from '../utils/helpers';

export async function handleKeyRoutes(
  request: Request,
  env: Env,
  url: URL,
  corsHeaders: HeadersInit,
  isLocalDev: boolean,
  userEmail: string
): Promise<Response> {
  const db = getD1Binding(env);

  try {
    // GET /api/keys/:namespaceId/list - List keys in namespace
    const listMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/list$/);
    if (listMatch && request.method === 'GET') {
      const namespaceId = listMatch[1];
      const prefix = url.searchParams.get('prefix') || undefined;
      const limit = url.searchParams.get('limit') || '1000';

      console.log('[Keys] Listing keys for namespace:', namespaceId, { prefix, limit });

      if (isLocalDev) {
        // Return mock keys
        const mockKeys: KVKeyInfo[] = [
          { name: 'test-key-1', expiration: undefined, metadata: {} },
          { name: 'test-key-2', expiration: Math.floor(Date.now() / 1000) + 86400, metadata: {} },
          { name: 'config-key', expiration: undefined, metadata: { version: '1.0' } }
        ];

        const response: APIResponse = {
          success: true,
          result: {
            keys: prefix ? mockKeys.filter(k => k.name.startsWith(prefix)) : mockKeys,
            list_complete: true
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Build query params
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      params.set('limit', limit);

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/keys?${params.toString()}`,
        env
      );

      const cfResponse = await fetch(cfRequest);
      console.log('[Keys] Cloudflare API response status:', cfResponse.status);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      const data = await cfResponse.json() as { result: KVKeyInfo[] };

      const response: APIResponse = {
        success: true,
        result: {
          keys: data.result || [],
          list_complete: true
        }
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // DELETE /api/keys/:namespaceId/:keyName - Delete a key
    const deleteMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/(.+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const namespaceId = deleteMatch[1];
      const keyName = decodeURIComponent(deleteMatch[2]);

      console.log('[Keys] Deleting key:', keyName, 'from namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(keyName)}`,
        env,
        { method: 'DELETE' }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        key_name: keyName,
        operation: 'delete',
        user_email: userEmail
      });

      const response: APIResponse = {
        success: true
      };

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // POST /api/keys/:namespaceId/bulk-delete - Bulk delete keys
    const bulkDeleteMatch = url.pathname.match(/^\/api\/keys\/([^/]+)\/bulk-delete$/);
    if (bulkDeleteMatch && request.method === 'POST') {
      const namespaceId = bulkDeleteMatch[1];
      const body = await request.json() as { keys: string[] };

      if (!body.keys || !Array.isArray(body.keys)) {
        return new Response(JSON.stringify({ error: 'Missing or invalid keys array' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      console.log('[Keys] Bulk deleting', body.keys.length, 'keys from namespace:', namespaceId);

      if (isLocalDev) {
        const response: APIResponse = {
          success: true,
          result: {
            status: 'completed',
            total_keys: body.keys.length,
            processed_keys: body.keys.length
          }
        };

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Use Cloudflare KV bulk delete API
      const cfRequest = createCfApiRequest(
        `/accounts/${env.ACCOUNT_ID}/storage/kv/namespaces/${namespaceId}/bulk`,
        env,
        {
          method: 'DELETE',
          body: JSON.stringify(body.keys)
        }
      );

      const cfResponse = await fetch(cfRequest);

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        console.error('[Keys] Cloudflare API error:', errorText);
        throw new Error(`Cloudflare API error: ${cfResponse.status} - ${errorText}`);
      }

      // Log audit entry
      await auditLog(db, {
        namespace_id: namespaceId,
        operation: 'bulk_delete',
        user_email: userEmail,
        details: JSON.stringify({ key_count: body.keys.length })
      });

      const response: APIResponse = {
        success: true,
        result: {
          status: 'completed',
          total_keys: body.keys.length,
          processed_keys: body.keys.length
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
    console.error('[Keys] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}

