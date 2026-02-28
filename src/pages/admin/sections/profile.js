import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData } from '../adminState.js';

export const renderProfileSection = (content) => {
  const userId = getCurrentSession()?.user?.id;
  const profile = state.profiles.find((item) => item.user_id === userId);

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <h3 class="h5 mb-3">Modify Your Profile</h3>
        <form id="my-profile-form" class="row g-3">
          <div class="col-12 col-md-4">
            <label class="form-label">Full Name</label>
            <input class="form-control" name="full_name" value="${profile?.full_name ?? ''}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" value="${profile?.email ?? ''}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Phone</label>
            <input class="form-control" name="phone" value="${profile?.phone ?? ''}" />
          </div>
          <div class="col-12">
            <button class="btn btn-primary" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;

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
