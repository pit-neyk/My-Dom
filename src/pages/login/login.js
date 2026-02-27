import template from './login.html?raw';
import './login.css';
import { loginWithEmail, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';

const setFeedback = (feedbackElement, type, message) => {
  feedbackElement.className = `alert mt-3 alert-${type}`;
  feedbackElement.textContent = message;
};

export const renderLoginPage = (container) => {
  if (isAuthenticated()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const form = container.querySelector('#login-form');
  const submitButton = container.querySelector('#login-submit');
  const feedbackElement = container.querySelector('#login-feedback');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '').trim();

    if (!email || !password) {
      setFeedback(feedbackElement, 'danger', 'Please enter both email and password.');
      return;
    }

    submitButton.disabled = true;
    setFeedback(feedbackElement, 'info', 'Signing in...');

    const { error } = await loginWithEmail({ email, password });

    submitButton.disabled = false;

    if (error) {
      setFeedback(feedbackElement, 'danger', error.message || 'Login failed. Please try again.');
      return;
    }

    setFeedback(feedbackElement, 'success', 'Login successful. Redirecting to dashboard...');
    navigateTo('/dashboard');
  });
};
