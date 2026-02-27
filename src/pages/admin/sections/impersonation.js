import { navigateTo } from '../../../router/router.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import {
  getEffectiveUserId,
  getImpersonatedUserId,
  isImpersonating,
  startImpersonation,
  stopImpersonation
} from '../../../features/auth/auth.js';
import { state, getUserDisplay } from '../adminState.js';

export const renderImpersonationSection = (content) => {
  const options = state.profiles
    .map((profile) => `<option value="${profile.user_id}">${getUserDisplay(profile)}</option>`)
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <h3 class="h5 mb-3">Login as Normal Registered User</h3>
        <p class="admin-muted">Pick a user to view the app exactly like a normal user. You can return back as admin from header.</p>
        <form id="impersonation-form" class="row g-3">
          <div class="col-12 col-md-8">
            <label class="form-label">Registered User</label>
            <select class="form-select" name="impersonated_user_id" required>
              <option value="">Select user...</option>
              ${options}
            </select>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">View as User</button>
            <button class="btn btn-outline-secondary" type="button" id="stop-impersonation-btn">Return as Admin</button>
          </div>
        </form>
        <p class="mt-3 mb-0 admin-muted">Current mode: ${isImpersonating() ? `Viewing as ${getImpersonatedUserId()}` : 'Admin'}</p>
      </div>
    </div>
  `;

  const form = content.querySelector('#impersonation-form');
  const stopButton = content.querySelector('#stop-impersonation-btn');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const userId = String(new FormData(form).get('impersonated_user_id') ?? '').trim();

    if (!userId) {
      notifyError('Select a user first.');
      return;
    }

    const started = startImpersonation(userId);

    if (!started) {
      notifyError('Unable to start user view mode.');
      return;
    }

    notifyInfo('User view mode enabled. Redirecting to dashboard...');
    navigateTo('/dashboard');
  });

  stopButton.addEventListener('click', () => {
    stopImpersonation();
    notifyInfo('Returned to admin mode.');
    renderImpersonationSection(content);
  });
};
