import { useEffect } from 'react';

export function useDailyRefresh(onRefresh: () => void) {
  useEffect(() => {
    onRefresh();

    let midnightTimer = 0;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 1, 0);
      midnightTimer = window.setTimeout(() => {
        onRefresh();
        scheduleMidnight();
      }, Math.max(1_000, next.getTime() - now.getTime()));
    };
    scheduleMidnight();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') onRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onRefresh]);
}
