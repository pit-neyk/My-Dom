import template from './admin.html?raw';
import './admin.css';
import { navigateTo } from '../../router/router.js';
import {
  getEffectiveUserId,
  isAdmin,
  isAuthenticated,
  isImpersonating
} from '../../features/auth/auth.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';
import { loadInitialData, getRequestedSectionId, renderNav } from './adminState.js';
import { renderObjectsSection } from './sections/objects.js';
import { renderObligationsSection } from './sections/obligations.js';
import { renderEventsSection } from './sections/events.js';
import { renderDocumentsSection } from './sections/documents.js';
import { renderMassMessagesSection } from './sections/messages.js';
import { renderImpersonationSection } from './sections/impersonation.js';
import { renderProfileSection } from './sections/profile.js';

const ADMIN_LOAD_TIMEOUT_MS = 15000;

const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);

const renderLoadingState = (container, message) => {
  container.textContent = '';
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'd-flex align-items-center gap-2 text-secondary py-5 justify-content-center';
  const spinner = document.createElement('div');
  spinner.className = 'spinner-border spinner-border-sm';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = message;
  loadingWrap.append(spinner, text);
  container.appendChild(loadingWrap);
};

const renderErrorMessage = (container, message) => {
  container.textContent = '';
  const text = document.createElement('p');
  text.className = 'text-secondary mb-0';
  text.textContent = message;
  container.appendChild(text);
};

const renderSection = async (sectionId, content) => {
  switch (sectionId) {
    case 'objects':
      renderObjectsSection(content);
      break;
    case 'obligations':
      await renderObligationsSection(content);
      break;
    case 'events':
      renderEventsSection(content);
      break;
    case 'documents':
      renderDocumentsSection(content);
      break;
    case 'messages':
      renderMassMessagesSection(content);
      break;
    case 'impersonation':
      renderImpersonationSection(content);
      break;
    case 'profile':
      renderProfileSection(content);
      break;
    default:
      renderObjectsSection(content);
  }
};

export const renderAdminPanelPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (!isAdmin()) {
    notifyError('Only admins can access Admin Panel.');
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const nav = container.querySelector('#admin-nav');
  const content = container.querySelector('#admin-content');

  renderLoadingState(content, 'Loading admin panel…');

  try {
    await withTimeout(
      loadInitialData(),
      ADMIN_LOAD_TIMEOUT_MS,
      'Loading admin data timed out. Please try again.'
    );
  } catch (error) {
    notifyError(error.message || 'Failed to load admin data.');
    renderErrorMessage(content, 'Unable to load admin data.');
    return;
  }

  const initialSectionId = getRequestedSectionId();
  renderNav(
    nav,
    (sectionId) => {
      renderSection(sectionId, content).catch((error) => {
        notifyError(error.message || 'Failed to load admin section.');
        renderErrorMessage(content, 'Unable to load this admin section.');
      });
    },
    initialSectionId
  );

  try {
    await renderSection(initialSectionId, content);
  } catch (error) {
    notifyError(error.message || 'Failed to load admin section.');
    renderErrorMessage(content, 'Unable to load this admin section.');
    return;
  }

  if (isImpersonating()) {
    notifyInfo(`User view mode is active for user ${getEffectiveUserId()}.`);
  }
};
