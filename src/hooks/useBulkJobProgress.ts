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

const POLLING_INTERVAL = 1000; // Poll every second

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
  const isMountedRef = useRef(true);
  const hasCompletedRef = useRef(false);
  const hasCancelledRef = useRef(false);

  // Polling
  const startPolling = useCallback(() => {
    // Don't start polling if jobId is empty
    if (!jobId) {
      console.log('[useBulkJobProgress] Skipping polling - missing jobId');
      return;
    }
    
    console.log('[useBulkJobProgress] Starting polling for job:', jobId);
    
    if (pollingIntervalRef.current) {
      return; // Already polling
    }

    const poll = async () => {
      if (!isMountedRef.current || hasCompletedRef.current) {
        return;
      }

      try {
        const jobStatus = await api.getJobStatus(jobId);
        
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
        console.error('[useBulkJobProgress] Polling error:', err);
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    };

    // Poll immediately, then on interval
    poll();
    pollingIntervalRef.current = window.setInterval(poll, POLLING_INTERVAL);
  }, [jobId, onComplete, onError]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
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
    startPolling();

    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return {
    progress,
    isConnected: false, // No WebSocket connection
    error,
    cancelJob,
  };
}
