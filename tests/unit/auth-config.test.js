import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: false
}));

import {
  getCurrentRole,
  getCurrentSession,
  initAuth,
  isAuthenticated,
  loginWithEmail,
  logout,
  registerWithEmail,
  startImpersonation
} from '../../src/features/auth/auth.js';

describe('auth when supabase is not configured', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('initAuth resets session to guest and invokes callback', async () => {
    const onSessionChange = vi.fn();

    await initAuth(onSessionChange);

    expect(getCurrentSession()).toBeNull();
    expect(getCurrentRole()).toBe('guest');
    expect(isAuthenticated()).toBe(false);
    expect(onSessionChange).toHaveBeenCalledWith(null);
  });

  test('register/login/logout return configuration error', async () => {
    const registerResult = await registerWithEmail({ email: 'user@example.com', password: '12345678' });
    const loginResult = await loginWithEmail({ email: 'user@example.com', password: '12345678' });
    const logoutResult = await logout();

    expect(registerResult.error).toBeInstanceOf(Error);
    expect(loginResult.error).toBeInstanceOf(Error);
    expect(logoutResult.error).toBeInstanceOf(Error);
    expect(registerResult.error.message).toContain('Supabase is not configured');
  });

  test('cannot impersonate without admin role', () => {
    expect(startImpersonation('some-user')).toBe(false);
  });
});
