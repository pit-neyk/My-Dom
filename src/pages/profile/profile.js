import './profile.css';
import template from './profile.html?raw';
import { supabase } from '../../lib/supabase.js';
import { navigateTo } from '../../router/router.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../components/toast/toast.js';
import { getCurrentSession, isAdmin, isAuthenticated, isImpersonating } from '../../features/auth/auth.js';

const loadCurrentProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name,email,phone')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

const normalizeText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const hasProfileChanges = (nextPayload, currentProfile) => (
  normalizeText(nextPayload.full_name) !== normalizeText(currentProfile.full_name)
  || normalizeText(nextPayload.phone) !== normalizeText(currentProfile.phone)
);

const syncProfileEmailIfNeeded = async (userId, userEmail, profile) => {
  const normalizedUserEmail = normalizeText(userEmail);
  if (!normalizedUserEmail) {
    return profile;
  }

  if (normalizeText(profile?.email) === normalizedUserEmail) {
    return profile;
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        full_name: normalizeText(profile?.full_name),
        email: normalizedUserEmail,
        phone: normalizeText(profile?.phone)
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return profile;
  }

  return {
    ...(profile ?? {}),
    email: normalizedUserEmail
  };
};

export const renderProfilePage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (isAdmin() && !isImpersonating()) {
    navigateTo('/admin');
    return;
  }

  if (isAdmin() && isImpersonating()) {
    notifyInfo('Profile updates are disabled while impersonating.');
    navigateTo('/dashboard');
    return;
  }

  const user = getCurrentSession()?.user;
  if (!user?.id) {
    navigateTo('/login');
    return;
  }

  let profile = null;
  try {
    profile = await loadCurrentProfile(user.id);
    profile = await syncProfileEmailIfNeeded(user.id, user.email, profile);
  } catch (error) {
    notifyError(error.message || 'Failed to load profile.');
  }

  const displayedEmail = user.email ?? profile?.email ?? '';

  container.innerHTML = template
    .replace('{{fullName}}', profile?.full_name ?? '')
    .replace('{{email}}', displayedEmail)
    .replace('{{phone}}', profile?.phone ?? '');

  const profileForm = container.querySelector('#user-profile-form');
  const passwordForm = container.querySelector('#user-password-form');

  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(profileForm).entries());
    const currentProfile = {
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null
    };

    if (!hasProfileChanges(payload, currentProfile)) {
      navigateTo('/dashboard');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: normalizeText(payload.full_name),
          email: normalizeText(user.email),
          phone: normalizeText(payload.phone)
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      notifyError(error.message || 'Failed to save profile.');
      return;
    }

    notifyInfo('Profile updated.');
    await waitForToastVisibility();
    navigateTo('/dashboard');
  });

  passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(passwordForm).entries());
    const nextPassword = String(payload.new_password ?? '');
    const confirmPassword = String(payload.confirm_password ?? '');

    if (!nextPassword || nextPassword.length < 6) {
      notifyError('Password must be at least 6 characters.');
      return;
    }

    if (nextPassword !== confirmPassword) {
      notifyError('Password confirmation does not match.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword });

    if (error) {
      notifyError(error.message || 'Failed to update password.');
      return;
    }

    notifyInfo('Password updated.');
    passwordForm.reset();
    await waitForToastVisibility();
    navigateTo('/dashboard');
  });
};
