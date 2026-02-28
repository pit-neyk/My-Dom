import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData, formatDateTime } from '../adminState.js';
import template from './documents.html?raw';

export const renderDocumentsSection = (content) => {
  const rows = state.documents
    .map(
      (doc) => `
      <tr>
        <td>${doc.name}</td>
        <td>${formatDateTime(doc.created_at)}</td>
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-open-doc="${doc.id}" aria-label="Open document ${doc.name}" title="Open">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8"/>
              <path d="M8 11c-1.657 0-3-1.12-3-2.5S6.343 6 8 6s3 1.12 3 2.5S9.657 11 8 11m0-1c1.105 0 2-.672 2-1.5S9.105 7 8 7s-2 .672-2 1.5S6.895 10 8 10"/>
            </svg>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-doc="${doc.id}" aria-label="Delete document ${doc.name}" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0A.5.5 0 0 1 8.5 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
              <path d="M14 3a1 1 0 0 1-1 1h-.538l-.853 10.66A2 2 0 0 1 9.615 16h-3.23a2 2 0 0 1-1.994-1.34L3.538 4H3a1 1 0 1 1 0-2h3.086a1 1 0 0 1 .707-.293h2.414a1 1 0 0 1 .707.293H13a1 1 0 0 1 1 1m-9.46 1 .84 10.5a1 1 0 0 0 .997.5h3.246a1 1 0 0 0 .997-.5l.84-10.5z"/>
            </svg>
          </button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = template.replace('{{rows}}', rows);

  const documentFormPanel = content.querySelector('#document-form-panel');
  enableTableColumnFilters(content);

  const openDocumentFormButton = content.querySelector('#open-document-form-btn');
  const form = content.querySelector('#document-form');
  const closeDocumentFormButton = content.querySelector('#close-document-form-btn');

  content.prepend(documentFormPanel);

  openDocumentFormButton.addEventListener('click', () => {
    form.reset();
    documentFormPanel.classList.remove('d-none');
  });

  closeDocumentFormButton.addEventListener('click', () => {
    form.reset();
    documentFormPanel.classList.add('d-none');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const file = form.elements.file.files[0];

    if (!file) {
      notifyError('Choose a file to upload.');
      return;
    }

    const userId = getCurrentSession()?.user?.id;
    const path = `${userId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage.from('building-documents').upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });

    if (uploadError) {
      notifyError(uploadError.message || 'Failed to upload document.');
      return;
    }

    const { error: insertError } = await supabase.from('documents').insert({
      name: file.name,
      storage_path: path,
      uploaded_by: userId
    });

    if (insertError) {
      notifyError(insertError.message || 'Failed to save document metadata.');
      return;
    }

    notifyInfo('Document uploaded and shared.');
    await loadInitialData();
    renderDocumentsSection(content);
  });

  content.querySelectorAll('[data-open-doc]').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = state.documents.find((item) => item.id === button.dataset.openDoc);
      if (!doc) return;

      const { data, error } = await supabase.storage.from('building-documents').createSignedUrl(doc.storage_path, 60);

      if (error) {
        notifyError(error.message || 'Failed to open document.');
        return;
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    });
  });

  content.querySelectorAll('[data-delete-doc]').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = state.documents.find((item) => item.id === button.dataset.deleteDoc);
      if (!doc) return;

      const confirmed = window.confirm('Delete this document?');
      if (!confirmed) return;

      const { error: storageError } = await supabase.storage.from('building-documents').remove([doc.storage_path]);
      if (storageError) {
        notifyError(storageError.message || 'Failed to delete document file.');
        return;
      }

      const { error: dbError } = await supabase.from('documents').delete().eq('id', doc.id);
      if (dbError) {
        notifyError(dbError.message || 'Failed to delete document record.');
        return;
      }

      notifyInfo('Document deleted.');
      await loadInitialData();
      renderDocumentsSection(content);
    });
  });
};
