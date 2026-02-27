import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';

let currentSession = null;
let authSubscription = null;
let currentRole = 'guest';

const ADMIN_IMPERSONATION_KEY = 'dom_admin_impersonation_user_id';
let impersonatedUserId = localStorage.getItem(ADMIN_IMPERSONATION_KEY);

const getConfigurationErrorMessage = () =>
  'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in your .env file.';

const clearImpersonation = () => {
  impersonatedUserId = null;
  localStorage.removeItem(ADMIN_IMPERSONATION_KEY);
};

const loadCurrentRole = async () => {
  if (!currentSession?.user?.id) {
    currentRole = 'guest';
    clearImpersonation();
    return;
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', currentSession.user.id)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load user role:', error.message);
    currentRole = 'user';
    clearImpersonation();
    return;
  }

  currentRole = data?.role ?? 'user';

  if (currentRole !== 'admin') {
    clearImpersonation();
  }
};

export const initAuth = async (onSessionChange) => {
  if (!isSupabaseConfigured) {
    currentSession = null;
    currentRole = 'guest';
    clearImpersonation();
    onSessionChange?.(currentSession);
    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('Failed to get auth session:', error.message);
      currentSession = null;
    } else {
      currentSession = data.session;
    }
  } catch (error) {
    console.warn('Unexpected auth session error:', error);
    currentSession = null;
  }

  await loadCurrentRole();

  onSessionChange?.(currentSession);

  if (!authSubscription) {
    const { data: listenerData } = supabase.auth.onAuthStateChange(async (_event, session) => {
      currentSession = session;
      await loadCurrentRole();
      onSessionChange?.(currentSession);
    });

    authSubscription = listenerData.subscription;
  }
};

export const getCurrentSession = () => currentSession;

export const isAuthenticated = () => Boolean(currentSession?.user);

export const getCurrentRole = () => currentRole;

export const isAdmin = () => currentRole === 'admin';

export const getEffectiveUserId = () => {
  if (!currentSession?.user?.id) {
    return null;
  }

  if (isAdmin() && impersonatedUserId) {
    return impersonatedUserId;
  }

  return currentSession.user.id;
};

export const isImpersonating = () => isAdmin() && Boolean(impersonatedUserId);

export const getImpersonatedUserId = () => impersonatedUserId;

export const startImpersonation = (userId) => {
  if (!isAdmin() || !userId) {
    return false;
  }

  impersonatedUserId = userId;
  localStorage.setItem(ADMIN_IMPERSONATION_KEY, userId);
  return true;
};

export const stopImpersonation = () => {
  clearImpersonation();
};

export const registerWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  try {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
  } catch (error) {
    return { error };
  }
};

export const loginWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  try {
    return await supabase.auth.signInWithPassword({ email, password });
  } catch (error) {
    return { error };
  }
};

export const logout = async () => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  try {
    clearImpersonation();
    currentRole = 'guest';
    return await supabase.auth.signOut();
  } catch (error) {
    return { error };
  }
};
