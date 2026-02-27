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

  onSessionChange?.(currentSession);

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
    return await supabase.auth.signOut();
  } catch (error) {
    return { error };
  }
};
