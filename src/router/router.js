import { routeMap } from './routes.js';
import { renderHeader } from '../components/header/header.js';
import { notifyError } from '../components/toast/toast.js';
import placeholderTemplate from './placeholder.html?raw';
import errorTemplate from './error.html?raw';

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
  pageSlot().innerHTML = placeholderTemplate.replace('{{path}}', path);
};

const renderErrorPage = () => {
  pageSlot().innerHTML = errorTemplate;
};

export const renderCurrentRoute = () => {
  const currentPath = normalizePath(window.location.pathname);
  const pageRenderer = routeMap[currentPath];

  if (!pageRenderer) {
    renderPlaceholderPage(currentPath);
    renderHeader(currentPath);
    return;
  }

  Promise.resolve(pageRenderer(pageSlot())).catch((error) => {
    console.error(`Failed to render route \"${currentPath}\":`, error);
    notifyError('Failed to load page content. Please refresh and try again.');
    renderErrorPage();
  });

  renderHeader(currentPath);
};

export const navigateTo = (path) => {
  const normalizedPath = normalizePath(path);
  const targetUrl = new URL(normalizedPath, window.location.origin);
  const currentUrl = new URL(window.location.href);

  if (
    currentUrl.pathname !== targetUrl.pathname ||
    currentUrl.search !== targetUrl.search ||
    currentUrl.hash !== targetUrl.hash
  ) {
    window.history.pushState({}, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
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
