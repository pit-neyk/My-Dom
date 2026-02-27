import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { initRouter, renderCurrentRoute } from './router/router.js';
import { initAuth } from './features/auth/auth.js';

const NON_APP_REJECTION_SNIPPET =
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received';

window.addEventListener('unhandledrejection', (event) => {
  const reasonMessage = String(event.reason?.message ?? event.reason ?? '');

  if (reasonMessage.includes(NON_APP_REJECTION_SNIPPET)) {
    event.preventDefault();
    return;
  }

  console.error('Unhandled promise rejection:', event.reason);
});

const appRoot = document.getElementById('app');

appRoot.innerHTML = `
  <div class="app-shell d-flex flex-column min-vh-100">
    <header id="header-slot"></header>
    <main id="page-slot" class="container py-4 flex-grow-1"></main>
    <footer id="footer-slot"></footer>
  </div>
`;

renderHeader(window.location.pathname);
renderFooter();
initRouter();

try {
  await initAuth(() => {
    renderCurrentRoute();
  });
} catch (error) {
  console.error('Failed to initialize auth session:', error);
}

renderCurrentRoute();
