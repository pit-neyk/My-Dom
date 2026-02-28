import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { initRouter, renderCurrentRoute } from './router/router.js';
import { initAuth } from './features/auth/auth.js';
import { notifyError } from './components/toast/toast.js';
import template from './main.html?raw';

const NON_APP_ERROR_SNIPPETS = [
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
  'message channel closed before a response was received'
];

const toText = (value) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value?.message === 'string') {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isKnownNonAppError = (...candidates) => {
  const combined = candidates
    .map(toText)
    .join(' ')
    .toLowerCase();

  return NON_APP_ERROR_SNIPPETS.some((snippet) => combined.includes(snippet.toLowerCase()));
};

window.addEventListener('unhandledrejection', (event) => {
  if (isKnownNonAppError(event.reason)) {
    event.preventDefault();
    return;
  }

  notifyError('Something went wrong. Please try again.');
  console.error('Unhandled promise rejection:', event.reason);
}, true);

window.addEventListener('error', (event) => {
  if (!isKnownNonAppError(event.message, event.error)) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

const appRoot = document.getElementById('app');

appRoot.innerHTML = template;

renderHeader(window.location.pathname);
renderFooter();
initRouter();

try {
  await initAuth(() => {
    renderCurrentRoute();
  });
} catch (error) {
  notifyError('Failed to initialize authentication. Please refresh and try again.');
  console.error('Failed to initialize auth session:', error);
}

renderCurrentRoute();
