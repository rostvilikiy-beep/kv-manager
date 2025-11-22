import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobProgress } from '../services/api';
import { api } from '../services/api';

interface UseBulkJobProgressOptions {
  jobId: string;
  wsUrl: string;
  onComplete?: (result: JobProgress) => void;
  onError?: (error: string) => void;
}

interface UseBulkJobProgressReturn {
  progress: JobProgress | null;
  isConnected: boolean;
  error: string | null;
  cancelJob: () => void;
}

const POLLING_INTERVAL = 2000; // Poll every 2 seconds (reduced from 1s to avoid rate limits)
const MAX_POLLING_INTERVAL = 10000; // Max 10 seconds between polls
const RATE_LIMIT_BACKOFF = 3000; // Add 3 seconds on rate limit

/**
 * Custom hook for tracking bulk job progress via polling
 * 
 * Note: This hook uses HTTP polling instead of WebSockets for simplicity and reliability.
 * WebSockets are unnecessary for typical job durations and can cause connection issues.
 */
export function useBulkJobProgress({
  jobId,
  // @ts-expect-error - wsUrl kept for API compatibility but not used (polling only)
  wsUrl, // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  onError,
}: UseBulkJobProgressOptions): UseBulkJobProgressReturn {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollingIntervalRef = useRef<number | null>(null);
  const currentIntervalRef = useRef(POLLING_INTERVAL);
  const isMountedRef = useRef(true);
  const hasCompletedRef = useRef(false);
  const hasCancelledRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Start polling
  const startPolling = useCallback(() => {
    // Don't start if already polling
    if (pollingIntervalRef.current) {
      console.log('[useBulkJobProgress] Already polling, skipping');
      return;
    }
    
    console.log('[useBulkJobProgress] Starting polling for job:', jobId, 'interval:', currentIntervalRef.current);

    const poll = async () => {
      if (!isMountedRef.current || hasCompletedRef.current) {
        return;
      }

      try {
        const jobStatus = await api.getJobStatus(jobId);
        
        // Reset consecutive errors and interval on success
        consecutiveErrorsRef.current = 0;
        if (currentIntervalRef.current !== POLLING_INTERVAL) {
          console.log('[useBulkJobProgress] Polling recovered, resetting interval to:', POLLING_INTERVAL);
          currentIntervalRef.current = POLLING_INTERVAL;
          // Restart polling with normal interval
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = window.setInterval(poll, currentIntervalRef.current);
          }
        }
        
        const progressUpdate: JobProgress = {
          jobId: jobStatus.job_id as string,
          status: jobStatus.status as 'queued' | 'running' | 'completed' | 'failed',
          progress: {
            total: (jobStatus.total_keys as number) || 0,
            processed: (jobStatus.processed_keys as number) || 0,
            errors: (jobStatus.error_count as number) || 0,
            currentKey: jobStatus.current_key as string | undefined,
            percentage: (jobStatus.percentage as number) || 0,
          },
          // Include download URL for completed export jobs
          result: jobStatus.download_url ? {
            downloadUrl: jobStatus.download_url as string,
            format: jobStatus.format as string || 'json',
            processed: (jobStatus.processed_keys as number) || 0,
            errors: (jobStatus.error_count as number) || 0,
          } : undefined,
        };

        setProgress(progressUpdate);

        if (progressUpdate.status === 'completed' || progressUpdate.status === 'failed' || progressUpdate.status === 'cancelled') {
          hasCompletedRef.current = true;
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (progressUpdate.status === 'completed' && onComplete) {
            onComplete(progressUpdate);
          } else if (progressUpdate.status === 'failed' && onError) {
            onError('Job failed');
          } else if (progressUpdate.status === 'cancelled' && onError) {
            onError('Job was cancelled');
          }
        }
      } catch (err) {
        // Check if it's a rate limit error (429) - handle this specially
        const isRateLimit = err instanceof Error && (
          err.message.includes('429') || 
          err.message.includes('Too Many Requests')
        );
        
        if (isRateLimit) {
          // Increase polling interval on rate limit
          currentIntervalRef.current = Math.min(
            currentIntervalRef.current + RATE_LIMIT_BACKOFF,
            MAX_POLLING_INTERVAL
          );
          console.log('[useBulkJobProgress] Rate limited (429), slowing polling to:', currentIntervalRef.current, 'ms');
          
          // Restart polling with new interval
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = window.setInterval(poll, currentIntervalRef.current);
          }
          
          // Don't increment error count or log error for rate limits
          return;
        }
        
        // For non-rate-limit errors, log and handle normally
        console.error('[useBulkJobProgress] Polling error:', err);
        consecutiveErrorsRef.current++;
        
        // Stop polling after 10 consecutive non-rate-limit errors
        if (consecutiveErrorsRef.current >= 10) {
          console.error('[useBulkJobProgress] Too many consecutive errors, stopping polling');
          stopPolling();
          setError('Connection error - polling stopped');
          if (onError) {
            onError('Failed to get job status after multiple attempts');
          }
        } else {
          setError(err instanceof Error ? err.message : 'Polling failed');
        }
      }
    };

    // Poll immediately, then on interval
    console.log('[useBulkJobProgress] Setting up polling with interval:', currentIntervalRef.current, 'ms');
    poll();
    pollingIntervalRef.current = window.setInterval(poll, currentIntervalRef.current);
    console.log('[useBulkJobProgress] Interval created:', pollingIntervalRef.current);
  }, []);

  // Cancel job (not implemented - requires backend support)
  const cancelJob = useCallback(() => {
    if (hasCancelledRef.current) {
      console.log('[useBulkJobProgress] Job already cancelled');
      return;
    }

    console.log('[useBulkJobProgress] Cancel not implemented - requires WebSocket connection');
    hasCancelledRef.current = true;
    setError('Cancel functionality requires WebSocket support');
  }, []);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    isMountedRef.current = true;
    hasCompletedRef.current = false;
    
    // Only start polling if we have a jobId
    if (jobId) {
      console.log('[useBulkJobProgress] Effect triggered for jobId:', jobId);
      startPolling();
    }

    return () => {
      console.log('[useBulkJobProgress] Cleanup: stopping polling for jobId:', jobId);
      isMountedRef.current = false;
      stopPolling();
    };
  }, [jobId]);

  return {
    progress,
    isConnected: false, // No WebSocket connection
    error,
    cancelJob,
  };
}
