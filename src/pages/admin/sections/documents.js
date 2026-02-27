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
          <button type="button" class="btn btn-sm btn-outline-primary" data-open-doc="${doc.id}">Open</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-doc="${doc.id}">Delete</button>
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
