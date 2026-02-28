import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData } from '../adminState.js';
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
    renderProfileSection(content);
  });
};
