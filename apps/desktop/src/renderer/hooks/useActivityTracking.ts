import { useEffect } from 'react';
import { getAccomplish } from '../lib/accomplish';

/**
 * Notifies the main process of user activity (mouse, keyboard, click events).
 * This is used for idle detection and activity logging.
 */
export function useActivityTracking(): void {
  const accomplish = getAccomplish();

  useEffect(() => {
    const handleActivity = () => {
      accomplish.notifyActivity?.();
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [accomplish]);
}
