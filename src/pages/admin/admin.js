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
import { renderObjectsSection } from './sections/objects/objects.js';
import { renderRatesSection } from './sections/rates/rates.js';
import { renderPaymentObligationsSection } from './sections/payment-obligations/payment-obligations.js';
import { renderEventsSection } from './sections/events/events.js';
import { renderDocumentsSection } from './sections/documents/documents.js';
import { renderMassMessagesSection } from './sections/messages/messages.js';
import { startViewAsUserMode } from './sections/impersonation/impersonation.js';
import { renderProfileSection } from './sections/profile/profile.js';

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
  loadingWrap.className = 'd-flex align-items-center gap-3 py-5 justify-content-center dom-animate-in';
  const spinner = document.createElement('div');
  spinner.className = 'spinner-border spinner-border-sm';
  spinner.style.color = 'var(--dom-primary)';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'text-secondary';
  text.style.fontSize = '0.875rem';
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
    case 'rates':
      await renderRatesSection(content);
      break;
    case 'payment-obligations':
      await renderPaymentObligationsSection(content);
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
      await startViewAsUserMode();
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

};
