import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const createNonPersistentClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

export const ADMIN_SECTIONS = [
  { id: 'objects', label: 'Properties' },
  { id: 'obligations', label: 'Payment Obligations' },
  { id: 'events', label: 'Events' },
  { id: 'documents', label: 'Documents' },
  { id: 'messages', label: 'Messages' },
  { id: 'impersonation', label: 'View As User' },
  { id: 'profile', label: 'My Profile' }
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
  const obligationsRes = await supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number),payments(id,status,date)')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (obligationsRes.error) {
    throw obligationsRes.error;
  }

  state.obligations = obligationsRes.data ?? [];
};

export const getRequestedSectionId = () => {
  const sectionId = new URLSearchParams(window.location.search).get('section');
  return ADMIN_SECTIONS.some((section) => section.id === sectionId) ? sectionId : 'objects';
};

export const renderNav = (container, onSelect, activeSectionId = 'objects') => {
  container.textContent = '';

  const homeLink = document.createElement('a');
  homeLink.className = 'btn btn-outline-secondary text-start admin-nav-btn';
  homeLink.href = '/admin';
  homeLink.setAttribute('data-link', 'router');
  homeLink.textContent = 'Admin Home';
  container.appendChild(homeLink);

  ADMIN_SECTIONS.forEach((section) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-outline-secondary text-start admin-nav-btn${section.id === activeSectionId ? ' active' : ''}`;
    button.dataset.sectionId = section.id;
    button.textContent = section.label;
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
