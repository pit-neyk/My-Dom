import { routeMap } from './routes.js';
import { renderHeader } from '../components/header/header.js';
import { notifyError } from '../components/toast/toast.js';
import { getCurrentSession } from '../features/auth/auth.js';
import placeholderTemplate from './placeholder.html?raw';
import errorTemplate from './error.html?raw';

const pageSlot = () => document.getElementById('page-slot');
const FORM_DRAFTS_STORAGE_KEY = 'dom_form_drafts_v1';
let currentDomRouteKey = null;

const normalizePath = (pathname) => {
  if (!pathname) {
    return '/';
  }

  const decodedPath = decodeURIComponent(pathname);

  if (decodedPath === '/admin panel') {
    return '/admin';
  }

  return decodedPath;
};

const renderPlaceholderPage = (path) => {
  pageSlot().innerHTML = placeholderTemplate.replace('{{path}}', path);
};

const renderErrorPage = () => {
  pageSlot().innerHTML = errorTemplate;
};

const getCurrentRouteKey = () => `${normalizePath(window.location.pathname)}${window.location.search || ''}`;

const getDraftScopeKey = () => {
  const userId = getCurrentSession()?.user?.id;
  return userId ? `user:${userId}` : 'guest';
};

const getScopedRouteKey = (routeKey) => `${getDraftScopeKey()}::${routeKey}`;

const readDraftStore = () => {
  try {
    const raw = window.sessionStorage.getItem(FORM_DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeDraftStore = (store) => {
  try {
    window.sessionStorage.setItem(FORM_DRAFTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
};

const getFormElements = (form) =>
  Array.from(form.querySelectorAll('input, textarea, select'))
    .filter((element) => {
      if (!element) return false;
      if (element.disabled) return false;
      if (element.tagName === 'INPUT') {
        const inputType = String(element.type || '').toLowerCase();
        if (inputType === 'file' || inputType === 'password' || inputType === 'hidden') {
          return false;
        }
      }

      return Boolean(element.name || element.id);
    });

const serializeElement = (element) => {
  const inputType = String(element.type || '').toLowerCase();

  if (inputType === 'checkbox' || inputType === 'radio') {
    return { checked: element.checked };
  }

  if (element.tagName === 'SELECT' && element.multiple) {
    return {
      value: Array.from(element.options)
        .filter((option) => option.selected)
        .map((option) => option.value)
    };
  }

  return { value: element.value };
};

const restoreElement = (element, serialized) => {
  if (!serialized || typeof serialized !== 'object') {
    return;
  }

  const inputType = String(element.type || '').toLowerCase();

  if (inputType === 'checkbox' || inputType === 'radio') {
    if (typeof serialized.checked === 'boolean') {
      element.checked = serialized.checked;
    }
    return;
  }

  if (element.tagName === 'SELECT' && element.multiple && Array.isArray(serialized.value)) {
    const selectedSet = new Set(serialized.value.map(String));
    Array.from(element.options).forEach((option) => {
      option.selected = selectedSet.has(String(option.value));
    });
    return;
  }

  if (typeof serialized.value === 'string') {
    element.value = serialized.value;
  }
};

const captureRouteFormDrafts = () => {
  const slot = pageSlot();
  if (!slot) {
    return;
  }

  const forms = Array.from(slot.querySelectorAll('form'));
  if (!forms.length) {
    return;
  }

  const drafts = forms.map((form, formIndex) => {
    const fields = {};
    const seenByBaseKey = new Map();

    getFormElements(form).forEach((element) => {
      const baseKey = `${element.tagName.toLowerCase()}|${element.name || ''}|${element.id || ''}`;
      const nextOccurrence = (seenByBaseKey.get(baseKey) ?? 0) + 1;
      seenByBaseKey.set(baseKey, nextOccurrence);
      const fieldKey = `${baseKey}|${nextOccurrence}`;

      fields[fieldKey] = serializeElement(element);
    });

    return {
      formId: form.id || '',
      formIndex,
      fields
    };
  });

  const routeKey = getScopedRouteKey(getCurrentRouteKey());
  const store = readDraftStore();
  store[routeKey] = drafts;
  writeDraftStore(store);
};

const restoreRouteFormDrafts = (routeKey) => {
  const slot = pageSlot();
  if (!slot) {
    return;
  }

  const store = readDraftStore();
  const drafts = store[routeKey];
  if (!Array.isArray(drafts) || !drafts.length) {
    return;
  }

  const forms = Array.from(slot.querySelectorAll('form'));
  if (!forms.length) {
    return;
  }

  drafts.forEach((draft) => {
    let form = null;
    if (draft.formId) {
      form = slot.querySelector(`#${CSS.escape(draft.formId)}`);
    }

    if (!form && Number.isInteger(draft.formIndex)) {
      form = forms[draft.formIndex] ?? null;
    }

    if (!form || !draft.fields || typeof draft.fields !== 'object') {
      return;
    }

    const seenByBaseKey = new Map();

    getFormElements(form).forEach((element) => {
      const baseKey = `${element.tagName.toLowerCase()}|${element.name || ''}|${element.id || ''}`;
      const nextOccurrence = (seenByBaseKey.get(baseKey) ?? 0) + 1;
      seenByBaseKey.set(baseKey, nextOccurrence);
      const fieldKey = `${baseKey}|${nextOccurrence}`;

      restoreElement(element, draft.fields[fieldKey]);
    });
  });
};

export const renderCurrentRoute = () => {
  const currentPath = normalizePath(window.location.pathname);
  const routeKey = getScopedRouteKey(getCurrentRouteKey());

  if (currentDomRouteKey === routeKey) {
    captureRouteFormDrafts();
  }

  const pageRenderer = routeMap[currentPath];

  if (!pageRenderer) {
    renderPlaceholderPage(currentPath);
    renderHeader(currentPath);
    return;
  }

  Promise.resolve(pageRenderer(pageSlot()))
    .then(() => {
      restoreRouteFormDrafts(routeKey);
      currentDomRouteKey = routeKey;
    })
    .catch((error) => {
      console.error(`Failed to render route \"${currentPath}\":`, error);
      notifyError('Failed to load page content. Please refresh and try again.');
      renderErrorPage();
    });

  renderHeader(currentPath);
};

export const navigateTo = (path) => {
  captureRouteFormDrafts();

  const normalizedPath = normalizePath(path);
  const targetUrl = new URL(normalizedPath, window.location.origin);
  const currentUrl = new URL(window.location.href);

  if (
    currentUrl.pathname !== targetUrl.pathname ||
    currentUrl.search !== targetUrl.search ||
    currentUrl.hash !== targetUrl.hash
  ) {
    window.history.pushState({}, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
  }

  renderCurrentRoute();
};

export const initRouter = () => {
  window.addEventListener('popstate', () => {
    renderCurrentRoute();
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-link="router"]');

    if (!link) {
      return;
    }

    event.preventDefault();
    navigateTo(link.getAttribute('href'));
  });
};
