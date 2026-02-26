import { routeMap } from './routes.js';
import { renderHeader } from '../components/header/header.js';

const pageSlot = () => document.getElementById('page-slot');

const normalizePath = (pathname) => {
  if (!pathname) {
    return '/';
  }

  const decodedPath = decodeURIComponent(pathname);

  if (decodedPath === '/admin panel') {
    return '/admin';
  }

  return decodedPath;
};

const renderPlaceholderPage = (path) => {
  pageSlot().innerHTML = `
    <section class="card border-0 shadow-sm">
      <div class="card-body">
        <h1 class="h4 mb-2">Page in progress</h1>
        <p class="mb-0 text-secondary">Route <strong>${path}</strong> is configured, but its page component is not created yet.</p>
      </div>
    </section>
  `;
};

export const renderCurrentRoute = () => {
  const currentPath = normalizePath(window.location.pathname);
  const pageRenderer = routeMap[currentPath];

  if (pageRenderer) {
    pageRenderer(pageSlot());
  } else {
    renderPlaceholderPage(currentPath);
  }

  renderHeader(currentPath);
};

export const navigateTo = (path) => {
  const normalizedPath = normalizePath(path);

  if (window.location.pathname !== normalizedPath) {
    window.history.pushState({}, '', normalizedPath);
  }

  renderCurrentRoute();
};

export const initRouter = () => {
  window.addEventListener('popstate', () => {
    renderCurrentRoute();
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-link="router"]');

    if (!link) {
      return;
    }

    event.preventDefault();
    navigateTo(link.getAttribute('href'));
  });
};
