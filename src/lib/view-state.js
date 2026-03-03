import { getCurrentSession } from '../features/auth/auth.js';

const VIEW_STATE_STORAGE_KEY = 'dom_view_state_v1';

const getScopeKey = () => `user:${getCurrentSession()?.user?.id ?? 'guest'}`;

const readStore = () => {
  try {
    const raw = window.sessionStorage.getItem(VIEW_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store) => {
  try {
    window.sessionStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
};

const getScopedStateKey = (key) => `${getScopeKey()}::${key}`;

export const readViewState = (key, defaults = {}) => {
  const store = readStore();
  const scopedKey = getScopedStateKey(key);
  const scopedState = store[scopedKey];

  if (!scopedState || typeof scopedState !== 'object') {
    return { ...defaults };
  }

  return {
    ...defaults,
    ...scopedState
  };
};

export const writeViewState = (key, nextState, defaults = {}) => {
  const store = readStore();
  const scopedKey = getScopedStateKey(key);
  const current = readViewState(key, defaults);

  store[scopedKey] = {
    ...current,
    ...nextState
  };

  writeStore(store);
};

export const clearViewState = (key) => {
  const store = readStore();
  const scopedKey = getScopedStateKey(key);
  delete store[scopedKey];
  writeStore(store);
};
