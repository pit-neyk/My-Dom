import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData, formatDateTime } from '../adminState.js';
import template from './events.html?raw';
import rowTemplate from './events-row.html?raw';
import editIconSvg from '../../../assets/icons/edit.svg?raw';
import deleteIconSvg from '../../../assets/icons/delete.svg?raw';
import { fillTemplate } from '../../../lib/template.js';
import './events.css';

export const renderEventsSection = (content) => {
  const rows = state.events
    .map((eventItem) =>
      fillTemplate(rowTemplate, {
        id: eventItem.id,
        title: eventItem.title,
        description: eventItem.description,
        createdAt: formatDateTime(eventItem.created_at),
        editIcon: editIconSvg,
        deleteIcon: deleteIconSvg
      })
    )
    .join('');

  content.innerHTML = template.replace('{{rows}}', rows);

  const eventFormPanel = content.querySelector('#event-form-panel');
  enableTableColumnFilters(content);

  const openEventFormButton = content.querySelector('#open-event-form-btn');
  const form = content.querySelector('#event-form');
  const closeEventFormButton = content.querySelector('#close-event-form-btn');

  content.prepend(eventFormPanel);

  const openEventForm = () => {
    eventFormPanel.classList.remove('d-none');
  };

  openEventFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openEventForm();
  });

  closeEventFormButton.addEventListener('click', () => {
    renderEventsSection(content);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const eventId = payload.id;

    const savePayload = {
      title: payload.title,
      description: payload.description,
      created_by: getCurrentSession()?.user?.id ?? null
    };

    const query = eventId
      ? supabase.from('events').update({ title: savePayload.title, description: savePayload.description }).eq('id', eventId)
      : supabase.from('events').insert(savePayload);

    const { error } = await query;

    if (error) {
      notifyError(error.message || 'Failed to save event.');
      return;
    }

    notifyInfo(eventId ? 'Event updated.' : 'Event created.');
    await loadInitialData();
    renderEventsSection(content);
  });

  content.querySelectorAll('[data-edit-event]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.events.find((eventItem) => eventItem.id === button.dataset.editEvent);
      if (!item) return;

      form.elements.id.value = item.id;
      form.elements.title.value = item.title;
      form.elements.description.value = item.description;
      openEventForm();
    });
  });

  content.querySelectorAll('[data-delete-event]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this event?');
      if (!confirmed) return;

      const { error } = await supabase.from('events').delete().eq('id', button.dataset.deleteEvent);

      if (error) {
        notifyError(error.message || 'Failed to delete event.');
        return;
      }

      notifyInfo('Event deleted.');
      await loadInitialData();
      renderEventsSection(content);
    });
  });
};
