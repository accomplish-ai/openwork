import { useCallback, useRef, useState } from 'react';
import {
  getDesktopControlStatus,
  type DesktopControlStatusPayload,
} from '../../lib/accomplish';

export interface DesktopControlStatusCheckOptions {
  forceRefresh?: boolean;
}

export interface UseDesktopControlStatusResult {
  status: DesktopControlStatusPayload | null;
  errorMessage: string | null;
  isChecking: boolean;
  checkStatus: (
    options?: DesktopControlStatusCheckOptions
  ) => Promise<DesktopControlStatusPayload | null>;
}

export function useDesktopControlStatus(): UseDesktopControlStatusResult {
  const [status, setStatus] = useState<DesktopControlStatusPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const activeRequestIdRef = useRef(0);

  const checkStatus = useCallback(
    async (
      options: DesktopControlStatusCheckOptions = {}
    ): Promise<DesktopControlStatusPayload | null> => {
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      setIsChecking(true);
      setErrorMessage(null);

      try {
        const nextStatus = await getDesktopControlStatus({
          forceRefresh: options.forceRefresh ?? false,
        });

        // Ignore stale responses from earlier checks.
        if (requestId !== activeRequestIdRef.current) {
          return null;
        }

        setStatus(nextStatus);
        return nextStatus;
      } catch (error) {
        if (requestId !== activeRequestIdRef.current) {
          return null;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Desktop control readiness check failed.';
        setErrorMessage(message);
        return null;
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsChecking(false);
        }
      }
    },
    []
  );

  return {
    status,
    errorMessage,
    isChecking,
    checkStatus,
  };
}

export default useDesktopControlStatus;
