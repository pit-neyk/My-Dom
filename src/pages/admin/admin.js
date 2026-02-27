import template from './admin.html?raw';
import './admin.css';
import { createClient } from '@supabase/supabase-js';
import { navigateTo } from '../../router/router.js';
import {
  getCurrentSession,
  getEffectiveUserId,
  getImpersonatedUserId,
  isAdmin,
  isAuthenticated,
  isImpersonating,
  startImpersonation,
  stopImpersonation
} from '../../features/auth/auth.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const createNonPersistentClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

const ADMIN_SECTIONS = [
  { id: 'objects', label: 'Properties' },
  { id: 'owners', label: 'Owners & Contacts' },
  { id: 'obligations', label: 'Payment Obligations' },
  { id: 'events', label: 'Events' },
  { id: 'documents', label: 'Documents' },
  { id: 'messages', label: 'Mass Messages' },
  { id: 'impersonation', label: 'View As User' },
  { id: 'profile', label: 'My Profile' }
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const state = {
  objects: [],
  profiles: [],
  obligations: [],
  events: [],
  documents: [],
  messages: []
};

const getPrevMonthYear = (year, month) => {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }

  return { year, month: month - 1 };
};

const getUserDisplay = (profile) => profile?.full_name || profile?.email || profile?.user_id;

const getOwnerOptions = () =>
  [`<option value="">No owner assigned</option>`, ...state.profiles
    .map((profile) => `<option value="${profile.user_id}">${getUserDisplay(profile)}</option>`)
  ].join('');

const loadInitialData = async () => {
  const [
    objectsRes,
    profilesRes,
    obligationsRes,
    eventsRes,
    documentsRes,
    messagesRes
  ] = await Promise.all([
    supabase.from('properties').select('*').order('number'),
    supabase.from('profiles').select('*').order('full_name', { ascending: true, nullsFirst: false }),
    supabase
      .from('payment_obligations')
      .select('id,year,month,rate,independent_object_id,properties(number)')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase.from('events').select('*').order('created_at', { ascending: false }),
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
    supabase.from('mass_messages').select('*').order('created_at', { ascending: false })
  ]);

  const errors = [
    objectsRes.error,
    profilesRes.error,
    obligationsRes.error,
    eventsRes.error,
    documentsRes.error,
    messagesRes.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  state.objects = objectsRes.data ?? [];
  state.profiles = profilesRes.data ?? [];
  state.obligations = obligationsRes.data ?? [];
  state.events = eventsRes.data ?? [];
  state.documents = documentsRes.data ?? [];
  state.messages = messagesRes.data ?? [];
};

const renderNav = (container, onSelect) => {
  container.innerHTML = ADMIN_SECTIONS
    .map(
      (section, index) => `
        <button
          type="button"
          class="btn btn-outline-secondary text-start admin-nav-btn ${index === 0 ? 'active' : ''}"
          data-section-id="${section.id}"
        >
          ${section.label}
        </button>
      `
    )
    .join('');

  container.querySelectorAll('[data-section-id]').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('[data-section-id]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      onSelect(button.dataset.sectionId);
    });
  });
};

const renderObjectsSection = (content) => {
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
    await loadInitialData();
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
      await loadInitialData();
      renderObjectsSection(content);
    });
  });
};

const renderOwnersSection = (content) => {
  const rows = state.profiles
    .map(
      (profile) => `
      <tr>
        <td>${profile.full_name ?? '-'}</td>
        <td>${profile.email ?? '-'}</td>
        <td>${profile.phone ?? '-'}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-owner="${profile.user_id}">Edit</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Owners</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-owner-form-btn">Create Owner</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="owner-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Add / Modify Owner Contact Details</h3>
        <p class="admin-muted">Create a new owner account or edit existing owner profile/contact details.</p>
        <form id="owner-form" class="row g-3">
          <input type="hidden" name="user_id" />
          <div class="col-3">
            <label class="form-label">Full Name</label>
            <input class="form-control" name="full_name" />
          </div>
          <div class="col-3">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" required />
          </div>
          <div class="col-3">
            <label class="form-label">Phone</label>
            <input class="form-control" name="phone" />
          </div>
          <div class="col-3">
            <label class="form-label">Password (new owner only)</label>
            <input class="form-control" name="password" type="password" minlength="6" />
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Owner Details</button>
            <button class="btn btn-outline-secondary" type="button" id="owner-form-reset">Create New Owner</button>
            <button class="btn btn-outline-secondary" type="button" id="close-owner-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const ownerFormPanel = content.querySelector('#owner-form-panel');
  const openOwnerFormButton = content.querySelector('#open-owner-form-btn');
  const form = content.querySelector('#owner-form');
  const resetButton = content.querySelector('#owner-form-reset');
  const closeOwnerFormButton = content.querySelector('#close-owner-form-btn');

  content.prepend(ownerFormPanel);

  const openOwnerForm = () => {
    ownerFormPanel.classList.remove('d-none');
  };

  const closeOwnerForm = () => {
    ownerFormPanel.classList.add('d-none');
  };

  openOwnerFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    openOwnerForm();
  });

  closeOwnerFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    closeOwnerForm();
  });

  resetButton.addEventListener('click', () => {
    form.reset();
    form.elements.user_id.value = '';
    openOwnerForm();
  });

  content.querySelectorAll('[data-edit-owner]').forEach((button) => {
    button.addEventListener('click', () => {
      const owner = state.profiles.find((item) => item.user_id === button.dataset.editOwner);
      if (!owner) return;

      form.elements.user_id.value = owner.user_id;
      form.elements.full_name.value = owner.full_name ?? '';
      form.elements.email.value = owner.email ?? '';
      form.elements.phone.value = owner.phone ?? '';
      form.elements.password.value = '';
      openOwnerForm();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const isCreateMode = !payload.user_id;

    if (!payload.email) {
      notifyError('Email is required.');
      return;
    }

    let ownerUserId = payload.user_id;

    if (isCreateMode) {
      if (!payload.password || String(payload.password).length < 6) {
        notifyError('Password is required for new owners (minimum 6 characters).');
        return;
      }

      const signupClient = createNonPersistentClient();
      const { data: signUpData, error: signUpError } = await signupClient.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (signUpError) {
        notifyError(signUpError.message || 'Failed to create owner account.');
        return;
      }

      ownerUserId = signUpData.user?.id;

      if (!ownerUserId) {
        const { data: profileByEmail, error: profileLookupError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', payload.email)
          .maybeSingle();

        if (profileLookupError || !profileByEmail?.user_id) {
          notifyError('Owner account created but profile lookup failed. Please try editing the owner from the list.');
          return;
        }

        ownerUserId = profileByEmail.user_id;
      }

      await supabase
        .from('user_roles')
        .upsert({ user_id: ownerUserId, role: 'user' }, { onConflict: 'user_id' });
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: ownerUserId,
          full_name: payload.full_name || null,
          email: payload.email || null,
          phone: payload.phone || null
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      notifyError(error.message || 'Failed to save owner details.');
      return;
    }

    notifyInfo(isCreateMode ? 'Owner created.' : 'Owner details updated.');
    await loadInitialData();
    renderOwnersSection(content);
  });
};

const renderObligationsSection = (content) => {
  const objectChecks = state.objects
    .map(
      (obj) => `
      <div class="form-check col-6 col-md-4">
        <input class="form-check-input" type="checkbox" name="object_ids" value="${obj.id}" id="ob-${obj.id}" />
        <label class="form-check-label" for="ob-${obj.id}">${obj.number}</label>
      </div>
    `
    )
    .join('');

  const rows = state.obligations
    .slice(0, 200)
    .map(
      (ob) => `
      <tr>
        <td>${MONTH_NAMES[ob.month - 1]} ${ob.year}</td>
        <td>${ob.properties?.number ?? '-'}</td>
        <td>${ob.rate}</td>
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-obligation="${ob.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-obligation="${ob.id}">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Existing Obligations</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-obligation-form-btn">Create Obligation</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Period</th><th>Object</th><th>Rate</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="obligation-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Create / Update Obligations</h3>
        <form id="obligation-form" class="row g-3">
          <input type="hidden" name="id" />
          <div class="col-3">
            <label class="form-label">Year</label>
            <input class="form-control" name="year" type="number" min="2020" required value="${new Date().getFullYear()}" />
          </div>
          <div class="col-3">
            <label class="form-label">Month</label>
            <input class="form-control" name="month" type="number" min="1" max="12" required value="${new Date().getMonth() + 1}" />
          </div>
          <div class="col-3">
            <label class="form-label">Rate</label>
            <input class="form-control" name="rate" type="number" step="0.01" min="0" required />
          </div>
          <div class="col-3">
            <label class="form-label">Mode</label>
            <select class="form-select" name="mode">
              <option value="scratch">From scratch</option>
              <option value="copy">Copy previous month</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label">Target objects</label>
            <div class="row g-2">${objectChecks}</div>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save Obligations</button>
            <button class="btn btn-outline-secondary" type="button" id="close-obligation-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const obligationFormPanel = content.querySelector('#obligation-form-panel');
  const openObligationFormButton = content.querySelector('#open-obligation-form-btn');
  const form = content.querySelector('#obligation-form');
  const closeObligationFormButton = content.querySelector('#close-obligation-form-btn');

  content.prepend(obligationFormPanel);

  const openObligationForm = () => {
    obligationFormPanel.classList.remove('d-none');
  };

  const closeObligationForm = () => {
    obligationFormPanel.classList.add('d-none');
  };

  openObligationFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openObligationForm();
  });

  closeObligationFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    closeObligationForm();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const year = Number(formData.get('year'));
    const month = Number(formData.get('month'));
    const rate = Number(formData.get('rate'));
    const mode = String(formData.get('mode'));
    const selectedObjectIds = formData.getAll('object_ids').map(String);
    const obligationId = String(formData.get('id') || '');

    if (selectedObjectIds.length === 0 && !obligationId) {
      notifyError('Select at least one property.');
      return;
    }

    if (obligationId) {
      const { error } = await supabase
        .from('payment_obligations')
        .update({ year, month, rate })
        .eq('id', obligationId);

      if (error) {
        notifyError(error.message || 'Failed to update obligation.');
        return;
      }

      notifyInfo('Payment obligation updated.');
      await loadInitialData();
      renderObligationsSection(content);
      return;
    }

    if (mode === 'copy') {
      const prev = getPrevMonthYear(year, month);
      const { data: prevObligations, error: prevError } = await supabase
        .from('payment_obligations')
        .select('independent_object_id,rate')
        .eq('year', prev.year)
        .eq('month', prev.month)
        .in('independent_object_id', selectedObjectIds);

      if (prevError) {
        notifyError(prevError.message || 'Failed to load previous month obligations.');
        return;
      }

      if ((prevObligations ?? []).length === 0) {
        notifyError('No previous month obligations found for selected objects.');
        return;
      }

      const payload = prevObligations.map((item) => ({
        year,
        month,
        independent_object_id: item.independent_object_id,
        rate: item.rate
      }));

      const { error } = await supabase
        .from('payment_obligations')
        .upsert(payload, { onConflict: 'year,month,independent_object_id' });

      if (error) {
        notifyError(error.message || 'Failed to copy obligations.');
        return;
      }

      notifyInfo('Monthly obligations copied from previous month.');
      await loadInitialData();
      renderObligationsSection(content);
      return;
    }

    const payload = selectedObjectIds.map((objectId) => ({
      year,
      month,
      independent_object_id: objectId,
      rate
    }));

    const { error } = await supabase
      .from('payment_obligations')
      .upsert(payload, { onConflict: 'year,month,independent_object_id' });

    if (error) {
      notifyError(error.message || 'Failed to create obligations.');
      return;
    }

    notifyInfo('Monthly obligations saved.');
    await loadInitialData();
    renderObligationsSection(content);
  });

  content.querySelectorAll('[data-edit-obligation]').forEach((button) => {
    button.addEventListener('click', () => {
      const obligation = state.obligations.find((item) => item.id === button.dataset.editObligation);
      if (!obligation) return;

      form.elements.id.value = obligation.id;
      form.elements.year.value = obligation.year;
      form.elements.month.value = obligation.month;
      form.elements.rate.value = obligation.rate;
      const checkbox = form.querySelector(`input[name="object_ids"][value="${obligation.independent_object_id}"]`);
      if (checkbox) checkbox.checked = true;
      openObligationForm();
    });
  });

  content.querySelectorAll('[data-delete-obligation]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this payment obligation?');
      if (!confirmed) return;

      const { error } = await supabase.from('payment_obligations').delete().eq('id', button.dataset.deleteObligation);

      if (error) {
        notifyError(error.message || 'Failed to delete payment obligation.');
        return;
      }

      notifyInfo('Payment obligation deleted.');
      await loadInitialData();
      renderObligationsSection(content);
    });
  });
};

const renderEventsSection = (content) => {
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

const renderDocumentsSection = (content) => {
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

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Shared Documents</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-document-form-btn">Upload Document</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Name</th><th>Uploaded</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="document-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Upload & Share Documents</h3>
        <form id="document-form" class="row g-3">
          <div class="col-12">
            <label class="form-label">Select file</label>
            <input class="form-control" name="file" type="file" required />
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Upload Document</button>
            <button class="btn btn-outline-secondary" type="button" id="close-document-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const documentFormPanel = content.querySelector('#document-form-panel');
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

const renderMassMessagesSection = (content) => {
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

const renderImpersonationSection = (content) => {
  const options = state.profiles
    .map((profile) => `<option value="${profile.user_id}">${getUserDisplay(profile)}</option>`)
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <h3 class="h5 mb-3">Login as Normal Registered User</h3>
        <p class="admin-muted">Pick a user to view the app exactly like a normal user. You can return back as admin from header.</p>
        <form id="impersonation-form" class="row g-3">
          <div class="col-12 col-md-8">
            <label class="form-label">Registered User</label>
            <select class="form-select" name="impersonated_user_id" required>
              <option value="">Select user...</option>
              ${options}
            </select>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">View as User</button>
            <button class="btn btn-outline-secondary" type="button" id="stop-impersonation-btn">Return as Admin</button>
          </div>
        </form>
        <p class="mt-3 mb-0 admin-muted">Current mode: ${isImpersonating() ? `Viewing as ${getImpersonatedUserId()}` : 'Admin'}</p>
      </div>
    </div>
  `;

  const form = content.querySelector('#impersonation-form');
  const stopButton = content.querySelector('#stop-impersonation-btn');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const userId = String(new FormData(form).get('impersonated_user_id') ?? '').trim();

    if (!userId) {
      notifyError('Select a user first.');
      return;
    }

    const started = startImpersonation(userId);

    if (!started) {
      notifyError('Unable to start user view mode.');
      return;
    }

    notifyInfo('User view mode enabled. Redirecting to dashboard...');
    navigateTo('/dashboard');
  });

  stopButton.addEventListener('click', () => {
    stopImpersonation();
    notifyInfo('Returned to admin mode.');
    renderImpersonationSection(content);
  });
};

const renderProfileSection = (content) => {
  const userId = getCurrentSession()?.user?.id;
  const profile = state.profiles.find((item) => item.user_id === userId);

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <h3 class="h5 mb-3">Modify Your Profile</h3>
        <form id="my-profile-form" class="row g-3">
          <div class="col-12 col-md-4">
            <label class="form-label">Full Name</label>
            <input class="form-control" name="full_name" value="${profile?.full_name ?? ''}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" value="${profile?.email ?? ''}" />
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label">Phone</label>
            <input class="form-control" name="phone" value="${profile?.phone ?? ''}" />
          </div>
          <div class="col-12">
            <button class="btn btn-primary" type="submit">Save Profile</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = content.querySelector('#my-profile-form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          full_name: payload.full_name || null,
          email: payload.email || null,
          phone: payload.phone || null
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      notifyError(error.message || 'Failed to save profile.');
      return;
    }

    notifyInfo('Profile updated.');
    await loadInitialData();
    renderProfileSection(content);
  });
};

const renderSection = (sectionId, content) => {
  switch (sectionId) {
    case 'objects':
      renderObjectsSection(content);
      break;
    case 'owners':
      renderOwnersSection(content);
      break;
    case 'obligations':
      renderObligationsSection(content);
      break;
    case 'events':
      renderEventsSection(content);
      break;
    case 'documents':
      renderDocumentsSection(content);
      break;
    case 'messages':
      renderMassMessagesSection(content);
      break;
    case 'impersonation':
      renderImpersonationSection(content);
      break;
    case 'profile':
      renderProfileSection(content);
      break;
    default:
      renderObjectsSection(content);
  }
};

export const renderAdminPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (!isAdmin()) {
    notifyError('Only admins can access Admin Panel.');
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const nav = container.querySelector('#admin-nav');
  const content = container.querySelector('#admin-content');

  content.innerHTML = `
    <div class="d-flex align-items-center gap-2 text-secondary py-5 justify-content-center">
      <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
      <span>Loading admin panel…</span>
    </div>
  `;

  try {
    await loadInitialData();
  } catch (error) {
    notifyError(error.message || 'Failed to load admin data.');
    content.innerHTML = '<p class="text-secondary mb-0">Unable to load admin data.</p>';
    return;
  }

  renderNav(nav, (sectionId) => renderSection(sectionId, content));
  renderSection('objects', content);

  if (isImpersonating()) {
    notifyInfo(`User view mode is active for user ${getEffectiveUserId()}.`);
  }
};
