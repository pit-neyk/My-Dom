import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, getUserDisplay } from '../adminState.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const CONTACT_TYPE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'user', label: 'User' },
  { value: 'representative', label: 'Representative' }
];

const PROPERTY_TYPE_OPTIONS = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'office', label: 'Office' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'parking', label: 'Parking' },
  { value: 'garage', label: 'Garage' },
  { value: 'shop', label: 'Shop' },
  { value: 'studio', label: 'Studio' }
];

const PROPERTY_SORT_OPTIONS = [
  { value: 'number_asc', label: 'Number: Ascending' },
  { value: 'number_desc', label: 'Number: Descending' },
  { value: 'floor_asc', label: 'Floor: Ascending' },
  { value: 'floor_desc', label: 'Floor: Descending' },
  { value: 'property_type_asc', label: 'Type: Ascending' },
  { value: 'property_type_desc', label: 'Type: Descending' },
  { value: 'square_meters_asc', label: 'Sq m: Ascending' },
  { value: 'square_meters_desc', label: 'Sq m: Descending' },
  { value: 'tenants_count_asc', label: 'Inhabitants: Ascending' },
  { value: 'tenants_count_desc', label: 'Inhabitants: Descending' },
  { value: 'pets_count_asc', label: 'Animals: Ascending' },
  { value: 'pets_count_desc', label: 'Animals: Descending' },
  { value: 'ideal_parts_asc', label: 'Ideal parts: Ascending' },
  { value: 'ideal_parts_desc', label: 'Ideal parts: Descending' },
  { value: 'owner_asc', label: 'Owner: Ascending' },
  { value: 'owner_desc', label: 'Owner: Descending' },
  { value: 'contacts_asc', label: 'Contacts: Ascending' },
  { value: 'contacts_desc', label: 'Contacts: Descending' }
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

const editIconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12.854.146a.5.5 0 0 1 .707 0l2.586 2.586a.5.5 0 0 1 0 .707L6.207 13.379a.5.5 0 0 1-.168.11l-4 1.5a.5.5 0 0 1-.643-.643l1.5-4a.5.5 0 0 1 .11-.168zM11.5 1.207 2.561 10.146l-.96 2.56 2.56-.96L13.1 2.807z"/>
  </svg>
`;

const deleteIconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0A.5.5 0 0 1 8.5 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
    <path d="M14 3a1 1 0 0 1-1 1h-.538l-.853 10.66A2 2 0 0 1 9.615 16h-3.23a2 2 0 0 1-1.994-1.34L3.538 4H3a1 1 0 1 1 0-2h3.086a1 1 0 0 1 .707-.293h2.414a1 1 0 0 1 .707.293H13a1 1 0 0 1 1 1m-9.46 1 .84 10.5a1 1 0 0 0 .997.5h3.246a1 1 0 0 0 .997-.5l.84-10.5z"/>
  </svg>
`;

export const renderObjectsSection = (content, options = {}) => {
  const selectedPropertyId = options.selectedPropertyId ?? '';
  const sortBy = options.sortBy ?? 'number_asc';
  const propertyContactsEnabled = state.propertyContactsEnabled !== false;

  const rowsData = state.objects.map((item) => {
    const owner = state.profiles.find((profile) => profile.user_id === item.owner_user_id);
    return {
      item,
      ownerName: owner ? getUserDisplay(owner) : '-',
      contactsCount: propertyContactsEnabled ? getPropertyContacts(item.id).length : 0
    };
  });

  const getSortableValue = (row, field) => {
    if (field === 'owner') return row.ownerName;
    if (field === 'contacts') return row.contactsCount;
    return row.item[field];
  };

  const sortRowsData = (rows, sortValue) => {
    const normalizedSort = String(sortValue);
    const separatorIndex = normalizedSort.lastIndexOf('_');
    const field = separatorIndex >= 0 ? normalizedSort.slice(0, separatorIndex) : normalizedSort;
    const direction = separatorIndex >= 0 ? normalizedSort.slice(separatorIndex + 1) : 'asc';
    const directionFactor = direction === 'desc' ? -1 : 1;

    return [...rows].sort((left, right) => {
      const leftValue = getSortableValue(left, field);
      const rightValue = getSortableValue(right, field);
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const areNumbers = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber);

      if (areNumbers) {
        return (leftNumber - rightNumber) * directionFactor;
      }

      return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      }) * directionFactor;
    });
  };

  const sortedRowsData = sortRowsData(rowsData, sortBy);

  const rows = sortedRowsData
    .map(({ item, ownerName, contactsCount }) => `
      <tr>
        <td>${item.number}</td>
        <td>${item.floor}</td>
        <td>${item.square_meters ?? '-'}</td>
        <td>${item.tenants_count ?? 0}</td>
        <td>${ownerName}</td>
        ${propertyContactsEnabled ? `<td>${contactsCount}</td>` : ''}
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-object="${item.id}" aria-label="Edit property ${item.number}" title="Edit">${editIconSvg}</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-object="${item.id}" aria-label="Delete property ${item.number}" title="Delete">${deleteIconSvg}</button>
        </td>
      </tr>
    `)
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card" id="properties-list-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">All Properties</h3>
          <div class="admin-inline-actions">
            <label class="visually-hidden" for="property-sort-select">Sort properties</label>
            <select class="form-select form-select-sm" id="property-sort-select" aria-label="Sort properties">
              ${PROPERTY_SORT_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === sortBy ? 'selected' : ''}>${option.label}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline-secondary" type="button" id="download-properties-xlsx-btn">XLSX</button>
            <button class="btn btn-sm btn-outline-secondary" type="button" id="download-properties-pdf-btn">PDF</button>
            <button class="btn btn-sm btn-primary" type="button" id="open-property-form-btn">Add Property</button>
          </div>
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
          <div class="col-12 col-md-4">
            <label class="form-label">Floor</label>
            <input class="form-control" name="floor" type="number" min="0" required />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Property Number</label>
            <input class="form-control" name="number" required />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Property Type</label>
            <select class="form-select" name="property_type">
              <option value="">Select type</option>
              ${PROPERTY_TYPE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
            </select>
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Inhabitants</label>
            <input class="form-control" name="tenants_count" type="number" min="0" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Animals</label>
            <input class="form-control" name="pets_count" type="number" min="0" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Built area</label>
            <input class="form-control" name="square_meters" type="number" min="0" step="0.01" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Ideal parts</label>
            <input class="form-control" name="ideal_parts" type="number" min="0" step="0.001" />
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save</button>
            <button class="btn btn-outline-secondary" type="button" id="close-property-form-btn">Cancel</button>
          </div>
        </form>

        ${propertyContactsEnabled ? `
          <div class="mt-4 d-none" id="property-contacts-panel">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h4 class="h6 mb-0" id="property-contacts-title">Contacts</h4>
              <button class="btn btn-sm btn-outline-secondary" type="button" id="open-property-contact-form-btn">+ Add Contact</button>
            </div>

            <div id="property-contacts-list" class="d-flex flex-column gap-3 mb-3"></div>

            <form id="property-contact-form" class="row g-3 d-none">
              <div class="col-12 col-md-3">
                <label class="form-label">Name</label>
                <input class="form-control" name="first_name" required />
              </div>
              <div class="col-12 col-md-3">
                <label class="form-label">Family name</label>
                <input class="form-control" name="family_name" />
              </div>
              <div class="col-12 col-md-3">
                <label class="form-label">Email</label>
                <input class="form-control" name="email" type="email" />
              </div>
              <div class="col-12 col-md-3">
                <label class="form-label">Phone</label>
                <input class="form-control" name="phone" />
              </div>
              <div class="col-12 col-md-4">
                <label class="form-label">Type</label>
                <select class="form-select" name="contact_type" required>
                  ${CONTACT_TYPE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
                </select>
              </div>
              <div class="col-12 col-md-4">
                <label class="form-label">Start period</label>
                <input class="form-control" name="start_date" type="date" />
              </div>
              <div class="col-12 col-md-4">
                <label class="form-label">End period</label>
                <input class="form-control" name="end_date" type="date" />
              </div>
              <div class="col-12 admin-inline-actions">
                <button class="btn btn-primary" type="submit">Save</button>
                <button class="btn btn-outline-secondary" type="button" id="cancel-property-contact-btn">Cancel</button>
              </div>
            </form>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const propertyFormPanel = content.querySelector('#property-form-panel');
  const propertiesListCard = content.querySelector('#properties-list-card');
  enableTableColumnFilters(content);

  const openPropertyFormButton = content.querySelector('#open-property-form-btn');
  const propertySortSelect = content.querySelector('#property-sort-select');
  const downloadPropertiesXlsxButton = content.querySelector('#download-properties-xlsx-btn');
  const downloadPropertiesPdfButton = content.querySelector('#download-properties-pdf-btn');
  const form = content.querySelector('#object-form');
  const formTitle = content.querySelector('#property-form-title');
  const closeFormButton = content.querySelector('#close-property-form-btn');
  const propertyContactsPanel = content.querySelector('#property-contacts-panel');
  const propertyContactsTitle = content.querySelector('#property-contacts-title');
  const openPropertyContactFormButton = content.querySelector('#open-property-contact-form-btn');
  const propertyContactForm = content.querySelector('#property-contact-form');
  const cancelPropertyContactButton = content.querySelector('#cancel-property-contact-btn');
  const propertyContactsList = content.querySelector('#property-contacts-list');

  let propertyFormMode = 'add';
  let activePropertyId = '';
  let draftPropertyContacts = [];
  let draftContactCounter = 0;

  content.prepend(propertyFormPanel);

  const exportRows = sortedRowsData.map(({ item, ownerName, contactsCount }) => ({
    number: item.number,
    floor: item.floor,
    squareMeters: item.square_meters ?? '',
    tenants: item.tenants_count ?? 0,
    owner: ownerName,
    contacts: propertyContactsEnabled ? contactsCount : ''
  }));

  const exportPropertiesToXlsx = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Number', 'Floor', 'Sq m', 'Tenants', 'Owner', 'Contacts'],
      ...exportRows.map((row) => [row.number, row.floor, row.squareMeters, row.tenants, row.owner, row.contacts])
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties');
    XLSX.writeFile(workbook, 'properties.xlsx');
  };

  const exportPropertiesToPdf = () => {
    const document = new jsPDF({ orientation: 'landscape' });
    autoTable(document, {
      head: [['Number', 'Floor', 'Sq m', 'Tenants', 'Owner', 'Contacts']],
      body: exportRows.map((row) => [String(row.number), String(row.floor), String(row.squareMeters), String(row.tenants), String(row.owner), String(row.contacts)]),
      styles: { fontSize: 9 }
    });
    document.save('properties.pdf');
  };

  const syncAddPropertyButtonVisibility = () => {
    const addModeVisible = propertyFormMode === 'add' && !propertyFormPanel.classList.contains('d-none');
    openPropertyFormButton.classList.toggle('d-none', addModeVisible);
  };

  const syncPropertiesListVisibility = () => {
    if (!propertiesListCard) return;
    const hideListCard = !propertyFormPanel.classList.contains('d-none');
    propertiesListCard.classList.toggle('d-none', hideListCard);
  };

  const openForm = () => {
    propertyFormPanel.classList.remove('d-none');
    syncAddPropertyButtonVisibility();
    syncPropertiesListVisibility();
  };

  const closeForm = () => {
    propertyFormPanel.classList.add('d-none');
    syncAddPropertyButtonVisibility();
    syncPropertiesListVisibility();
  };

  const resetPropertyContactForm = () => {
    if (!propertyContactForm) return;
    propertyContactForm.reset();
    propertyContactForm.elements.contact_type.value = CONTACT_TYPE_OPTIONS[0].value;
  };

  const openPropertyContactForm = () => {
    if (!propertyContactForm) return;
    propertyContactForm.classList.remove('d-none');
    resetPropertyContactForm();
  };

  const closePropertyContactForm = () => {
    if (!propertyContactForm) return;
    propertyContactForm.classList.add('d-none');
    resetPropertyContactForm();
  };

  const renderPropertyContactsList = (propertyId) => {
    if (!propertyContactsEnabled || !propertyContactsList) return;

    const resolvedPropertyId = propertyId || activePropertyId;
    const isDraftMode = !resolvedPropertyId;
    const contactsToRender = isDraftMode ? draftPropertyContacts : getPropertyContacts(resolvedPropertyId);

    const contactsRows = contactsToRender
      .map((contact) => {
        const contactId = isDraftMode ? contact.temp_id : contact.id;
        const contactName = getContactFullName(contact) || contact.first_name || '';

        return `
        <article class="card border admin-section-card mb-0">
          <div class="card-body py-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="h6 mb-0">Contact</h5>
              <button type="button" class="btn btn-sm btn-link text-danger p-0" data-delete-property-contact="${contactId}" aria-label="Delete contact ${contactName}" title="Delete">${deleteIconSvg}</button>
            </div>
            <div class="row g-2">
              <div class="col-12 col-md-6"><span class="text-secondary small d-block">Name</span><span>${contact.first_name ?? '-'}</span></div>
              <div class="col-12 col-md-6"><span class="text-secondary small d-block">Family name</span><span>${contact.family_name ?? '-'}</span></div>
              <div class="col-12 col-md-6"><span class="text-secondary small d-block">Email</span><span>${contact.email ?? '-'}</span></div>
              <div class="col-12 col-md-6"><span class="text-secondary small d-block">Phone</span><span>${contact.phone ?? '-'}</span></div>
              <div class="col-12 col-md-4"><span class="text-secondary small d-block">Type</span><span>${getContactTypeLabel(contact.contact_type)}</span></div>
              <div class="col-12 col-md-4"><span class="text-secondary small d-block">Start period</span><span>${contact.start_date ?? '-'}</span></div>
              <div class="col-12 col-md-4"><span class="text-secondary small d-block">End period</span><span>${contact.end_date ?? '-'}</span></div>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    propertyContactsList.innerHTML = contactsRows || '<p class="text-secondary mb-0">No contacts added.</p>';

    propertyContactsList.querySelectorAll('[data-delete-property-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (isDraftMode) {
          draftPropertyContacts = draftPropertyContacts.filter((contact) => contact.temp_id !== button.dataset.deletePropertyContact);
          renderPropertyContactsList('');
          return;
        }

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

        renderObjectsSection(content, { selectedPropertyId: propertyId, sortBy });
      });
    });
  };

  const showPropertyContacts = (property) => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTitle) return;

    activePropertyId = property.id;
    propertyContactsTitle.textContent = `Contacts for ${property.number}`;
    propertyContactsPanel.classList.remove('d-none');
    closePropertyContactForm();
    renderPropertyContactsList(property.id);
  };

  const showDraftPropertyContacts = () => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTitle) return;

    activePropertyId = '';
    propertyContactsTitle.textContent = 'Contacts for new property';
    propertyContactsPanel.classList.remove('d-none');
    closePropertyContactForm();
    renderPropertyContactsList('');
  };

  const hidePropertyContacts = () => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsList) return;

    activePropertyId = '';
    propertyContactsPanel.classList.add('d-none');
    closePropertyContactForm();
    propertyContactsList.innerHTML = '';
  };

  const setFormMode = (mode) => {
    propertyFormMode = mode;
    formTitle.textContent = mode === 'edit' ? 'Edit Property' : 'Add Property';

    if (mode === 'add') {
      showDraftPropertyContacts();
    } else {
      hidePropertyContacts();
    }

    syncAddPropertyButtonVisibility();
    syncPropertiesListVisibility();
  };

  const fillPropertyForm = (item) => {
    form.elements.id.value = item.id;
    form.elements.number.value = item.number;
    form.elements.floor.value = item.floor;
    form.elements.property_type.value = item.property_type ?? '';
    form.elements.tenants_count.value = item.tenants_count ?? 0;
    form.elements.pets_count.value = item.pets_count ?? 0;
    form.elements.square_meters.value = item.square_meters ?? '';
    form.elements.ideal_parts.value = item.ideal_parts ?? '';
  };

  openPropertyFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    draftPropertyContacts = [];
    setFormMode('add');
    openForm();
  });

  propertySortSelect.addEventListener('change', () => {
    renderObjectsSection(content, { sortBy: propertySortSelect.value });
  });

  downloadPropertiesXlsxButton.addEventListener('click', exportPropertiesToXlsx);
  downloadPropertiesPdfButton.addEventListener('click', exportPropertiesToPdf);

  closeFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    draftPropertyContacts = [];
    setFormMode('add');
    closeForm();
  });

  if (propertyContactsEnabled && openPropertyContactFormButton) {
    openPropertyContactFormButton.addEventListener('click', openPropertyContactForm);
  }

  if (propertyContactsEnabled && cancelPropertyContactButton) {
    cancelPropertyContactButton.addEventListener('click', closePropertyContactForm);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const propertyId = payload.id;

    const savePayload = {
      number: payload.number,
      floor: Number(payload.floor),
      property_type: payload.property_type || null,
      tenants_count: payload.tenants_count === '' ? 0 : Number(payload.tenants_count),
      pets_count: payload.pets_count === '' ? 0 : Number(payload.pets_count),
      square_meters: payload.square_meters === '' ? null : Number(payload.square_meters),
      ideal_parts: payload.ideal_parts === '' ? null : Number(payload.ideal_parts)
    };

    let savedPropertyId = propertyId;
    let error = null;

    if (propertyId) {
      const updateRes = await supabase.from('properties').update(savePayload).eq('id', propertyId);
      error = updateRes.error;
    } else {
      const insertRes = await supabase.from('properties').insert(savePayload).select('id').single();
      error = insertRes.error;
      savedPropertyId = insertRes.data?.id ?? '';
    }

    if (error) {
      notifyError(error.message || 'Failed to save property.');
      return;
    }

    if (!propertyId && propertyContactsEnabled && draftPropertyContacts.length > 0) {
      const contactsToInsert = draftPropertyContacts.map((contact) => ({
        property_id: savedPropertyId,
        contact_type: contact.contact_type,
        first_name: contact.first_name,
        middle_name: null,
        family_name: contact.family_name || null,
        email: contact.email || null,
        phone: contact.phone || null,
        start_date: contact.start_date || null,
        end_date: contact.end_date || null
      }));

      const contactsInsertRes = await supabase.from('property_contacts').insert(contactsToInsert);
      if (contactsInsertRes.error) {
        notifyError(contactsInsertRes.error.message || 'Property created, but contacts could not be saved.');
      }
    }

    notifyInfo(propertyId ? 'Property updated.' : 'Property created.');
    draftPropertyContacts = [];

    try {
      await refreshObjectsAndProfilesData();
    } catch (refreshError) {
      notifyError(refreshError.message || 'Property saved, but refresh failed. Please reopen the section.');
      return;
    }

    renderObjectsSection(content, { selectedPropertyId: savedPropertyId || '', sortBy });
  });

  if (propertyContactsEnabled && propertyContactForm) {
    propertyContactForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const contactPayload = Object.fromEntries(new FormData(propertyContactForm).entries());

      if (!activePropertyId) {
        draftContactCounter += 1;
        draftPropertyContacts.push({
          temp_id: `draft-${draftContactCounter}`,
          contact_type: contactPayload.contact_type,
          first_name: contactPayload.first_name,
          middle_name: null,
          family_name: contactPayload.family_name || null,
          email: contactPayload.email || null,
          phone: contactPayload.phone || null,
          start_date: contactPayload.start_date || null,
          end_date: contactPayload.end_date || null
        });

        closePropertyContactForm();
        renderPropertyContactsList('');
        return;
      }

      const { error } = await supabase.from('property_contacts').insert({
        property_id: activePropertyId,
        contact_type: contactPayload.contact_type,
        first_name: contactPayload.first_name,
        middle_name: null,
        family_name: contactPayload.family_name || null,
        email: contactPayload.email || null,
        phone: contactPayload.phone || null,
        start_date: contactPayload.start_date || null,
        end_date: contactPayload.end_date || null
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

      renderObjectsSection(content, { selectedPropertyId: activePropertyId, sortBy });
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

      renderObjectsSection(content, { sortBy });
    });
  });
};
