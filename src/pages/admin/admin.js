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
import { renderOwnersSection } from './sections/owners.js';
import { renderObligationsSection } from './sections/obligations.js';
import { renderEventsSection } from './sections/events.js';
import { renderDocumentsSection } from './sections/documents.js';
import { renderMassMessagesSection } from './sections/messages.js';
import { renderImpersonationSection } from './sections/impersonation.js';
import { renderProfileSection } from './sections/profile.js';

const renderSection = (sectionId, content) => {
  switch (sectionId) {
    case 'objects':
      renderObjectsSection(content);
      break;
    case 'owners':
      renderOwnersSection(content);
      break;
    case 'obligations':
      renderObligationsSection(content);
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

  content.innerHTML = `
    <div class="d-flex align-items-center gap-2 text-secondary py-5 justify-content-center">
      <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
      <span>Loading admin panel…</span>
    </div>
  `;

  try {
    await loadInitialData();
  } catch (error) {
    notifyError(error.message || 'Failed to load admin data.');
    content.innerHTML = '<p class="text-secondary mb-0">Unable to load admin data.</p>';
    return;
  }

  const initialSectionId = getRequestedSectionId();
  renderNav(nav, (sectionId) => renderSection(sectionId, content), initialSectionId);
  renderSection(initialSectionId, content);

  if (isImpersonating()) {
    notifyInfo(`User view mode is active for user ${getEffectiveUserId()}.`);
  }
};
