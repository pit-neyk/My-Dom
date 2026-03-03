import './documents.css';
import template from './documents.html?raw';
import { isAuthenticated, isAdmin, isImpersonating } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError } from '../../components/toast/toast.js';

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const renderEmpty = (tableBody, text) => {
  tableBody.innerHTML = `<tr><td colspan="3" class="text-secondary">${text}</td></tr>`;
};

export const renderDocumentsPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (isAdmin() && !isImpersonating()) {
    navigateTo('/admin');
    return;
  }

  container.innerHTML = template;

  const tableBody = container.querySelector('#documents-table-body');
  if (!tableBody) {
    return;
  }

  const { data: documents, error } = await supabase
    .from('documents')
    .select('id,name,storage_path,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    notifyError(error.message || 'Failed to load documents.');
    renderEmpty(tableBody, 'Unable to load documents.');
    return;
  }

  const safeDocuments = documents ?? [];

  if (!safeDocuments.length) {
    renderEmpty(tableBody, 'No documents shared yet.');
    return;
  }

  tableBody.innerHTML = safeDocuments
    .map((document) => `
      <tr>
        <td>${document.name}</td>
        <td>${formatDateTime(document.created_at)}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-primary" data-download-doc="${document.id}">Download</button>
        </td>
      </tr>
    `)
    .join('');

  tableBody.querySelectorAll('[data-download-doc]').forEach((button) => {
    button.addEventListener('click', async () => {
      const docId = button.getAttribute('data-download-doc');
      const document = safeDocuments.find((item) => item.id === docId);

      if (!document) {
        notifyError('Document not found.');
        return;
      }

      const { data, error: signedUrlError } = await supabase
        .storage
        .from('building-documents')
        .createSignedUrl(document.storage_path, 120);

      if (signedUrlError || !data?.signedUrl) {
        notifyError(signedUrlError?.message || 'Failed to download document.');
        return;
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    });
  });
};
