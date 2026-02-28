import { navigateTo } from '../../../../router/router.js';
import { supabase } from '../../../../lib/supabase.js';
import {
  getCurrentSession,
  isImpersonating,
  startImpersonation,
  stopImpersonation
} from '../../../../features/auth/auth.js';

const getNormalUserForImpersonation = async () => {
  const currentAdminUserId = getCurrentSession()?.user?.id ?? '';

  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'user')
    .neq('user_id', currentAdminUserId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.user_id ?? null;
};

export const startViewAsUserMode = async () => {
  if (isImpersonating()) {
    navigateTo('/dashboard');
    return true;
  }

  let userId = null;

  try {
    userId = await getNormalUserForImpersonation();
  } catch (error) {
    console.warn(error?.message || 'Unable to pick a registered user for preview mode.');
    return false;
  }

  if (!userId) {
    console.warn('No registered user found for preview mode.');
    return false;
  }

  const started = startImpersonation(userId);

  if (!started) {
    console.warn('Unable to start user view mode.');
    return false;
  }

  navigateTo('/dashboard');
  return true;
};

export const stopViewAsUserMode = () => {
  stopImpersonation();
};
