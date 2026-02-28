import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

export const createNonPersistentClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

export const ADMIN_SECTIONS = [
  { id: 'objects', label: 'Properties', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
  { id: 'rates', label: 'Rates', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  { id: 'payment-obligations', label: 'Payment Obligations', showInNav: false, icon: '' },
  { id: 'events', label: 'Events', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { id: 'documents', label: 'Documents', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
  { id: 'messages', label: 'Messages', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
  { id: 'impersonation', label: 'View As User', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
  { id: 'profile', label: 'My Profile', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' }
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatDateTime = (value) =>
  new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export const state = {
  objects: [],
  profiles: [],
  propertyContacts: [],
  propertyContactsEnabled: true,
  rates: [],
  obligations: [],
  events: [],
  documents: [],
  messages: []
};

export const getPrevMonthYear = (year, month) => {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
};

export const getUserDisplay = (profile) => profile?.full_name || profile?.email || profile?.user_id;

const isMissingPropertyContactsTableError = (error) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || error?.status === 404;

export const loadInitialData = async () => {
  const [
    objectsRes,
    profilesRes,
    eventsRes,
    documentsRes,
    messagesRes
  ] = await Promise.all([
    supabase.from('properties').select('*').order('number'),
    supabase.from('profiles').select('*').order('full_name', { ascending: true, nullsFirst: false }),
    supabase.from('events').select('*').order('created_at', { ascending: false }),
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
    supabase.from('mass_messages').select('*').order('created_at', { ascending: false })
  ]);

  const errors = [
    objectsRes.error,
    profilesRes.error,
    eventsRes.error,
    documentsRes.error,
    messagesRes.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  state.objects = objectsRes.data ?? [];
  state.profiles = profilesRes.data ?? [];
  state.events = eventsRes.data ?? [];
  state.documents = documentsRes.data ?? [];
  state.messages = messagesRes.data ?? [];

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

export const loadObligationsData = async () => {
  const [obligationsRes, ratesRes] = await Promise.all([
    supabase
      .from('payment_obligations')
      .select('id,year,month,rate,payment_rate_id,independent_object_id,properties(number),payments(id,status,date),payment_rates(id,year,month,is_active)')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase
      .from('payment_rates')
      .select('id,year,month,is_active')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
  ]);

  if (obligationsRes.error) {
    throw obligationsRes.error;
  }

  if (ratesRes.error) {
    throw ratesRes.error;
  }

  state.obligations = obligationsRes.data ?? [];
  state.rates = ratesRes.data ?? [];
};

export const getRequestedSectionId = () => {
  const sectionId = new URLSearchParams(window.location.search).get('section');
  if (sectionId === 'obligations') {
    return 'rates';
  }

  return ADMIN_SECTIONS.some((section) => section.id === sectionId) ? sectionId : 'rates';
};

export const renderNav = (container, onSelect, activeSectionId = 'rates') => {
  container.textContent = '';

  const homeLink = document.createElement('a');
  homeLink.className = 'btn btn-outline-secondary text-start admin-nav-btn d-flex align-items-center gap-2';
  homeLink.href = '/admin';
  homeLink.setAttribute('data-link', 'router');
  homeLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Admin Home';
  container.appendChild(homeLink);

  ADMIN_SECTIONS.filter((section) => section.showInNav !== false).forEach((section) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-outline-secondary text-start admin-nav-btn d-flex align-items-center gap-2${section.id === activeSectionId ? ' active' : ''}`;
    button.dataset.sectionId = section.id;
    button.innerHTML = `${section.icon || ''} ${section.label}`;
    container.appendChild(button);
  });

  container.querySelectorAll('[data-section-id]').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('[data-section-id]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      onSelect(button.dataset.sectionId);
    });
  });
};
