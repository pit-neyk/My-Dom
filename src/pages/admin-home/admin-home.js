import template from './admin-home.html?raw';
import './admin-home.css';
import { isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError } from '../../components/toast/toast.js';

const formatCurrency = (value) =>
  new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);

const fetchProperties = async () =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .order('number');

const fetchObligations = async () =>
  supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number,floor),payments(id,status,date)')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

const fetchBuildingFinancials = async () =>
  supabase.rpc('get_building_financials');

const fetchMessages = async () =>
  supabase
    .from('mass_messages')
    .select('id,title,content_html,created_at')
    .order('created_at', { ascending: false })
    .limit(10);

const toPaymentsArray = (payments) => {
  if (Array.isArray(payments)) {
    return payments;
  }

  if (payments && typeof payments === 'object') {
    return [payments];
  }

  return [];
};

const isObligationPaid = (obligation) =>
  toPaymentsArray(obligation.payments).some((payment) => payment?.status === 'paid');

export const renderAdminHomePage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (!isAdmin()) {
    navigateTo('/dashboard');
    return;
  }

  container.innerHTML = template;

  const [
    { data: properties, error: propertiesError },
    { data: obligations, error: obligationsError },
    { data: financials, error: financialsError },
    { data: messages, error: messagesError }
  ] = await Promise.all([fetchProperties(), fetchObligations(), fetchBuildingFinancials(), fetchMessages()]);

  if (propertiesError) {
    notifyError(`Failed to load properties overview: ${propertiesError.message}`);
    return;
  }

  if (obligationsError) {
    notifyError(`Failed to load obligations overview: ${obligationsError.message}`);
    return;
  }

  if (financialsError) {
    notifyError(`Failed to load building totals: ${financialsError.message}`);
  }

  if (messagesError) {
    notifyError(`Failed to load messages: ${messagesError.message}`);
  }

  const safeProperties = properties ?? [];
  const safeObligations = obligations ?? [];
  const safeMessages = messages ?? [];

  const pendingObligations = safeObligations.filter((obligation) => !isObligationPaid(obligation));
  const propertiesWithPendingSet = new Set(pendingObligations.map((obligation) => obligation.independent_object_id));

  const withDebt = safeProperties.filter((property) => propertiesWithPendingSet.has(property.id)).length;
  const noDebt = safeProperties.length - withDebt;

  const collected = Number(financials?.total_collected ?? 0);
  const due = Number(financials?.total_due ?? 0);

  container.querySelector('#admin-total-properties').textContent = String(safeProperties.length);
  container.querySelector('#admin-clear-properties').textContent = String(noDebt);
  container.querySelector('#admin-debt-properties').textContent = String(withDebt);
  container.querySelector('#admin-total-collected').textContent = formatCurrency(collected);
  container.querySelector('#admin-total-due').textContent = formatCurrency(due);

  const messagesContainer = container.querySelector('#admin-home-messages');
  messagesContainer.innerHTML = safeMessages.length
    ? safeMessages
        .map(
          (message) => `
            <article class="admin-home-message-item">
              <h3 class="h6 mb-1">${message.title}</h3>
              <p class="mb-1 text-secondary small">${new Date(message.created_at).toLocaleString('bg-BG')}</p>
              <div>${message.content_html}</div>
            </article>
          `
        )
        .join('')
    : '<p class="text-secondary mb-0">No messages.</p>';

  const filterCards = Array.from(container.querySelectorAll('.admin-home-filter-card'));

  filterCards.forEach((card) => {
    const applyFilter = () => {
      const filter = card.dataset.filter || 'all';

      if (filter === 'clear') {
        navigateTo('/payments?dues=with_no_dues');
        return;
      }

      if (filter === 'debt') {
        navigateTo('/payments?dues=with_dues');
      }
    };

    card.addEventListener('click', applyFilter);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        applyFilter();
      }
    });
  });
};
