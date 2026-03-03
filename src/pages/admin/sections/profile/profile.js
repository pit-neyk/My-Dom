import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../../../components/toast/toast.js';
import { getCurrentSession, isAdmin, isImpersonating } from '../../../../features/auth/auth.js';
import { state, loadInitialData } from '../../adminState.js';
import { navigateTo } from '../../../../router/router.js';
import template from './profile.html?raw';
import './profile.css';

const normalizeText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const hasProfileChanges = (nextPayload, currentProfile) => (
  normalizeText(nextPayload.full_name) !== normalizeText(currentProfile.full_name)
  || normalizeText(nextPayload.email) !== normalizeText(currentProfile.email)
  || normalizeText(nextPayload.phone) !== normalizeText(currentProfile.phone)
);

export const renderProfileSection = (content) => {
  const userId = getCurrentSession()?.user?.id;
  const profile = state.profiles.find((item) => item.user_id === userId);

  content.innerHTML = template
    .replace('{{fullName}}', profile?.full_name ?? '')
    .replace('{{email}}', profile?.email ?? '')
    .replace('{{phone}}', profile?.phone ?? '');

  const form = content.querySelector('#my-profile-form');
  const passwordForm = content.querySelector('#my-profile-password-form');
  const cancelButton = content.querySelector('#my-profile-cancel-btn');

  cancelButton?.addEventListener('click', () => {
    navigateTo(isAdmin() && !isImpersonating() ? '/admin' : '/dashboard');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const currentProfile = {
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null
    };

    if (!hasProfileChanges(payload, currentProfile)) {
      navigateTo(isAdmin() && !isImpersonating() ? '/admin' : '/dashboard');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          full_name: normalizeText(payload.full_name),
          email: normalizeText(payload.email),
          phone: normalizeText(payload.phone)
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      notifyError(error.message || 'Failed to save profile.');
      return;
    }

    notifyInfo('Profile updated.');
    await loadInitialData();
    await waitForToastVisibility();
    navigateTo(isAdmin() && !isImpersonating() ? '/admin' : '/dashboard');
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
  });
};
