import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, loadInitialData, getUserDisplay, createNonPersistentClient } from '../adminState.js';

export const renderOwnersSection = (content) => {
  const rows = state.profiles
    .map(
      (profile) => `
      <tr>
        <td>${profile.full_name ?? '-'}</td>
        <td>${profile.email ?? '-'}</td>
        <td>${profile.phone ?? '-'}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-owner="${profile.user_id}">Edit</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Owners</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-owner-form-btn">Create Owner</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="owner-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Add / Modify Owner Contact Details</h3>
        <p class="admin-muted">Create a new owner account or edit existing owner profile/contact details.</p>
        <form id="owner-form" class="row g-3">
          <input type="hidden" name="user_id" />
          <div class="col-3">
            <label class="form-label">Full Name</label>
            <input class="form-control" name="full_name" />
          </div>
          <div class="col-3">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" required />
          </div>
          <div class="col-3">
            <label class="form-label">Phone</label>
            <input class="form-control" name="phone" />
          </div>
          <div class="col-3">
            <label class="form-label">Password (new owner only)</label>
            <input class="form-control" name="password" type="password" minlength="6" />
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Owner Details</button>
            <button class="btn btn-outline-secondary" type="button" id="owner-form-reset">Create New Owner</button>
            <button class="btn btn-outline-secondary" type="button" id="close-owner-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const ownerFormPanel = content.querySelector('#owner-form-panel');
  enableTableColumnFilters(content);

  const openOwnerFormButton = content.querySelector('#open-owner-form-btn');
  const form = content.querySelector('#owner-form');
  const resetButton = content.querySelector('#owner-form-reset');
  const closeOwnerFormButton = content.querySelector('#close-owner-form-btn');

  content.prepend(ownerFormPanel);

  const openOwnerForm = () => {
    ownerFormPanel.classList.remove('d-none');
  };

  const closeOwnerForm = () => {
    ownerFormPanel.classList.add('d-none');
  };

  openOwnerFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    openOwnerForm();
  });

  closeOwnerFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    closeOwnerForm();
  });

  resetButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    openOwnerForm();
  });

  content.querySelectorAll('[data-edit-owner]').forEach((button) => {
    button.addEventListener('click', () => {
      const owner = state.profiles.find((item) => item.user_id === button.dataset.editOwner);
      if (!owner) return;

      form.elements.user_id.value = owner.user_id;
      form.elements.full_name.value = owner.full_name ?? '';
      form.elements.email.value = owner.email ?? '';
      form.elements.phone.value = owner.phone ?? '';
      form.elements.password.value = '';
      openOwnerForm();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const isCreateMode = !payload.user_id;

    if (!payload.email) {
      notifyError('Email is required.');
      return;
    }

    let ownerUserId = payload.user_id;

    if (isCreateMode) {
      if (!payload.password || String(payload.password).length < 6) {
        notifyError('Password is required for new owners (minimum 6 characters).');
        return;
      }

      const signupClient = createNonPersistentClient();
      const { data: signUpData, error: signUpError } = await signupClient.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (signUpError) {
        notifyError(signUpError.message || 'Failed to create owner account.');
        return;
      }

      ownerUserId = signUpData.user?.id;

      if (!ownerUserId) {
        const { data: profileByEmail, error: profileLookupError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', payload.email)
          .maybeSingle();

        if (profileLookupError || !profileByEmail?.user_id) {
          notifyError('Owner account created but profile lookup failed. Please try editing the owner from the list.');
          return;
        }

        ownerUserId = profileByEmail.user_id;
      }

      await supabase
        .from('user_roles')
        .upsert({ user_id: ownerUserId, role: 'user' }, { onConflict: 'user_id' });
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: ownerUserId,
          full_name: payload.full_name || null,
          email: payload.email || null,
          phone: payload.phone || null
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      notifyError(error.message || 'Failed to save owner details.');
      return;
    }

    notifyInfo(isCreateMode ? 'Owner created.' : 'Owner details updated.');
    await loadInitialData();
    renderOwnersSection(content);
  });
};
