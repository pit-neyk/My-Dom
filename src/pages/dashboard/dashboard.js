import template from './dashboard.html?raw';
import './dashboard.css';

export const renderDashboardPage = (container) => {
  container.innerHTML = `<div class="dashboard-page">${template}</div>`;
};
