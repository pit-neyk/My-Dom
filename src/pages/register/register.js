import template from './register.html?raw';
import './register.css';
import { registerWithEmail, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';

const setFeedback = (feedbackElement, type, message) => {
  feedbackElement.className = `alert mt-3 alert-${type}`;
  feedbackElement.textContent = message;
};

export const renderRegisterPage = (container) => {
  if (isAuthenticated()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const form = container.querySelector('#register-form');
  const submitButton = container.querySelector('#register-submit');
  const feedbackElement = container.querySelector('#register-feedback');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '').trim();
    const confirmPassword = String(formData.get('confirmPassword') ?? '').trim();

    if (!email || !password || !confirmPassword) {
      setFeedback(feedbackElement, 'danger', 'Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setFeedback(feedbackElement, 'danger', 'Password confirmation does not match.');
      return;
    }

    submitButton.disabled = true;
    setFeedback(feedbackElement, 'info', 'Creating account...');

    const { data, error } = await registerWithEmail({ email, password });

    submitButton.disabled = false;

    if (error) {
      setFeedback(feedbackElement, 'danger', error.message || 'Registration failed. Please try again.');
      return;
    }

    if (data.session) {
      setFeedback(feedbackElement, 'success', 'Registration successful. Redirecting to dashboard...');
      navigateTo('/dashboard');
      return;
    }

    setFeedback(
      feedbackElement,
      'success',
      'Registration successful. Please check your email to confirm your account, then login.'
    );
    form.reset();
  });
};
