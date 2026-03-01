import template from './register.html?raw';
import './register.css';
import { registerWithEmail, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { notifyError, notifyInfo, waitForToastVisibility } from '../../components/toast/toast.js';

export const renderRegisterPage = (container) => {
  if (isAuthenticated()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const form = container.querySelector('#register-form');
  const submitButton = container.querySelector('#register-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '').trim();
    const confirmPassword = String(formData.get('confirmPassword') ?? '').trim();

    if (!email || !password || !confirmPassword) {
      notifyError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      notifyError('Password confirmation does not match.');
      return;
    }

    submitButton.disabled = true;

    const { data, error } = await registerWithEmail({ email, password });

    submitButton.disabled = false;

    if (error) {
      notifyError(error.message || 'Registration failed. Please try again.');
      return;
    }

    if (data.session) {
      notifyInfo('User created. Redirecting to dashboard...');
      await waitForToastVisibility();
      navigateTo('/dashboard');
      return;
    }

    notifyInfo('User created. Please check your email to confirm your account, then login.');
    form.reset();
  });
};
