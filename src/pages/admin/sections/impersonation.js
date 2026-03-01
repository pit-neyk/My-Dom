import { navigateTo } from '../../../router/router.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../../components/toast/toast.js';
import {
  getImpersonatedUserId,
  isImpersonating,
  startImpersonation,
  stopImpersonation
} from '../../../features/auth/auth.js';
import { state, getUserDisplay } from '../adminState.js';
import template from './impersonation.html?raw';
import './impersonation.css';

export const renderImpersonationSection = (content) => {
  const currentMode = isImpersonating() ? `Viewing as ${getImpersonatedUserId()}` : 'Admin';
  content.innerHTML = template
    .replace('{{options}}', '')
    .replace('{{currentMode}}', currentMode);

  const select = content.querySelector('select[name="impersonated_user_id"]');
  state.profiles.forEach((profile) => {
    const optionNode = document.createElement('option');
    optionNode.value = profile.user_id;
    optionNode.textContent = getUserDisplay(profile);
    select?.appendChild(optionNode);
  });

  const form = content.querySelector('#impersonation-form');
  const stopButton = content.querySelector('#stop-impersonation-btn');

  form.addEventListener('submit', async (event) => {
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
    await waitForToastVisibility();
    navigateTo('/dashboard');
  });

  stopButton.addEventListener('click', () => {
    stopImpersonation();
    notifyInfo('Returned to admin mode.');
    renderImpersonationSection(content);
  });
};
