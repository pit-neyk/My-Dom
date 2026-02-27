import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, getUserDisplay, getOwnerOptions } from '../adminState.js';

const refreshObjectsAndProfilesData = async () => {
  const [objectsRes, profilesRes] = await Promise.all([
    supabase.from('properties').select('*').order('number'),
    supabase.from('profiles').select('*').order('full_name', { ascending: true, nullsFirst: false })
  ]);

  if (objectsRes.error) {
    throw objectsRes.error;
  }

  if (profilesRes.error) {
    throw profilesRes.error;
  }

  state.objects = objectsRes.data ?? [];
  state.profiles = profilesRes.data ?? [];
};

export const renderObjectsSection = (content) => {
  const rows = state.objects
    .map((item) => {
      const owner = state.profiles.find((profile) => profile.user_id === item.owner_user_id);
      return `
        <tr>
          <td>${item.number}</td>
          <td>${item.floor}</td>
          <td>${item.square_meters ?? '-'}</td>
          <td>${item.tenants_count}</td>
          <td>${owner ? getUserDisplay(owner) : '-'}</td>
          <td>${item.contact_email ?? '-'}</td>
          <td>${item.contact_phone ?? '-'}</td>
          <td class="admin-inline-actions">
            <button type="button" class="btn btn-sm btn-outline-primary" data-edit-object="${item.id}">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete-object="${item.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">All Properties</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-property-form-btn">Create Property</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Number</th><th>Floor</th><th>Sq m</th><th>Tenants</th><th>Owner</th><th>Email</th><th>Phone</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="property-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Create / Edit Property</h3>
        <form id="object-form" class="row g-3">
          <input type="hidden" name="id" />
          <div class="col-6">
            <label class="form-label">Property Number</label>
            <input class="form-control" name="number" required />
          </div>
          <div class="col-6">
            <label class="form-label">Floor</label>
            <input class="form-control" name="floor" type="number" min="0" required />
          </div>
          <div class="col-6">
            <label class="form-label">Owner</label>
            <select class="form-select" name="owner_user_id">${getOwnerOptions()}</select>
          </div>
          <div class="col-6">
            <label class="form-label">Square meters</label>
            <input class="form-control" name="square_meters" type="number" min="0" step="0.01" />
          </div>
          <div class="col-6">
            <label class="form-label">Tenants count</label>
            <input class="form-control" name="tenants_count" type="number" min="0" />
          </div>
          <div class="col-6">
            <label class="form-label">Contact Email</label>
            <input class="form-control" name="contact_email" type="email" />
          </div>
          <div class="col-6">
            <label class="form-label">Contact Phone</label>
            <input class="form-control" name="contact_phone" />
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Property</button>
            <button class="btn btn-outline-secondary" type="button" id="object-form-reset">Reset</button>
            <button class="btn btn-outline-secondary" type="button" id="close-property-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const propertyFormPanel = content.querySelector('#property-form-panel');
  enableTableColumnFilters(content);

  const openPropertyFormButton = content.querySelector('#open-property-form-btn');
  const form = content.querySelector('#object-form');
  const resetBtn = content.querySelector('#object-form-reset');
  const closeFormButton = content.querySelector('#close-property-form-btn');

  content.prepend(propertyFormPanel);

  const openForm = () => {
    propertyFormPanel.classList.remove('d-none');
  };

  const closeForm = () => {
    propertyFormPanel.classList.add('d-none');
  };

  openPropertyFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openForm();
  });

  closeFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    closeForm();
  });

  resetBtn.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const objectId = payload.id;

    const savePayload = {
      number: payload.number,
      floor: Number(payload.floor),
      owner_user_id: payload.owner_user_id || null,
      square_meters: payload.square_meters === '' ? null : Number(payload.square_meters),
      tenants_count: payload.tenants_count === '' ? 0 : Number(payload.tenants_count),
      contact_email: payload.contact_email || null,
      contact_phone: payload.contact_phone || null
    };

    const query = objectId
      ? supabase.from('properties').update(savePayload).eq('id', objectId)
      : supabase.from('properties').insert(savePayload);

    const { error } = await query;

    if (error) {
      notifyError(error.message || 'Failed to save property.');
      return;
    }

    notifyInfo(objectId ? 'Property updated.' : 'Property created.');
    try {
      await refreshObjectsAndProfilesData();
    } catch (refreshError) {
      notifyError(refreshError.message || 'Property saved, but refresh failed. Please reopen the section.');
      return;
    }
    renderObjectsSection(content);
  });

  content.querySelectorAll('[data-edit-object]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.objects.find((obj) => obj.id === button.dataset.editObject);
      if (!item) return;

      form.elements.id.value = item.id;
      form.elements.number.value = item.number;
      form.elements.floor.value = item.floor;
      form.elements.owner_user_id.value = item.owner_user_id ?? '';
      form.elements.square_meters.value = item.square_meters;
      form.elements.tenants_count.value = item.tenants_count;
      form.elements.contact_email.value = item.contact_email ?? '';
      form.elements.contact_phone.value = item.contact_phone ?? '';
      openForm();
    });
  });

  content.querySelectorAll('[data-delete-object]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this property?');
      if (!confirmed) return;

      const { error } = await supabase.from('properties').delete().eq('id', button.dataset.deleteObject);

      if (error) {
        notifyError(error.message || 'Failed to delete property.');
        return;
      }

      notifyInfo('Property deleted.');
      try {
        await refreshObjectsAndProfilesData();
      } catch (refreshError) {
        notifyError(refreshError.message || 'Property deleted, but refresh failed. Please reopen the section.');
        return;
      }
      renderObjectsSection(content);
    });
  });
};
