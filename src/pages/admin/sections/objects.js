import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, getUserDisplay, getOwnerOptions } from '../adminState.js';

const CONTACT_TYPE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'user', label: 'User' },
  { value: 'representative', label: 'Representative' }
];

const isMissingPropertyContactsTableError = (error) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || error?.status === 404;

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

  const propertyContactsRes = await supabase.from('property_contacts').select('*').order('created_at', { ascending: true });

  if (propertyContactsRes.error) {
    if (isMissingPropertyContactsTableError(propertyContactsRes.error)) {
      state.propertyContacts = [];
      state.propertyContactsEnabled = false;
      return;
    }

    throw propertyContactsRes.error;
  }

  state.propertyContacts = propertyContactsRes.data ?? [];
  state.propertyContactsEnabled = true;
};

const getPropertyContacts = (propertyId) =>
  state.propertyContacts.filter((contact) => contact.property_id === propertyId);

const getContactTypeLabel = (type) =>
  CONTACT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;

const getContactFullName = (contact) =>
  [contact.first_name, contact.middle_name, contact.family_name].filter(Boolean).join(' ');

export const renderObjectsSection = (content, options = {}) => {
  const selectedPropertyId = options.selectedPropertyId ?? '';
  const propertyContactsEnabled = state.propertyContactsEnabled !== false;

  const rows = state.objects
    .map((item) => {
      const owner = state.profiles.find((profile) => profile.user_id === item.owner_user_id);
      const contactsCount = propertyContactsEnabled ? getPropertyContacts(item.id).length : '-';

      return `
        <tr>
          <td>${item.number}</td>
          <td>${item.floor}</td>
          <td>${item.square_meters ?? '-'}</td>
          <td>${item.tenants_count}</td>
          <td>${owner ? getUserDisplay(owner) : '-'}</td>
          ${propertyContactsEnabled ? `<td>${contactsCount}</td>` : ''}
          <td class="admin-inline-actions">
            <button type="button" class="btn btn-sm btn-outline-primary" data-edit-object="${item.id}">Edit</button>
            ${propertyContactsEnabled
              ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-manage-contacts="${item.id}">Contacts</button>`
              : ''}
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
          <button class="btn btn-sm btn-primary" type="button" id="open-property-form-btn">Add Property</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Number</th><th>Floor</th><th>Sq m</th><th>Tenants</th><th>Owner</th>${propertyContactsEnabled ? '<th>Contacts</th>' : ''}<th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="property-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3" id="property-form-title">Add Property</h3>
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
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save</button>
            <button class="btn btn-outline-secondary" type="button" id="close-property-form-btn">Cancel</button>
          </div>
        </form>

        ${propertyContactsEnabled ? `
        <div class="mt-4 d-none" id="property-contacts-panel">
          <h4 class="h6 mb-3" id="property-contacts-title">Contacts</h4>
          <form id="property-contact-form" class="row g-3">
            <div class="col-6 col-md-2">
              <label class="form-label">Type</label>
              <select class="form-select" name="contact_type" required>
                ${CONTACT_TYPE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
              </select>
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label">Name</label>
              <input class="form-control" name="first_name" required />
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label">Middle name</label>
              <input class="form-control" name="middle_name" />
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label">Family name</label>
              <input class="form-control" name="family_name" />
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label">Email</label>
              <input class="form-control" name="email" type="email" />
            </div>
            <div class="col-6 col-md-2">
              <label class="form-label">Phone</label>
              <input class="form-control" name="phone" />
            </div>
            <div class="col-12 admin-inline-actions">
              <button class="btn btn-primary" type="submit">Save</button>
              <button class="btn btn-outline-secondary" type="button" id="cancel-property-contact-btn">Cancel</button>
            </div>
          </form>

          <div class="admin-table-wrap table-responsive mt-3">
            <table class="table table-sm align-middle">
              <thead>
                <tr>
                  <th>Type</th><th>Name</th><th>Email</th><th>Phone</th><th>Actions</th>
                </tr>
              </thead>
              <tbody id="property-contacts-table-body"></tbody>
            </table>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  const propertyFormPanel = content.querySelector('#property-form-panel');
  enableTableColumnFilters(content);

  const openPropertyFormButton = content.querySelector('#open-property-form-btn');
  const form = content.querySelector('#object-form');
  const formTitle = content.querySelector('#property-form-title');
  const closeFormButton = content.querySelector('#close-property-form-btn');
  const propertyContactsPanel = content.querySelector('#property-contacts-panel');
  const propertyContactsTitle = content.querySelector('#property-contacts-title');
  const propertyContactForm = content.querySelector('#property-contact-form');
  const cancelPropertyContactButton = content.querySelector('#cancel-property-contact-btn');
  const propertyContactsTableBody = content.querySelector('#property-contacts-table-body');

  let propertyFormMode = 'add';
  let activePropertyId = '';

  content.prepend(propertyFormPanel);

  const syncAddPropertyButtonVisibility = () => {
    const addModeVisible = propertyFormMode === 'add' && !propertyFormPanel.classList.contains('d-none');
    openPropertyFormButton.classList.toggle('d-none', addModeVisible);
  };

  const openForm = () => {
    propertyFormPanel.classList.remove('d-none');
    syncAddPropertyButtonVisibility();
  };

  const closeForm = () => {
    propertyFormPanel.classList.add('d-none');
    syncAddPropertyButtonVisibility();
  };

  const resetPropertyContactForm = () => {
    if (!propertyContactForm) return;
    propertyContactForm.reset();
    propertyContactForm.elements.contact_type.value = CONTACT_TYPE_OPTIONS[0].value;
  };

  const renderPropertyContactsTable = (propertyId) => {
    if (!propertyContactsEnabled || !propertyContactsTableBody) return;

    const contactsRows = getPropertyContacts(propertyId)
      .map(
        (contact) => `
          <tr>
            <td>${getContactTypeLabel(contact.contact_type)}</td>
            <td>${getContactFullName(contact) || '-'}</td>
            <td>${contact.email ?? '-'}</td>
            <td>${contact.phone ?? '-'}</td>
            <td>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-delete-property-contact="${contact.id}"
              >Delete</button>
            </td>
          </tr>
        `
      )
      .join('');

    propertyContactsTableBody.innerHTML = contactsRows || '<tr><td colspan="5" class="text-secondary">No contacts added.</td></tr>';

    propertyContactsTableBody.querySelectorAll('[data-delete-property-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const confirmed = window.confirm('Delete this contact?');
        if (!confirmed) return;

        const { error } = await supabase.from('property_contacts').delete().eq('id', button.dataset.deletePropertyContact);

        if (error) {
          notifyError(error.message || 'Failed to delete contact.');
          return;
        }

        notifyInfo('Contact deleted.');
        try {
          await refreshObjectsAndProfilesData();
        } catch (refreshError) {
          notifyError(refreshError.message || 'Contact deleted, but refresh failed. Please reopen the section.');
          return;
        }

        renderObjectsSection(content, { selectedPropertyId: propertyId });
      });
    });
  };

  const showPropertyContacts = (property) => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTitle) return;

    activePropertyId = property.id;
    propertyContactsTitle.textContent = `Contacts for ${property.number}`;
    propertyContactsPanel.classList.remove('d-none');
    resetPropertyContactForm();
    renderPropertyContactsTable(property.id);
  };

  const hidePropertyContacts = () => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTableBody) return;

    activePropertyId = '';
    propertyContactsPanel.classList.add('d-none');
    resetPropertyContactForm();
    propertyContactsTableBody.innerHTML = '';
  };

  const setFormMode = (mode) => {
    propertyFormMode = mode;
    formTitle.textContent = mode === 'edit' ? 'Edit Property' : 'Add Property';

    if (mode === 'add') {
      hidePropertyContacts();
    }

    syncAddPropertyButtonVisibility();
  };

  const fillPropertyForm = (item) => {
    form.elements.id.value = item.id;
    form.elements.number.value = item.number;
    form.elements.floor.value = item.floor;
    form.elements.owner_user_id.value = item.owner_user_id ?? '';
    form.elements.square_meters.value = item.square_meters ?? '';
    form.elements.tenants_count.value = item.tenants_count ?? 0;
  };

  openPropertyFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    setFormMode('add');
    openForm();
  });

  closeFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    setFormMode('add');
    closeForm();
  });

  if (propertyContactsEnabled && cancelPropertyContactButton) {
    cancelPropertyContactButton.addEventListener('click', () => {
      resetPropertyContactForm();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const objectId = payload.id;

    const savePayload = {
      number: payload.number,
      floor: Number(payload.floor),
      owner_user_id: payload.owner_user_id || null,
      square_meters: payload.square_meters === '' ? null : Number(payload.square_meters),
      tenants_count: payload.tenants_count === '' ? 0 : Number(payload.tenants_count)
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

  if (propertyContactsEnabled && propertyContactForm) {
    propertyContactForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!activePropertyId) {
        notifyError('Save the property first, then add contacts.');
        return;
      }

      const contactPayload = Object.fromEntries(new FormData(propertyContactForm).entries());

      const { error } = await supabase.from('property_contacts').insert({
        property_id: activePropertyId,
        contact_type: contactPayload.contact_type,
        first_name: contactPayload.first_name,
        middle_name: contactPayload.middle_name || null,
        family_name: contactPayload.family_name || null,
        email: contactPayload.email || null,
        phone: contactPayload.phone || null
      });

      if (error) {
        notifyError(error.message || 'Failed to save contact.');
        return;
      }

      notifyInfo('Contact saved.');
      try {
        await refreshObjectsAndProfilesData();
      } catch (refreshError) {
        notifyError(refreshError.message || 'Contact saved, but refresh failed. Please reopen the section.');
        return;
      }

      renderObjectsSection(content, { selectedPropertyId: activePropertyId });
    });
  }

  content.querySelectorAll('[data-edit-object]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.objects.find((obj) => obj.id === button.dataset.editObject);
      if (!item) return;

      fillPropertyForm(item);
      setFormMode('edit');
      openForm();
      showPropertyContacts(item);
    });
  });

  content.querySelectorAll('[data-manage-contacts]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.objects.find((obj) => obj.id === button.dataset.manageContacts);
      if (!item) return;

      fillPropertyForm(item);
      setFormMode('edit');
      openForm();
      showPropertyContacts(item);
    });
  });

  if (selectedPropertyId) {
    const selectedProperty = state.objects.find((item) => item.id === selectedPropertyId);

    if (selectedProperty) {
      fillPropertyForm(selectedProperty);
      setFormMode('edit');
      openForm();
      showPropertyContacts(selectedProperty);
    } else {
      setFormMode('add');
      closeForm();
    }
  } else {
    setFormMode('add');
    closeForm();
  }

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
