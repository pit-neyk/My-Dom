import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';

let currentSession = null;
let authSubscription = null;

const getConfigurationErrorMessage = () =>
  'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in your .env file.';

export const initAuth = async (onSessionChange) => {
  if (!isSupabaseConfigured) {
    currentSession = null;
    onSessionChange?.(currentSession);
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (!error) {
    currentSession = data.session;
    onSessionChange?.(currentSession);
  }

  if (!authSubscription) {
    const { data: listenerData } = supabase.auth.onAuthStateChange((_event, session) => {
      currentSession = session;
      onSessionChange?.(currentSession);
    });

    authSubscription = listenerData.subscription;
  }
};

export const getCurrentSession = () => currentSession;

export const isAuthenticated = () => Boolean(currentSession?.user);

export const registerWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/login`
    }
  });
};

export const loginWithEmail = async ({ email, password }) => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  return supabase.auth.signInWithPassword({ email, password });
};

export const logout = async () => {
  if (!isSupabaseConfigured) {
    return { error: new Error(getConfigurationErrorMessage()) };
  }

  return supabase.auth.signOut();
};
