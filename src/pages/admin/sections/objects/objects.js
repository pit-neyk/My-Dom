import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../../components/table-filters/table-filters.js';
import { state, getUserDisplay } from '../../adminState.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import template from './objects.html?raw';
import contactsPanelTemplate from './objects-contacts-panel.html?raw';
import rowTemplate from './objects-row.html?raw';
import contactCardTemplate from './objects-contact-card.html?raw';
import contactsCellTemplate from './objects-contacts-cell.html?raw';
import contactsHeaderTemplate from './objects-contacts-header.html?raw';
import emptySecondaryTextTemplate from './empty-secondary-text.html?raw';
import editIconSvg from '../../../../assets/icons/edit.svg?raw';
import deleteIconSvg from '../../../../assets/icons/delete.svg?raw';
import notoSansRegularFontUrl from '../../../../assets/fonts/NotoSans-Regular.ttf?url';
import { fillTemplate } from '../../../../lib/template.js';
import { getCurrentSession } from '../../../../features/auth/auth.js';
import './objects.css';

const PDF_FONT_FILE_NAME = 'NotoSans-Regular.ttf';
const PDF_FONT_FAMILY_NAME = 'NotoSans';
let cachedPdfFontBinary = null;

const toBinaryString = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return binary;
};

const ensurePdfUnicodeFont = async (document) => {
  if (!cachedPdfFontBinary) {
    const response = await fetch(notoSansRegularFontUrl);

    if (!response.ok) {
      throw new Error('Failed to load PDF font.');
    }

    cachedPdfFontBinary = toBinaryString(await response.arrayBuffer());
  }

  document.addFileToVFS(PDF_FONT_FILE_NAME, cachedPdfFontBinary);
  document.addFont(PDF_FONT_FILE_NAME, PDF_FONT_FAMILY_NAME, 'normal');
  document.setFont(PDF_FONT_FAMILY_NAME, 'normal');
};

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

const OBJECTS_VIEW_STATE_STORAGE_KEY = 'dom_admin_objects_view_state_v1';
const DEFAULT_OBJECTS_VIEW_STATE = {
  selectedPropertyId: '',
  formOpen: false,
  formMode: 'add',
  contactFormOpen: false
};

const getObjectsViewStateScope = () => `user:${getCurrentSession()?.user?.id ?? 'guest'}`;

const readObjectsViewStateStore = () => {
  try {
    const raw = window.sessionStorage.getItem(OBJECTS_VIEW_STATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeObjectsViewStateStore = (store) => {
  try {
    window.sessionStorage.setItem(OBJECTS_VIEW_STATE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
};

const readObjectsViewState = () => {
  const store = readObjectsViewStateStore();
  const scope = getObjectsViewStateScope();
  const scoped = store[scope];

  if (!scoped || typeof scoped !== 'object') {
    return { ...DEFAULT_OBJECTS_VIEW_STATE };
  }

  return {
    ...DEFAULT_OBJECTS_VIEW_STATE,
    ...scoped
  };
};

const setObjectsViewState = (nextState) => {
  const store = readObjectsViewStateStore();
  const scope = getObjectsViewStateScope();
  const current = readObjectsViewState();

  store[scope] = {
    ...current,
    ...nextState
  };

  writeObjectsViewStateStore(store);
};

const clearObjectsViewState = () => {
  const store = readObjectsViewStateStore();
  const scope = getObjectsViewStateScope();
  store[scope] = { ...DEFAULT_OBJECTS_VIEW_STATE };
  writeObjectsViewStateStore(store);
};

const isMissingPropertyContactsTableError = (error) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || error?.status === 404;

const isMissingContactPeriodColumnsError = (error) => {
  if (error?.code !== 'PGRST204') {
    return false;
  }

  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return errorText.includes('start_date') || errorText.includes('end_date');
};

const isMissingPropertyExtendedColumnsError = (error) => {
  if (error?.code !== 'PGRST204' && error?.code !== '42703') {
    return false;
  }

  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  return errorText.includes('pets_count') || errorText.includes('property_type') || errorText.includes('ideal_parts');
};

const stripExtendedPropertyFields = (payload) => {
  const { pets_count, property_type, ideal_parts, ...legacyPayload } = payload;
  return legacyPayload;
};

const savePropertyWithFallback = async (propertyId, savePayload) => {
  if (propertyId) {
    const updateRes = await supabase.from('properties').update(savePayload).eq('id', propertyId);

    if (!updateRes.error) {
      return { error: null, id: propertyId, usedExtendedColumns: true };
    }

    if (!isMissingPropertyExtendedColumnsError(updateRes.error)) {
      return { error: updateRes.error, id: propertyId, usedExtendedColumns: true };
    }

    const retryRes = await supabase
      .from('properties')
      .update(stripExtendedPropertyFields(savePayload))
      .eq('id', propertyId);

    return {
      error: retryRes.error ?? null,
      id: propertyId,
      usedExtendedColumns: false
    };
  }

  const insertRes = await supabase.from('properties').insert(savePayload).select('id').single();

  if (!insertRes.error) {
    return { error: null, id: insertRes.data?.id ?? '', usedExtendedColumns: true };
  }

  if (!isMissingPropertyExtendedColumnsError(insertRes.error)) {
    return { error: insertRes.error, id: '', usedExtendedColumns: true };
  }

  const retryRes = await supabase
    .from('properties')
    .insert(stripExtendedPropertyFields(savePayload))
    .select('id')
    .single();

  return {
    error: retryRes.error ?? null,
    id: retryRes.data?.id ?? '',
    usedExtendedColumns: false
  };
};

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

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderContactTypeOptionsMarkup = (selectedValue) =>
  CONTACT_TYPE_OPTIONS
    .map((option) => {
      const selected = option.value === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join('');

const getContactFullName = (contact) =>
  [contact.first_name, contact.middle_name, contact.family_name].filter(Boolean).join(' ');

const getPropertyOwnerName = (property) => {
  const propertyContacts = getPropertyContacts(property.id);
  const ownerContacts = propertyContacts.filter((contact) => contact.contact_type === 'owner');

  if (propertyContacts.length > 0) {
    if (ownerContacts.length === 0) {
      return '-';
    }

    const prioritizedOwnerContact = [...ownerContacts].sort((left, right) => {
      const leftOpenEnded = !left.end_date;
      const rightOpenEnded = !right.end_date;

      if (leftOpenEnded !== rightOpenEnded) {
        return leftOpenEnded ? -1 : 1;
      }

      const leftStartDate = left.start_date ?? '';
      const rightStartDate = right.start_date ?? '';
      return rightStartDate.localeCompare(leftStartDate);
    })[0];

    return getContactFullName(prioritizedOwnerContact) || prioritizedOwnerContact.email || prioritizedOwnerContact.phone || '-';
  }

  const ownerProfile = state.profiles.find((profile) => profile.user_id === property.owner_user_id);
  if (ownerProfile) {
    return getUserDisplay(ownerProfile);
  }

  return '-';
};

const toPropertyContactPayload = (contactPayload, propertyId, includePeriod = true) => {
  const payload = {
    property_id: propertyId,
    contact_type: contactPayload.contact_type,
    first_name: contactPayload.first_name,
    middle_name: null,
    family_name: contactPayload.family_name || null,
    email: contactPayload.email || null,
    phone: contactPayload.phone || null
  };

  if (includePeriod) {
    payload.start_date = contactPayload.start_date || null;
    payload.end_date = contactPayload.end_date || null;
  }

  return payload;
};

const normalizeText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildComparablePropertyPayload = (payload) => ({
  number: normalizeText(payload.number),
  floor: Number(payload.floor),
  property_type: normalizeText(payload.property_type),
  tenants_count: payload.tenants_count === '' ? 0 : Number(payload.tenants_count),
  pets_count: payload.pets_count === '' ? 0 : Number(payload.pets_count),
  square_meters: normalizeNumberOrNull(payload.square_meters),
  ideal_parts: normalizeNumberOrNull(payload.ideal_parts)
});

const buildComparableExistingProperty = (item) => ({
  number: normalizeText(item?.number),
  floor: Number(item?.floor),
  property_type: normalizeText(item?.property_type),
  tenants_count: Number(item?.tenants_count ?? 0),
  pets_count: Number(item?.pets_count ?? 0),
  square_meters: normalizeNumberOrNull(item?.square_meters),
  ideal_parts: normalizeNumberOrNull(item?.ideal_parts)
});

const hasPropertyChanges = (payload, existingItem) => {
  if (!existingItem) {
    return true;
  }

  const nextValue = buildComparablePropertyPayload(payload);
  const currentValue = buildComparableExistingProperty(existingItem);

  return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
};

const buildComparableContact = (contact) => ({
  first_name: normalizeText(contact?.first_name),
  family_name: normalizeText(contact?.family_name),
  email: normalizeText(contact?.email),
  phone: normalizeText(contact?.phone),
  contact_type: normalizeText(contact?.contact_type),
  start_date: normalizeText(contact?.start_date),
  end_date: normalizeText(contact?.end_date)
});

const hasContactChanges = (nextPayload, existingContact) => {
  if (!existingContact) {
    return true;
  }

  const nextValue = buildComparableContact(nextPayload);
  const currentValue = buildComparableContact(existingContact);

  return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
};

const insertPropertyContacts = async (contactsPayload) => {
  const initialInsertRes = await supabase.from('property_contacts').insert(contactsPayload);

  if (!initialInsertRes.error) {
    return { error: null, usedPeriodColumns: true };
  }

  if (!isMissingContactPeriodColumnsError(initialInsertRes.error)) {
    return { error: initialInsertRes.error, usedPeriodColumns: true };
  }

  const retryPayload = contactsPayload.map(({ start_date, end_date, ...rest }) => rest);
  const retryRes = await supabase.from('property_contacts').insert(retryPayload);

  return {
    error: retryRes.error ?? null,
    usedPeriodColumns: false
  };
};

const updatePropertyContact = async (contactId, contactPayload, propertyId) => {
  const { property_id, ...payloadWithPeriod } = toPropertyContactPayload(contactPayload, propertyId, true);

  const initialUpdateRes = await supabase
    .from('property_contacts')
    .update(payloadWithPeriod)
    .eq('id', contactId);

  if (!initialUpdateRes.error) {
    return { error: null, usedPeriodColumns: true };
  }

  if (!isMissingContactPeriodColumnsError(initialUpdateRes.error)) {
    return { error: initialUpdateRes.error, usedPeriodColumns: true };
  }

  const retryPayload = Object.fromEntries(
    Object.entries(payloadWithPeriod).filter(([key]) => key !== 'start_date' && key !== 'end_date')
  );

  const retryRes = await supabase
    .from('property_contacts')
    .update(retryPayload)
    .eq('id', contactId);

  return {
    error: retryRes.error ?? null,
    usedPeriodColumns: false
  };
};

export const renderObjectsSection = (content, options = {}) => {
  const resetToList = options.resetToList === true;

  if (resetToList) {
    clearObjectsViewState();
  }

  const persistedViewState = readObjectsViewState();
  const selectedPropertyId = resetToList
    ? ''
    : (options.selectedPropertyId ?? persistedViewState.selectedPropertyId ?? '');
  const sortBy = options.sortBy ?? 'number_asc';
  const propertyDraft = options.propertyDraft ?? null;
  const initialFormOpen = resetToList
    ? false
    : (options.formOpen ?? persistedViewState.formOpen ?? false);
  const initialFormMode = resetToList
    ? 'add'
    : (options.formMode ?? persistedViewState.formMode ?? 'add');
  const initialContactFormOpen = resetToList
    ? false
    : (options.contactFormOpen ?? persistedViewState.contactFormOpen ?? false);
  const propertyContactsEnabled = state.propertyContactsEnabled !== false;

  const rowsData = state.objects.map((item) => {
    const propertyContacts = propertyContactsEnabled ? getPropertyContacts(item.id) : [];

    return {
      item,
      ownerName: getPropertyOwnerName(item),
      contactsCount: propertyContacts.length
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
    .map(({ item, ownerName, contactsCount }) =>
      fillTemplate(rowTemplate, {
        id: item.id,
        number: item.number,
        floor: item.floor,
        squareMeters: item.square_meters ?? '-',
        tenants: item.tenants_count ?? 0,
        owner: ownerName,
        contactsCell: propertyContactsEnabled
          ? fillTemplate(contactsCellTemplate, { contactsCount })
          : '',
        editIcon: editIconSvg,
        deleteIcon: deleteIconSvg
      })
    )
    .join('');

  const propertyTypeOptions = '';
  const contactTypeOptions = '';
  const propertyContactsPanelMarkup = propertyContactsEnabled
    ? contactsPanelTemplate.replace('{{contactTypeOptions}}', contactTypeOptions)
    : '';

  content.innerHTML = template
    .replace('{{contactsHeader}}', propertyContactsEnabled ? contactsHeaderTemplate : '')
    .replace('{{rows}}', rows)
    .replace('{{propertyTypeOptions}}', propertyTypeOptions)
    .replace('{{propertyContactsPanel}}', propertyContactsPanelMarkup);

  const propertyFormPanel = content.querySelector('#property-form-panel');
  const propertiesListCard = content.querySelector('#properties-list-card');
  enableTableColumnFilters(content);

  const openPropertyFormButton = content.querySelector('#open-property-form-btn');
  const propertyTypeSelect = content.querySelector('select[name="property_type"]');
  const downloadPropertiesXlsxButton = content.querySelector('#download-properties-xlsx-btn');
  const downloadPropertiesPdfButton = content.querySelector('#download-properties-pdf-btn');
  const form = content.querySelector('#object-form');
  const formTitle = content.querySelector('#property-form-title');
  const closeFormButton = content.querySelector('#close-property-form-btn');
  const propertyContactsPanel = content.querySelector('#property-contacts-panel');
  const propertyContactsTitle = content.querySelector('#property-contacts-title');
  const openPropertyContactFormButton = content.querySelector('#open-property-contact-form-btn');
  const propertyContactForm = content.querySelector('#property-contact-form');
  const propertyContactTypeSelect = propertyContactForm?.elements?.contact_type;
  const cancelPropertyContactButton = content.querySelector('#cancel-property-contact-btn');
  const propertyContactsList = content.querySelector('#property-contacts-list');

  PROPERTY_TYPE_OPTIONS.forEach((option) => {
    const optionNode = document.createElement('option');
    optionNode.value = option.value;
    optionNode.textContent = option.label;
    propertyTypeSelect?.appendChild(optionNode);
  });

  CONTACT_TYPE_OPTIONS.forEach((option) => {
    const optionNode = document.createElement('option');
    optionNode.value = option.value;
    optionNode.textContent = option.label;
    propertyContactTypeSelect?.appendChild(optionNode);
  });

  let propertyFormMode = 'add';
  let activePropertyId = '';
  let draftPropertyContacts = [];
  let draftContactCounter = 0;
  let editingInlineContactId = '';

  const syncObjectsViewState = () => {
    setObjectsViewState({
      selectedPropertyId: propertyFormMode === 'edit' ? activePropertyId : '',
      formOpen: !propertyFormPanel.classList.contains('d-none'),
      formMode: propertyFormMode,
      contactFormOpen: Boolean(propertyContactForm && !propertyContactForm.classList.contains('d-none'))
    });
  };

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

  const exportPropertiesToPdf = async () => {
    const document = new jsPDF({ orientation: 'landscape' });

    try {
      await ensurePdfUnicodeFont(document);
    } catch (error) {
      notifyError(error.message || 'Failed to prepare Unicode font for PDF export.');
      return;
    }

    autoTable(document, {
      head: [['Number', 'Floor', 'Sq m', 'Tenants', 'Owner', 'Contacts']],
      body: exportRows.map((row) => [String(row.number), String(row.floor), String(row.squareMeters), String(row.tenants), String(row.owner), String(row.contacts)]),
      styles: { font: PDF_FONT_FAMILY_NAME, fontSize: 9 },
      headStyles: { font: PDF_FONT_FAMILY_NAME },
      bodyStyles: { font: PDF_FONT_FAMILY_NAME }
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
    syncObjectsViewState();
  };

  const closeForm = () => {
    propertyFormPanel.classList.add('d-none');
    syncAddPropertyButtonVisibility();
    syncPropertiesListVisibility();
    syncObjectsViewState();
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
    syncObjectsViewState();
  };

  const closePropertyContactForm = () => {
    if (!propertyContactForm) return;
    propertyContactForm.classList.add('d-none');
    resetPropertyContactForm();
    syncObjectsViewState();
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
        const isEditing = editingInlineContactId === contactId;

        if (isEditing) {
          return `
            <article class="card border admin-section-card mb-0">
              <div class="card-body py-3">
                <form class="row g-2" data-inline-contact-form="${escapeHtml(contactId)}">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <h5 class="h6 mb-0">Contact</h5>
                    <div class="admin-inline-actions">
                      <button class="btn btn-sm btn-primary" type="button" data-save-inline-contact="${escapeHtml(contactId)}">Save</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" data-cancel-inline-contact="${escapeHtml(contactId)}">Cancel</button>
                    </div>
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="text-secondary small d-block">Name</label>
                    <input class="form-control form-control-sm" name="first_name" required value="${escapeHtml(contact.first_name)}" />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="text-secondary small d-block">Family name</label>
                    <input class="form-control form-control-sm" name="family_name" value="${escapeHtml(contact.family_name)}" />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="text-secondary small d-block">Email</label>
                    <input class="form-control form-control-sm" name="email" type="email" value="${escapeHtml(contact.email)}" />
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="text-secondary small d-block">Phone</label>
                    <input class="form-control form-control-sm" name="phone" value="${escapeHtml(contact.phone)}" />
                  </div>
                  <div class="col-12 col-md-4">
                    <label class="text-secondary small d-block">Type</label>
                    <select class="form-select form-select-sm" name="contact_type" required>
                      ${renderContactTypeOptionsMarkup(contact.contact_type ?? CONTACT_TYPE_OPTIONS[0].value)}
                    </select>
                  </div>
                  <div class="col-12 col-md-4">
                    <label class="text-secondary small d-block">Start period</label>
                    <input class="form-control form-control-sm" name="start_date" type="date" value="${escapeHtml(contact.start_date)}" />
                  </div>
                  <div class="col-12 col-md-4">
                    <label class="text-secondary small d-block">End period</label>
                    <input class="form-control form-control-sm" name="end_date" type="date" value="${escapeHtml(contact.end_date)}" />
                  </div>
                </form>
              </div>
            </article>
          `;
        }

        return fillTemplate(contactCardTemplate, {
          contactId,
          contactName,
          editIcon: editIconSvg,
          deleteIcon: deleteIconSvg,
          firstName: contact.first_name ?? '-',
          familyName: contact.family_name ?? '-',
          email: contact.email ?? '-',
          phone: contact.phone ?? '-',
          type: getContactTypeLabel(contact.contact_type),
          startDate: contact.start_date ?? '-',
          endDate: contact.end_date ?? '-'
        });
      })
      .join('');

    propertyContactsList.innerHTML = contactsRows || fillTemplate(emptySecondaryTextTemplate, { text: 'No contacts added.' });

    propertyContactsList.querySelectorAll('[data-cancel-inline-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        if (editingInlineContactId !== button.dataset.cancelInlineContact) {
          return;
        }

        editingInlineContactId = '';
        renderPropertyContactsList(resolvedPropertyId);
      });
    });

    propertyContactsList.querySelectorAll('[data-save-inline-contact]').forEach((button) => {
      button.addEventListener('click', async () => {
        const inlineContactId = button.dataset.saveInlineContact;
        const inlineForm = propertyContactsList.querySelector(`[data-inline-contact-form="${CSS.escape(inlineContactId)}"]`);
        if (!inlineForm) {
          return;
        }

        if (!inlineForm.reportValidity()) {
          return;
        }

        const contactPayload = Object.fromEntries(new FormData(inlineForm).entries());
        const existingContact = contactsToRender.find((contact) => (isDraftMode ? contact.temp_id : contact.id) === inlineContactId);

        if (!hasContactChanges(contactPayload, existingContact)) {
          editingInlineContactId = '';
          renderPropertyContactsList(resolvedPropertyId);
          return;
        }

        if (isDraftMode) {
          draftPropertyContacts = draftPropertyContacts.map((contact) => {
            if (contact.temp_id !== inlineContactId) {
              return contact;
            }

            return {
              ...contact,
              contact_type: contactPayload.contact_type,
              first_name: contactPayload.first_name,
              family_name: contactPayload.family_name || null,
              email: contactPayload.email || null,
              phone: contactPayload.phone || null,
              start_date: contactPayload.start_date || null,
              end_date: contactPayload.end_date || null
            };
          });

          editingInlineContactId = '';
          notifyInfo('Contact updated.');
          renderPropertyContactsList('');
          return;
        }

        const contactUpdateRes = await updatePropertyContact(inlineContactId, contactPayload, resolvedPropertyId);

        if (contactUpdateRes.error) {
          notifyError(contactUpdateRes.error.message || 'Failed to update contact.');
          return;
        }

        if (!contactUpdateRes.usedPeriodColumns) {
          notifyInfo('Contact updated without start/end period because your database schema is missing those columns.');
        }

        editingInlineContactId = '';
        notifyInfo('Contact updated.');

        try {
          await refreshObjectsAndProfilesData();
        } catch (refreshError) {
          notifyError(refreshError.message || 'Contact updated, but refresh failed. Please reopen the section.');
          return;
        }

        const propertyFormDraft = capturePropertyFormDraft();
        renderObjectsSection(content, {
          selectedPropertyId: resolvedPropertyId,
          sortBy,
          propertyDraft: propertyFormDraft
        });
      });
    });

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

        const propertyFormDraft = capturePropertyFormDraft();
        renderObjectsSection(content, {
          selectedPropertyId: propertyId,
          sortBy,
          propertyDraft: propertyFormDraft
        });
      });
    });

    propertyContactsList.querySelectorAll('[data-edit-property-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        editingInlineContactId = button.dataset.editPropertyContact;
        closePropertyContactForm();
        renderPropertyContactsList(resolvedPropertyId);
      });
    });
  };

  const showPropertyContacts = (property) => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTitle) return;

    activePropertyId = property.id;
    editingInlineContactId = '';
    propertyContactsTitle.textContent = `Contacts for ${property.number}`;
    propertyContactsPanel.classList.remove('d-none');
    closePropertyContactForm();
    renderPropertyContactsList(property.id);
    syncObjectsViewState();
  };

  const showDraftPropertyContacts = () => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsTitle) return;

    activePropertyId = '';
    editingInlineContactId = '';
    propertyContactsTitle.textContent = 'Contacts for new property';
    propertyContactsPanel.classList.remove('d-none');
    closePropertyContactForm();
    renderPropertyContactsList('');
    syncObjectsViewState();
  };

  const hidePropertyContacts = () => {
    if (!propertyContactsEnabled || !propertyContactsPanel || !propertyContactsList) return;

    activePropertyId = '';
    editingInlineContactId = '';
    propertyContactsPanel.classList.add('d-none');
    closePropertyContactForm();
    propertyContactsList.innerHTML = '';
    syncObjectsViewState();
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
    syncObjectsViewState();
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

  const capturePropertyFormDraft = () => {
    if (propertyFormMode !== 'edit') {
      return null;
    }

    const draftPropertyId = String(form.elements.id.value || activePropertyId || '');
    if (!draftPropertyId) {
      return null;
    }

    return {
      id: draftPropertyId,
      number: form.elements.number.value,
      floor: form.elements.floor.value,
      property_type: form.elements.property_type.value,
      tenants_count: form.elements.tenants_count.value,
      pets_count: form.elements.pets_count.value,
      square_meters: form.elements.square_meters.value,
      ideal_parts: form.elements.ideal_parts.value
    };
  };

  const applyPropertyFormDraft = (draft) => {
    if (!draft || String(draft.id) !== String(form.elements.id.value)) {
      return;
    }

    form.elements.number.value = draft.number ?? '';
    form.elements.floor.value = draft.floor ?? '';
    form.elements.property_type.value = draft.property_type ?? '';
    form.elements.tenants_count.value = draft.tenants_count ?? '';
    form.elements.pets_count.value = draft.pets_count ?? '';
    form.elements.square_meters.value = draft.square_meters ?? '';
    form.elements.ideal_parts.value = draft.ideal_parts ?? '';
  };

  openPropertyFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    draftPropertyContacts = [];
    setFormMode('add');
    openForm();
  });

  downloadPropertiesXlsxButton.addEventListener('click', exportPropertiesToXlsx);
  downloadPropertiesPdfButton.addEventListener('click', exportPropertiesToPdf);

  closeFormButton.addEventListener('click', () => {
    clearObjectsViewState();
    renderObjectsSection(content, {
      sortBy,
      selectedPropertyId: '',
      formMode: 'add',
      formOpen: false,
      contactFormOpen: false
    });
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
    const existingProperty = propertyId
      ? state.objects.find((item) => String(item.id) === String(propertyId)) ?? null
      : null;

    if (propertyId && !hasPropertyChanges(payload, existingProperty)) {
      clearObjectsViewState();
      renderObjectsSection(content, {
        sortBy,
        selectedPropertyId: '',
        formMode: 'add',
        formOpen: false,
        contactFormOpen: false
      });
      return;
    }

    const savePayload = {
      number: payload.number,
      floor: Number(payload.floor),
      property_type: payload.property_type || null,
      tenants_count: payload.tenants_count === '' ? 0 : Number(payload.tenants_count),
      pets_count: payload.pets_count === '' ? 0 : Number(payload.pets_count),
      square_meters: payload.square_meters === '' ? null : Number(payload.square_meters),
      ideal_parts: payload.ideal_parts === '' ? null : Number(payload.ideal_parts)
    };

    const propertySaveRes = await savePropertyWithFallback(propertyId, savePayload);
    const error = propertySaveRes.error;
    const savedPropertyId = propertySaveRes.id || propertyId;

    if (error) {
      notifyError(error.message || 'Failed to save property.');
      return;
    }

    if (!propertySaveRes.usedExtendedColumns) {
      notifyInfo('Property saved without some extended fields because your database schema is missing newer columns.');
    }

    if (!propertyId && propertyContactsEnabled && draftPropertyContacts.length > 0) {
      const contactsToInsert = draftPropertyContacts.map((contact) => toPropertyContactPayload(contact, savedPropertyId, true));

      const contactsInsertRes = await insertPropertyContacts(contactsToInsert);
      if (contactsInsertRes.error) {
        notifyError(contactsInsertRes.error.message || 'Property created, but contacts could not be saved.');
      } else if (!contactsInsertRes.usedPeriodColumns) {
        notifyInfo('Contacts saved without start/end period because your database schema is missing those columns.');
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

    clearObjectsViewState();
    renderObjectsSection(content, {
      sortBy,
      selectedPropertyId: '',
      formMode: 'add',
      formOpen: false,
      contactFormOpen: false
    });
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

      const contactInsertRes = await insertPropertyContacts([
        toPropertyContactPayload(contactPayload, activePropertyId, true)
      ]);

      if (contactInsertRes.error) {
        notifyError(contactInsertRes.error.message || 'Failed to save contact.');
        return;
      }

      if (!contactInsertRes.usedPeriodColumns) {
        notifyInfo('Contact saved without start/end period because your database schema is missing those columns.');
      }

      notifyInfo('Contact saved.');

      try {
        await refreshObjectsAndProfilesData();
      } catch (refreshError) {
        notifyError(refreshError.message || 'Contact saved, but refresh failed. Please reopen the section.');
        return;
      }

      const propertyFormDraft = capturePropertyFormDraft();
      renderObjectsSection(content, {
        selectedPropertyId: activePropertyId,
        sortBy,
        propertyDraft: propertyFormDraft
      });
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
      syncObjectsViewState();
    });
  });

  if (selectedPropertyId) {
    const selectedProperty = state.objects.find((item) => item.id === selectedPropertyId);

    if (selectedProperty) {
      fillPropertyForm(selectedProperty);
      applyPropertyFormDraft(propertyDraft);
      setFormMode('edit');
      openForm();
      showPropertyContacts(selectedProperty);

      if (propertyContactsEnabled && initialContactFormOpen) {
        openPropertyContactForm();
      }
    } else {
      setFormMode('add');
      closeForm();
      clearObjectsViewState();
    }
  } else if (initialFormOpen && initialFormMode === 'add') {
    setFormMode('add');
    openForm();

    if (propertyContactsEnabled && initialContactFormOpen) {
      openPropertyContactForm();
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
      clearObjectsViewState();
    });
  });
};
