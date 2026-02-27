import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData, formatDateTime } from '../adminState.js';

export const renderMassMessagesSection = (content) => {
  const rows = state.messages
    .map(
      (msg) => `
      <tr>
        <td>${msg.title}</td>
        <td>${msg.content_html}</td>
        <td>${formatDateTime(msg.created_at)}</td>
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-msg="${msg.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-msg="${msg.id}">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Mass Messages</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-mass-message-form-btn">Create Message</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Title</th><th>Message</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="mass-message-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Create / Edit Mass Message</h3>
        <form id="mass-message-form" class="row g-3">
          <input type="hidden" name="id" />
          <div class="col-12">
            <label class="form-label">Title</label>
            <input class="form-control" name="title" required />
          </div>
          <div class="col-12">
            <label class="form-label">Message</label>
            <textarea class="form-control" name="content_html" rows="4" required></textarea>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Message</button>
            <button class="btn btn-outline-secondary" type="button" id="close-mass-message-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const massMessageFormPanel = content.querySelector('#mass-message-form-panel');
  enableTableColumnFilters(content);

  const openMassMessageFormButton = content.querySelector('#open-mass-message-form-btn');
  const form = content.querySelector('#mass-message-form');
  const closeMassMessageFormButton = content.querySelector('#close-mass-message-form-btn');

  content.prepend(massMessageFormPanel);

  const openMassMessageForm = () => {
    massMessageFormPanel.classList.remove('d-none');
  };

  const closeMassMessageForm = () => {
    massMessageFormPanel.classList.add('d-none');
  };

  openMassMessageFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openMassMessageForm();
  });

  closeMassMessageFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    closeMassMessageForm();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const messageId = payload.id;

    const savePayload = {
      title: payload.title,
      content_html: payload.content_html,
      created_by: getCurrentSession()?.user?.id ?? null
    };

    const query = messageId
      ? supabase
          .from('mass_messages')
          .update({ title: savePayload.title, content_html: savePayload.content_html })
          .eq('id', messageId)
      : supabase.from('mass_messages').insert(savePayload);

    const { error } = await query;

    if (error) {
      notifyError(error.message || 'Failed to save mass message.');
      return;
    }

    notifyInfo(messageId ? 'Mass message updated.' : 'Mass message created.');
    await loadInitialData();
    renderMassMessagesSection(content);
  });

  content.querySelectorAll('[data-edit-msg]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.messages.find((msg) => msg.id === button.dataset.editMsg);
      if (!item) return;

      form.elements.id.value = item.id;
      form.elements.title.value = item.title;
      form.elements.content_html.value = item.content_html;
      openMassMessageForm();
    });
  });

  content.querySelectorAll('[data-delete-msg]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this mass message?');
      if (!confirmed) return;

      const { error } = await supabase.from('mass_messages').delete().eq('id', button.dataset.deleteMsg);

      if (error) {
        notifyError(error.message || 'Failed to delete mass message.');
        return;
      }

      notifyInfo('Mass message deleted.');
      await loadInitialData();
      renderMassMessagesSection(content);
    });
  });
};
