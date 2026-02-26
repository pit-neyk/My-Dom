import template from './home.html?raw';
import './home.css';

export const renderHomePage = (container) => {
  container.innerHTML = `<div class="home-page">${template}</div>`;
};
