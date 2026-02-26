import template from './header.html?raw';
import './header.css';
import { getRouteTitle, navigationLinks } from '../../router/routes.js';

const headerSlot = () => document.getElementById('header-slot');

export const renderHeader = (currentPath = '/') => {
  const slot = headerSlot();

  if (!slot) {
    return;
  }

  slot.innerHTML = template;

  const linksContainer = slot.querySelector('#header-nav-links');

  linksContainer.innerHTML = navigationLinks
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

  const pageTitle = getRouteTitle(currentPath);
  document.title = pageTitle ? `${pageTitle} | DOM` : 'DOM';
};
