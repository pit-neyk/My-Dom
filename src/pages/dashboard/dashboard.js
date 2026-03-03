import './dashboard.css';
import template from './dashboard.html?raw';
import summaryTemplate from './summary.html?raw';
import objectEmptyCardTemplate from './object-empty-card.html?raw';
import objectCardTemplate from './object-card.html?raw';
import obligationRowTemplate from './obligation-row.html?raw';
import statusPaidTemplate from './status-paid.html?raw';
import statusPendingTemplate from './status-pending.html?raw';
import actionEmptyTemplate from './action-empty.html?raw';
import actionPayTemplate from './action-pay.html?raw';
import { isAuthenticated, isAdmin, isImpersonating, getCurrentSession, getEffectiveUserId } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';
import { fillTemplate } from '../../lib/template.js';
import { enableTableColumnFilters } from '../../components/table-filters/table-filters.js';
import messageItemTemplate from '../admin-home/message-item.html?raw';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);

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
  toPaymentsArray(obligation?.payments).some((payment) => payment?.status === 'paid');

const hasPositiveAmount = (obligation) => Number(obligation?.rate ?? 0) > 0;

const isMissingPropertyContactsTableError = (error) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || error?.status === 404;

const PROPERTY_WITH_OBLIGATIONS_SELECT = `
  id, number, floor,
  payment_obligations (
    id, year, month, rate,
    payments ( id, status, date ),
    payment_rates ( is_active )
  )
`;

// ─── Data fetchers ────────────────────────────────────────────────────────────

const fetchPropertiesByIds = async (propertyIds) => {
  if (!propertyIds.length) {
    return { data: [], error: null };
  }

  return supabase
    .from('properties')
    .select(PROPERTY_WITH_OBLIGATIONS_SELECT)
    .in('id', propertyIds)
    .order('number');
};

const fetchOwnerContactPropertyIds = async (userEmail) => {
  const normalizedEmail = String(userEmail ?? '').trim();
  if (!normalizedEmail) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('property_contacts')
    .select('property_id')
    .eq('contact_type', 'owner')
    .ilike('email', normalizedEmail);

  if (error) {
    if (isMissingPropertyContactsTableError(error)) {
      return { data: [], error: null };
    }

    return { data: null, error };
  }

  const propertyIds = Array.from(
    new Set((data ?? []).map((row) => row?.property_id).filter(Boolean))
  );

  return { data: propertyIds, error: null };
};

const fetchUserObjects = async (userId, userEmail) => {
  const ownerRes = await supabase
    .from('properties')
    .select(PROPERTY_WITH_OBLIGATIONS_SELECT)
    .eq('owner_user_id', userId)
    .order('number');

  if (ownerRes.error) {
    return ownerRes;
  }

  const ownerObjects = ownerRes.data ?? [];
  const ownerObjectIdSet = new Set(ownerObjects.map((property) => property.id));

  const contactPropertyIdsRes = await fetchOwnerContactPropertyIds(userEmail);
  if (contactPropertyIdsRes.error) {
    return { data: null, error: contactPropertyIdsRes.error };
  }

  const additionalPropertyIds = (contactPropertyIdsRes.data ?? []).filter((id) => !ownerObjectIdSet.has(id));
  if (!additionalPropertyIds.length) {
    return { data: ownerObjects, error: null };
  }

  const contactRes = await fetchPropertiesByIds(additionalPropertyIds);
  if (contactRes.error) {
    return contactRes;
  }

  const merged = [...ownerObjects, ...(contactRes.data ?? [])].sort((left, right) =>
    String(left.number ?? '').localeCompare(String(right.number ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  return { data: merged, error: null };
};

const fetchBuildingFinancials = async () =>
  supabase.rpc('get_building_financials');

const fetchMessages = async () =>
  supabase
    .from('mass_messages')
    .select('id,title,content_html,created_at')
    .order('created_at', { ascending: false })
    .limit(10);

const fetchAllProperties = async () =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .order('number');

const fetchAllActiveObligations = async () =>
  supabase
    .from('payment_obligations')
    .select('id,rate,independent_object_id,payments(id,status),payment_rates!inner(is_active)')
    .eq('payment_rates.is_active', true);

const payObligation = async ({ obligationId, userId }) => {
  const today = new Date().toISOString().split('T')[0];

  return supabase
    .from('payments')
    .upsert(
      {
        payment_obligation_id: obligationId,
        status: 'paid',
        date: today,
        marked_by_user_id: userId
      },
      { onConflict: 'payment_obligation_id' }
    );
};

// ─── Render helpers ───────────────────────────────────────────────────────────

const buildSummaryHTML = (financials, objects) => {
  let collected = 0;
  let due = 0;

  if (financials) {
    collected = Number(financials.total_collected ?? 0);
    due = Number(financials.total_due ?? 0);
  } else {
    // Fallback: compute from the user's own visible data
    for (const obj of objects) {
      for (const ob of (obj.payment_obligations ?? []).filter((item) => item.payment_rates?.is_active === true)) {
        if (isObligationPaid(ob)) {
          collected += Number(ob.rate);
        } else {
          due += Number(ob.rate);
        }
      }
    }
  }

  return fillTemplate(summaryTemplate, {
    collected: formatCurrency(collected),
    due: formatCurrency(due)
  });
};

const buildObjectObligationsHTML = (obj, canPayActions) => {
  const obligations = [...(obj.payment_obligations ?? [])]
    .filter((obligation) => obligation.payment_rates?.is_active === true && hasPositiveAmount(obligation))
    .sort(
    (a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  if (!obligations.length) {
    return fillTemplate(objectEmptyCardTemplate, {
      number: obj.number,
      floor: obj.floor
    });
  }

  const rows = obligations.map((ob) => {
    const payment = toPaymentsArray(ob.payments)[0] ?? null;
    const isPaid = isObligationPaid(ob);

    const statusBadge = isPaid ? statusPaidTemplate : statusPendingTemplate;
    const actionCell = isPaid || !canPayActions
      ? actionEmptyTemplate
      : fillTemplate(actionPayTemplate, {
          obligationId: ob.id,
          paymentId: payment?.id ?? ''
        });

    return fillTemplate(obligationRowTemplate, {
      period: `${MONTH_NAMES[ob.month - 1]} ${ob.year}`,
      amount: formatCurrency(ob.rate),
      statusBadge,
      actionCell
    });
  }).join('');

  return fillTemplate(objectCardTemplate, {
    number: obj.number,
    floor: obj.floor,
    rows
  });
};

const buildPropertiesOverviewCounts = (properties, obligations = null) => {
  const totalProperties = properties.length;

  if (Array.isArray(obligations)) {
    const dueByPropertyId = new Map(properties.map((property) => [property.id, 0]));

    obligations.forEach((obligation) => {
      const propertyId = obligation.independent_object_id;
      if (!dueByPropertyId.has(propertyId)) {
        return;
      }

      if (!isObligationPaid(obligation)) {
        const currentDue = Number(dueByPropertyId.get(propertyId) ?? 0);
        dueByPropertyId.set(propertyId, currentDue + Number(obligation.rate ?? 0));
      }
    });

    const withObligations = Array.from(dueByPropertyId.values()).filter((due) => due > 0).length;
    const withoutObligations = totalProperties - withObligations;

    return { totalProperties, withObligations, withoutObligations };
  }

  const withObligations = properties.filter((obj) =>
    (obj.payment_obligations ?? [])
      .filter((obligation) => obligation.payment_rates?.is_active === true)
      .some((obligation) => !isObligationPaid(obligation))
  ).length;

  return {
    totalProperties,
    withObligations,
    withoutObligations: totalProperties - withObligations
  };
};

const buildPropertiesOverviewHTML = ({ totalProperties, withObligations, withoutObligations }) => {

  return `
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm h-100 dashboard-summary-card" data-dashboard-filter="all">
          <div class="card-body">
            <p class="summary-label text-secondary">Properties</p>
            <p class="summary-amount text-secondary mb-0">${totalProperties}</p>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm h-100 dashboard-summary-card dashboard-filter-card" data-dashboard-filter="debt" role="button" tabindex="0" aria-label="View properties with obligations">
          <div class="card-body">
            <p class="summary-label text-danger">With Obligations</p>
            <p class="summary-amount text-danger mb-0">${withObligations}</p>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-4">
        <div class="card border-0 shadow-sm h-100 dashboard-summary-card dashboard-filter-card" data-dashboard-filter="clear" role="button" tabindex="0" aria-label="View properties without obligations">
          <div class="card-body">
            <p class="summary-label text-success">Without Obligations</p>
            <p class="summary-amount text-success mb-0">${withoutObligations}</p>
          </div>
        </div>
      </div>
    </div>
  `;
};

const attachPropertiesOverviewHandlers = (slot) => {
  slot.querySelectorAll('.dashboard-filter-card').forEach((card) => {
    const applyFilter = () => {
      const filter = card.getAttribute('data-dashboard-filter');
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

const buildMessagesHTML = (messages) => {
  if (!messages.length) {
    return '<p class="text-secondary mb-0">No messages.</p>';
  }

  return messages
    .map((message) =>
      fillTemplate(messageItemTemplate, {
        title: message.title,
        createdAt: new Date(message.created_at).toLocaleString('bg-BG'),
        contentHtml: message.content_html
      })
    )
    .join('');
};

const renderDashboardLoadingState = (slot) => {
  slot.textContent = '';
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'd-flex align-items-center gap-2 text-secondary py-5 justify-content-center';
  const spinner = document.createElement('div');
  spinner.className = 'spinner-border spinner-border-sm';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Loading dashboard…';
  loadingWrap.append(spinner, text);
  slot.appendChild(loadingWrap);
};

const renderDashboardMessage = (slot, message) => {
  slot.textContent = '';
  const messageNode = document.createElement('p');
  messageNode.className = 'text-secondary mb-0';
  messageNode.textContent = message;
  slot.appendChild(messageNode);
};

// ─── Pay button handler ───────────────────────────────────────────────────────

const attachPayHandlers = (container, userId, rerender) => {
  container.querySelectorAll('.pay-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const obligationId = btn.dataset.obligationId;

      btn.disabled = true;
      btn.textContent = '…';

      try {
        const { error } = await payObligation({ obligationId, userId });

        if (error) {
          console.error('Pay obligation error:', error);
          btn.disabled = false;
          btn.textContent = 'Pay';
          notifyError(`Payment failed: ${error.message}`);
          return;
        }

        notifyInfo('Payment marked as paid.');
        rerender();
      } catch (err) {
        console.error('Unexpected error while paying obligation:', err);
        btn.disabled = false;
        btn.textContent = 'Pay';
        notifyError(`Unexpected error: ${err.message}`);
      }
    });
  });
};

// ─── Main renderer ────────────────────────────────────────────────────────────

export const renderDashboardPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (isAdmin() && !isImpersonating()) {
    navigateTo('/admin');
    return;
  }

  container.innerHTML = template;
  const stateSlot = container.querySelector('#dashboard-state');
  renderDashboardLoadingState(stateSlot);

  const userId = getEffectiveUserId();
  const userEmail = getCurrentSession()?.user?.email ?? '';
  const canPayActions = !(isAdmin() && isImpersonating());

  if (!userId) {
    navigateTo('/login');
    return;
  }

  const [
    { data: objects, error: objectsError },
    { data: financials, error: financialsError },
    { data: messages, error: messagesError },
    { data: allProperties, error: allPropertiesError },
    { data: allObligations, error: allObligationsError }
  ] = await Promise.all([
    fetchUserObjects(userId, userEmail),
    fetchBuildingFinancials(),
    fetchMessages(),
    fetchAllProperties(),
    fetchAllActiveObligations()
  ]);

  if (objectsError) {
    notifyError(`Failed to load your obligations: ${objectsError.message}`);
    renderDashboardMessage(stateSlot, 'Unable to load obligations right now.');
    return;
  }

  if (financialsError) {
    console.warn('Building financials unavailable:', financialsError.message);
  }

  if (messagesError) {
    console.warn('Messages unavailable:', messagesError.message);
  }

  if (allPropertiesError) {
    console.warn('All properties overview unavailable:', allPropertiesError.message);
  }

  if (allObligationsError) {
    console.warn('All obligations overview unavailable:', allObligationsError.message);
  }

  const safeObjects = objects ?? [];
  const safeFinancials = financialsError ? null : financials;
  const safeMessages = messages ?? [];
  const overviewCounts = buildPropertiesOverviewCounts(
    (allPropertiesError ? safeObjects : (allProperties ?? [])),
    allObligationsError ? null : (allObligations ?? [])
  );

  stateSlot.innerHTML = buildSummaryHTML(safeFinancials, safeObjects);
  stateSlot.insertAdjacentHTML('beforeend', buildPropertiesOverviewHTML(overviewCounts));
  attachPropertiesOverviewHandlers(stateSlot);

  const messagesSection = document.createElement('div');
  messagesSection.className = 'card border-0 shadow-sm mb-4';
  messagesSection.innerHTML = `
    <div class="card-body">
      <h2 class="h5 mb-3">Messages</h2>
      <div class="dashboard-messages-list">${buildMessagesHTML(safeMessages)}</div>
    </div>
  `;
  stateSlot.appendChild(messagesSection);

  const obligationsTitle = document.createElement('h2');
  obligationsTitle.className = 'h5 mb-3';
  obligationsTitle.textContent = 'Your Obligations';
  stateSlot.appendChild(obligationsTitle);

  const obligationsContainer = document.createElement('div');
  obligationsContainer.id = 'obligations-container';
  obligationsContainer.innerHTML = safeObjects.map((obj) => buildObjectObligationsHTML(obj, canPayActions)).join('');

  if (!safeObjects.length) {
    const emptyText = document.createElement('p');
    emptyText.className = 'text-secondary';
    emptyText.textContent = 'No properties are assigned to your account.';
    obligationsContainer.appendChild(emptyText);
  }

  stateSlot.appendChild(obligationsContainer);
  enableTableColumnFilters(obligationsContainer, { skipColumns: ['actions'] });

  if (canPayActions) {
    attachPayHandlers(container, userId, () => renderDashboardPage(container));
  }
};
