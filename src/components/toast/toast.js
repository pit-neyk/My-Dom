import { Toast } from 'bootstrap';

let toastContainer = null;
export const TOAST_REDIRECT_DELAY_MS = 1000;

const TYPE_CLASS_MAP = {
  info: 'text-bg-primary',
  error: 'text-bg-danger',
  success: 'text-bg-success',
  warning: 'text-bg-warning text-dark'
};

const ensureToastContainer = () => {
  if (toastContainer) {
    return toastContainer;
  }

  const existingContainer = document.getElementById('app-toast-container');

  if (existingContainer) {
    toastContainer = existingContainer;
    return toastContainer;
  }

  toastContainer = document.createElement('div');
  toastContainer.id = 'app-toast-container';
  toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
  toastContainer.style.zIndex = '1090';
  document.body.appendChild(toastContainer);

  return toastContainer;
};

export const showToast = ({
  message,
  title = 'Notification',
  type = 'info',
  delay = 1000
}) => {
  if (!message) {
    return;
  }

  const container = ensureToastContainer();
  const toastElement = document.createElement('div');
  const visualType = TYPE_CLASS_MAP[type] ?? TYPE_CLASS_MAP.info;
  const liveMode = type === 'error' ? 'assertive' : 'polite';

  toastElement.className = `toast border-0 ${visualType}`;
  toastElement.role = 'status';
  toastElement.ariaLive = liveMode;
  toastElement.ariaAtomic = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';
  const titleNode = document.createElement('strong');
  titleNode.className = 'me-1';
  titleNode.textContent = `${title}:`;
  body.append(titleNode, message);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn-close btn-close-white me-2 m-auto';
  closeButton.setAttribute('data-bs-dismiss', 'toast');
  closeButton.setAttribute('aria-label', 'Close');

  wrapper.append(body, closeButton);
  toastElement.appendChild(wrapper);

  container.appendChild(toastElement);

  const toast = new Toast(toastElement, {
    autohide: true,
    delay
  });

  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });

  toast.show();
};

export const notifyError = (message, title = 'Error') => {
  showToast({ message, title, type: 'error', delay: 1000 });
};

export const notifyInfo = (message, title = 'Info') => {
  showToast({ message, title, type: 'info' });
};

export const waitForToastVisibility = (delayMs = TOAST_REDIRECT_DELAY_MS) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
