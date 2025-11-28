import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobProgress } from '../services/api';
import { api } from '../services/api';
import { bulkJobLogger } from '../lib/logger';

interface UseBulkJobProgressOptions {
  jobId: string;
  wsUrl: string;
  onComplete?: (result: JobProgress) => void;
  onError?: (error: string) => void;
}

interface UseBulkJobProgressReturn {
  progress: JobProgress | null;
  error: string | null;
}

const POLLING_INTERVAL = 2000; // Poll every 2 seconds (reduced from 1s to avoid rate limits)
const MAX_POLLING_INTERVAL = 10000; // Max 10 seconds between polls
const RATE_LIMIT_BACKOFF = 3000; // Add 3 seconds on rate limit

/**
 * Custom hook for tracking bulk job progress via HTTP polling
 * 
 * Polls the job status endpoint every 2 seconds to get real-time progress updates.
 * Automatically stops polling when job completes or fails.
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
      return;
    }

    const poll = async (): Promise<void> => {
      if (!isMountedRef.current || hasCompletedRef.current) {
        return;
      }

      try {
        const jobStatus = await api.getJobStatus(jobId);
        
        // Reset consecutive errors and interval on success
        consecutiveErrorsRef.current = 0;
        if (currentIntervalRef.current !== POLLING_INTERVAL) {
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

        if (progressUpdate.status === 'completed' || progressUpdate.status === 'failed') {
          hasCompletedRef.current = true;
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (progressUpdate.status === 'completed' && onComplete) {
            onComplete(progressUpdate);
          } else if (progressUpdate.status === 'failed' && onError) {
            onError('Job failed');
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
          bulkJobLogger.warn('Rate limited, slowing polling', { interval: currentIntervalRef.current });
          
          // Restart polling with new interval
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = window.setInterval(poll, currentIntervalRef.current);
          }
          
          // Don't increment error count or log error for rate limits
          return;
        }
        
        // For non-rate-limit errors, log and handle normally
        bulkJobLogger.error('Polling error', err);
        consecutiveErrorsRef.current++;
        
        // Stop polling after 10 consecutive non-rate-limit errors
        if (consecutiveErrorsRef.current >= 10) {
          bulkJobLogger.error('Too many consecutive errors, stopping polling');
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
    poll();
    pollingIntervalRef.current = window.setInterval(poll, currentIntervalRef.current);
  }, [jobId, onComplete, onError, stopPolling]);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    isMountedRef.current = true;
    hasCompletedRef.current = false;
    
    // Only start polling if we have a jobId
    if (jobId) {
      startPolling();
    }

    return (): void => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [jobId, startPolling, stopPolling]);

  return {
    progress,
    error,
  };
}
