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
import { clearViewState, readViewState, writeViewState } from '../../../../lib/view-state.js';
import './messages.css';

const MESSAGES_VIEW_STATE_KEY = 'admin_messages_section_state';

export const renderMassMessagesSection = (content) => {
  const viewState = readViewState(MESSAGES_VIEW_STATE_KEY, {
    formOpen: false,
    editingMessageId: ''
  });

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
    writeViewState(MESSAGES_VIEW_STATE_KEY, { formOpen: true });
  };

  const closeMassMessageForm = () => {
    clearViewState(MESSAGES_VIEW_STATE_KEY);
    renderMassMessagesSection(content);
  };

  openMassMessageFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    writeViewState(MESSAGES_VIEW_STATE_KEY, {
      formOpen: true,
      editingMessageId: ''
    });
    openMassMessageForm();
  });

  closeMassMessageFormButton.addEventListener('click', closeMassMessageForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const messageId = payload.id;
    const existingMessage = messageId
      ? state.messages.find((msg) => msg.id === messageId) ?? null
      : null;

    if (existingMessage) {
      const titleUnchanged = String(existingMessage.title ?? '').trim() === String(payload.title ?? '').trim();
      const contentUnchanged = String(existingMessage.content_html ?? '').trim() === String(payload.content_html ?? '').trim();
      if (titleUnchanged && contentUnchanged) {
        clearViewState(MESSAGES_VIEW_STATE_KEY);
        renderMassMessagesSection(content);
        return;
      }
    }

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
    clearViewState(MESSAGES_VIEW_STATE_KEY);
    renderMassMessagesSection(content);
  });

  content.querySelectorAll('[data-edit-msg]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.messages.find((msg) => msg.id === button.dataset.editMsg);
      if (!item) return;

      form.elements.id.value = item.id;
      form.elements.title.value = item.title;
      form.elements.content_html.value = item.content_html;
      writeViewState(MESSAGES_VIEW_STATE_KEY, {
        formOpen: true,
        editingMessageId: item.id
      });
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
      clearViewState(MESSAGES_VIEW_STATE_KEY);
      renderMassMessagesSection(content);
    });
  });

  if (viewState.formOpen) {
    if (viewState.editingMessageId) {
      const item = state.messages.find((msg) => msg.id === viewState.editingMessageId);
      if (item) {
        form.elements.id.value = item.id;
        form.elements.title.value = item.title;
        form.elements.content_html.value = item.content_html;
        openMassMessageForm();
      } else {
        clearViewState(MESSAGES_VIEW_STATE_KEY);
      }
    } else {
      openMassMessageForm();
    }
  }
};
