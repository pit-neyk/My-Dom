import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { initRouter, renderCurrentRoute } from './router/router.js';
import { initAuth } from './features/auth/auth.js';

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
await initAuth(() => {
  renderCurrentRoute();
});
renderCurrentRoute();
