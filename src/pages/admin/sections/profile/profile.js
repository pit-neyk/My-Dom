import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../../../components/toast/toast.js';
import { getCurrentSession, isAdmin, isImpersonating } from '../../../../features/auth/auth.js';
import { state, loadInitialData } from '../../adminState.js';
import { navigateTo } from '../../../../router/router.js';
import template from './profile.html?raw';
import './profile.css';

export const renderProfileSection = (content) => {
  const userId = getCurrentSession()?.user?.id;
  const profile = state.profiles.find((item) => item.user_id === userId);

  content.innerHTML = template
    .replace('{{fullName}}', profile?.full_name ?? '')
    .replace('{{email}}', profile?.email ?? '')
    .replace('{{phone}}', profile?.phone ?? '');

  const form = content.querySelector('#my-profile-form');
  const cancelButton = content.querySelector('#my-profile-cancel-btn');

  cancelButton?.addEventListener('click', () => {
    navigateTo(isAdmin() && !isImpersonating() ? '/admin' : '/dashboard');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          full_name: payload.full_name || null,
          email: payload.email || null,
          phone: payload.phone || null
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
};
