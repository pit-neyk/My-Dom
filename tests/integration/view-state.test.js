import { beforeEach, describe, expect, test, vi } from 'vitest';

const getCurrentSession = vi.fn();

vi.mock('../../src/features/auth/auth.js', () => ({
  getCurrentSession
}));

const loadModule = async () => import('../../src/lib/view-state.js');

describe('view-state storage', () => {
  beforeEach(() => {
    getCurrentSession.mockReset();
  });

  test('reads defaults when no state is stored', async () => {
    getCurrentSession.mockReturnValue(null);
    const { readViewState } = await loadModule();

    expect(readViewState('filters', { status: 'all' })).toEqual({ status: 'all' });
  });

  test('writes and reads scoped guest state', async () => {
    getCurrentSession.mockReturnValue(null);
    const { writeViewState, readViewState } = await loadModule();

    writeViewState('filters', { status: 'paid' }, { status: 'all', sort: 'date' });

    expect(readViewState('filters', { status: 'all', sort: 'date' })).toEqual({
      status: 'paid',
      sort: 'date'
    });
  });

  test('separates state by authenticated user id', async () => {
    const { writeViewState, readViewState } = await loadModule();

    getCurrentSession.mockReturnValue({ user: { id: 'user-a' } });
    writeViewState('dashboard', { page: 2 }, { page: 1 });

    getCurrentSession.mockReturnValue({ user: { id: 'user-b' } });
    expect(readViewState('dashboard', { page: 1 })).toEqual({ page: 1 });

    getCurrentSession.mockReturnValue({ user: { id: 'user-a' } });
    expect(readViewState('dashboard', { page: 1 })).toEqual({ page: 2 });
  });

  test('clears only the scoped key', async () => {
    getCurrentSession.mockReturnValue({ user: { id: 'user-a' } });
    const { writeViewState, readViewState, clearViewState } = await loadModule();

    writeViewState('table', { page: 4 }, { page: 1 });
    clearViewState('table');

    expect(readViewState('table', { page: 1 })).toEqual({ page: 1 });
  });
});
