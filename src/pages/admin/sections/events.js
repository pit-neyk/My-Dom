import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { state, loadInitialData, formatDateTime } from '../adminState.js';

export const renderEventsSection = (content) => {
  const rows = state.events
    .map(
      (eventItem) => `
      <tr>
        <td>${eventItem.title}</td>
        <td>${eventItem.description}</td>
        <td>${formatDateTime(eventItem.created_at)}</td>
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-event="${eventItem.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-event="${eventItem.id}">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Events</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-event-form-btn">Create Event</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Title</th><th>Description</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="event-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Create / Edit Event</h3>
        <form id="event-form" class="row g-3">
          <input type="hidden" name="id" />
          <div class="col-12">
            <label class="form-label">Title</label>
            <input class="form-control" name="title" required />
          </div>
          <div class="col-12">
            <label class="form-label">Description</label>
            <textarea class="form-control" name="description" rows="3" required></textarea>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Event</button>
            <button class="btn btn-outline-secondary" type="button" id="close-event-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const eventFormPanel = content.querySelector('#event-form-panel');
  const openEventFormButton = content.querySelector('#open-event-form-btn');
  const form = content.querySelector('#event-form');
  const closeEventFormButton = content.querySelector('#close-event-form-btn');

  content.prepend(eventFormPanel);

  const openEventForm = () => {
    eventFormPanel.classList.remove('d-none');
  };

  const closeEventForm = () => {
    eventFormPanel.classList.add('d-none');
  };

  openEventFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openEventForm();
  });

  closeEventFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    closeEventForm();
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
