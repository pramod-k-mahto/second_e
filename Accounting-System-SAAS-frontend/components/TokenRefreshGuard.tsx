'use client';

import { useEffect } from 'react';
import { getToken, scheduleTokenRefresh } from '@/lib/api';

/**
 * Invisible component mounted at the app root.
 * When the user reloads/revisits the page, it reads the stored access_token
 * and re-arms the proactive refresh timer so the session never expires silently.
 */
export function TokenRefreshGuard() {
  useEffect(() => {
    const token = getToken();
    if (token) {
      scheduleTokenRefresh(token);
    }
  }, []);

  return null;
}
