# Hotfix: WebSocket Connection Loop (429 Rate Limit Errors)

**Date:** November 8, 2025  
**Severity:** Critical  
**Status:** Fixed

## Problem Description

After deploying to production, the application experienced:
- Thousands of rapid 429 (Too Many Requests) errors from `/api/namespaces`
- Continuous WebSocket connection attempts to `wss://kv.adamic.tech/` (root path)
- Infinite reconnection loop causing rate limit exhaustion
- Browser console flooded with WebSocket error messages

## Root Cause

The `BulkProgressDialog` component was rendering even when closed, and the `useBulkJobProgress` hook was attempting to establish WebSocket connections with empty/invalid parameters:

1. **Component Always Active**: The `BulkProgressDialog` component was always rendered in the DOM (with `open={false}`), meaning the `useBulkJobProgress` hook was always active.

2. **No Parameter Validation**: The hook attempted WebSocket connections even when:
   - `jobId` was an empty string
   - `wsUrl` was an empty string
   - The dialog was not actually open

3. **Polling Fallback Triggered**: When WebSocket connection failed (due to invalid URL), the hook fell back to HTTP polling, which:
   - Attempted to poll `/api/jobs/` (with empty jobId)
   - Hit the Cloudflare Workers rate limits
   - Generated 429 errors
   - Triggered reconnection attempts in an infinite loop

## Solution Implemented

### 1. Component-Level Guard (`BulkProgressDialog.tsx`)

Added a conditional check before invoking the hook:

```typescript
// Only use the hook when dialog is open and we have valid params
const shouldConnect = open && jobId && wsUrl;

const { progress, isConnected, error: connectionError } = useBulkJobProgress({
  jobId: shouldConnect ? jobId : '',
  wsUrl: shouldConnect ? wsUrl : '',
  // ... callbacks
});
```

### 2. Hook-Level Guards (`useBulkJobProgress.ts`)

Added validation in the `connect` function:

```typescript
// Don't attempt to connect if wsUrl or jobId is empty
if (!wsUrl || !jobId) {
  console.log('[useBulkJobProgress] Skipping connection - missing wsUrl or jobId');
  return;
}
```

Added validation in the `startPolling` function:

```typescript
// Don't start polling if jobId is empty
if (!jobId) {
  console.log('[useBulkJobProgress] Skipping polling - missing jobId');
  return;
}
```

## Files Modified

1. `src/components/BulkProgressDialog.tsx`
   - Added `shouldConnect` guard before hook invocation
   - Prevents hook from attempting connections when dialog is closed

2. `src/hooks/useBulkJobProgress.ts`
   - Added parameter validation in `connect()` function
   - Added parameter validation in `startPolling()` function
   - Prevents WebSocket and polling attempts with empty parameters

## Testing Recommendations

### Before Deployment

1. **Unit Tests**: Verify hook behavior with empty parameters
2. **Integration Tests**: Test dialog open/close lifecycle
3. **Rate Limit Tests**: Monitor API request counts

### After Deployment

1. **Monitor Cloudflare Analytics**:
   - Check for 429 errors
   - Verify request rate has normalized
   - Monitor WebSocket connection attempts

2. **Browser Console**:
   - Verify no WebSocket errors on page load
   - Confirm WebSocket connections only occur during actual operations

3. **Functional Tests**:
   - Test bulk delete operation
   - Test bulk copy operation
   - Test import/export operations
   - Verify progress dialog shows correctly
   - Confirm WebSocket connections work as expected

## Prevention Measures

1. **Always validate parameters** before attempting external connections (WebSocket, API calls)
2. **Guard React hooks** that have side effects (connections, timers) with conditional logic
3. **Add logging** for debugging connection attempts
4. **Rate limit testing** should be part of pre-deployment checks
5. **Monitor production metrics** immediately after deployment

## Related Issues

- Initial implementation: WebSocket-based progress tracking for bulk operations
- See: `CHANGELOG.md` [Unreleased] section

## Deployment Notes

This is a **critical hotfix** and should be deployed immediately to production to:
- Stop the 429 error flood
- Reduce unnecessary API calls
- Restore normal application functionality
- Prevent potential service degradation

No version bump required as these changes are fixes for the unreleased WebSocket feature.

