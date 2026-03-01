import template from './header.html?raw';
import './header.css';
import { getRouteTitle, navigationLinks } from '../../router/routes.js';
import { isAuthenticated, isAdmin, isImpersonating, logout, stopImpersonation } from '../../features/auth/auth.js';
import { notifyError } from '../toast/toast.js';

const headerSlot = () => document.getElementById('header-slot');
const guestRouteSet = new Set(['/', '/login', '/register']);
const authRouteSet = new Set(['/dashboard', '/create-signal', '/discussions']);

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
  const admin = authenticated && isAdmin();

  const brandLink = slot.querySelector('#brand-link');
  if (brandLink && authenticated) {
    brandLink.setAttribute('href', admin ? '/admin' : '/dashboard');
  }

  const visibleLinks = navigationLinks.filter(({ href }) => {
    if (authenticated) {
      if (admin) {
        return false;
      }

      return authRouteSet.has(href);
    }

    return guestRouteSet.has(href);
  });

  linksContainer.textContent = '';

  visibleLinks.forEach(({ href, label }) => {
    const isActive = href === currentPath;
    const item = document.createElement('li');
    item.className = 'nav-item';
    const link = document.createElement('a');
    link.className = `nav-link${isActive ? ' active' : ''}`;
    link.href = href;
    link.setAttribute('data-link', 'router');
    link.textContent = label;
    item.appendChild(link);
    linksContainer.appendChild(item);
  });

  if (authenticated) {
    if (isImpersonating()) {
      const item = document.createElement('li');
      item.className = 'nav-item';
      const button = document.createElement('button');
      button.className = 'btn btn-link nav-link';
      button.type = 'button';
      button.id = 'header-return-admin-btn';
      button.textContent = 'Return to Admin';
      item.appendChild(button);
      linksContainer.appendChild(item);

      const returnAdminButton = linksContainer.querySelector('#header-return-admin-btn');
      returnAdminButton?.addEventListener('click', () => {
        stopImpersonation();
        navigateToPath('/admin/panel');
      });
    }

    const logoutItem = document.createElement('li');
    logoutItem.className = 'nav-item';
    const logoutButtonNode = document.createElement('button');
    logoutButtonNode.className = 'btn btn-link nav-link';
    logoutButtonNode.type = 'button';
    logoutButtonNode.id = 'header-logout-btn';
    logoutButtonNode.textContent = 'Logout';
    logoutItem.appendChild(logoutButtonNode);
    linksContainer.appendChild(logoutItem);

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
