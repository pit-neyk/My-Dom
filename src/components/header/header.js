import template from './header.html?raw';
import './header.css';
import { getRouteTitle, navigationLinks } from '../../router/routes.js';
import { isAuthenticated, logout } from '../../features/auth/auth.js';
import { notifyError } from '../toast/toast.js';

const headerSlot = () => document.getElementById('header-slot');
const guestRouteSet = new Set(['/', '/login', '/register']);
const authRouteSet = new Set(['/dashboard']);

const navigateToPath = (path) => {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }

  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const renderHeader = (currentPath = '/') => {
  const slot = headerSlot();

  if (!slot) {
    return;
  }

  slot.innerHTML = template;

  const linksContainer = slot.querySelector('#header-nav-links');
  const authenticated = isAuthenticated();

  const brandLink = slot.querySelector('#brand-link');
  if (brandLink && authenticated) {
    brandLink.setAttribute('href', '/dashboard');
  }

  const visibleLinks = navigationLinks.filter(({ href }) => {
    if (authenticated) {
      return authRouteSet.has(href);
    }

    return guestRouteSet.has(href);
  });

  linksContainer.innerHTML = visibleLinks
    .map(({ href, label }) => {
      const isActive = href === currentPath;

      return `
        <li class="nav-item">
          <a class="nav-link ${isActive ? 'active' : ''}" href="${href}" data-link="router">
            ${label}
          </a>
        </li>
      `;
    })
    .join('');

  if (authenticated) {
    linksContainer.insertAdjacentHTML(
      'beforeend',
      `
        <li class="nav-item">
          <button class="btn btn-link nav-link" type="button" id="header-logout-btn">Logout</button>
        </li>
      `
    );

    const logoutButton = linksContainer.querySelector('#header-logout-btn');
    logoutButton?.addEventListener('click', async () => {
      const { error } = await logout();

      if (error) {
        notifyError(error.message || 'Logout failed. Please try again.');
        return;
      }

      navigateToPath('/');
    });
  }

  const pageTitle = getRouteTitle(currentPath);
  document.title = pageTitle ? `${pageTitle} | DOM` : 'DOM';
};
