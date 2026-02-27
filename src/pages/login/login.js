import template from './login.html?raw';
import './login.css';
import { loginWithEmail, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { notifyError } from '../../components/toast/toast.js';

export const renderLoginPage = (container) => {
  if (isAuthenticated()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const form = container.querySelector('#login-form');
  const submitButton = container.querySelector('#login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '').trim();

    if (!email || !password) {
      notifyError('Please enter both email and password.');
      return;
    }

    submitButton.disabled = true;

    const { error } = await loginWithEmail({ email, password });

    submitButton.disabled = false;

    if (error) {
      notifyError(error.message || 'Login failed. Please try again.');
      return;
    }

    navigateTo('/dashboard');
  });
};
