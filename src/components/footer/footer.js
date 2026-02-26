import template from './footer.html?raw';
import './footer.css';

export const renderFooter = () => {
  const slot = document.getElementById('footer-slot');

  if (!slot) {
    return;
  }

  slot.innerHTML = template;
};
