import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../../components/table-filters/table-filters.js';
import { getCurrentSession } from '../../../../features/auth/auth.js';
import { state, loadInitialData, formatDateTime } from '../../adminState.js';
import template from './messages.html?raw';
import rowTemplate from './messages-row.html?raw';
import editIconSvg from '../../../../assets/icons/edit.svg?raw';
import deleteIconSvg from '../../../../assets/icons/delete.svg?raw';
import { fillTemplate } from '../../../../lib/template.js';
import './messages.css';

export const renderMassMessagesSection = (content) => {
  const rows = state.messages
    .map((msg) =>
      fillTemplate(rowTemplate, {
        id: msg.id,
        title: msg.title,
        contentHtml: msg.content_html,
        createdAt: formatDateTime(msg.created_at),
        editIcon: editIconSvg,
        deleteIcon: deleteIconSvg
      })
    )
    .join('');

  content.innerHTML = template.replace('{{rows}}', rows);

  const massMessageFormPanel = content.querySelector('#mass-message-form-panel');
  enableTableColumnFilters(content);

  const openMassMessageFormButton = content.querySelector('#open-mass-message-form-btn');
  const form = content.querySelector('#mass-message-form');
  const closeMassMessageFormButton = content.querySelector('#close-mass-message-form-btn');

  content.prepend(massMessageFormPanel);

  const openMassMessageForm = () => {
    massMessageFormPanel.classList.remove('d-none');
  };

  openMassMessageFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openMassMessageForm();
  });

  closeMassMessageFormButton.addEventListener('click', () => {
    renderMassMessagesSection(content);
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
      notifyError(error.message || 'Failed to save message.');
      return;
    }

    notifyInfo(messageId ? 'Message updated.' : 'Message created.');
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
      const confirmed = window.confirm('Delete this message?');
      if (!confirmed) return;

      const { error } = await supabase.from('mass_messages').delete().eq('id', button.dataset.deleteMsg);

      if (error) {
        notifyError(error.message || 'Failed to delete message.');
        return;
      }

      notifyInfo('Message deleted.');
      await loadInitialData();
      renderMassMessagesSection(content);
    });
  });
};
