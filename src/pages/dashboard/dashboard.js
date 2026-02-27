import './dashboard.css';
import { isAuthenticated, isAdmin, isImpersonating, getEffectiveUserId } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { enableTableColumnFilters } from '../../components/table-filters/table-filters.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';

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

// ─── Data fetchers ────────────────────────────────────────────────────────────

const fetchUserObjects = async (userId) =>
  supabase
    .from('properties')
    .select(`
      id, number, floor,
      payment_obligations (
        id, year, month, rate,
        payments ( id, status, date )
      )
    `)
    .eq('owner_user_id', userId)
    .order('number');

const fetchBuildingFinancials = async () =>
  supabase.rpc('get_building_financials');

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
      for (const ob of obj.payment_obligations ?? []) {
        const payment = ob.payments?.[0];
        if (payment?.status === 'paid') {
          collected += Number(ob.rate);
        } else {
          due += Number(ob.rate);
        }
      }
    }
  }

  return `
    <div class="row g-3 mb-5">
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm h-100 dashboard-summary-card">
          <div class="card-body">
            <p class="summary-label text-success">Collected</p>
            <p class="summary-amount text-success mb-0">${formatCurrency(collected)}</p>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="card border-0 shadow-sm h-100 dashboard-summary-card">
          <div class="card-body">
            <p class="summary-label text-danger">Still Due</p>
            <p class="summary-amount text-danger mb-0">${formatCurrency(due)}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  enableTableColumnFilters(container, { skipColumns: ['action'] });
};

const buildObjectObligationsHTML = (obj) => {
  const obligations = [...(obj.payment_obligations ?? [])].sort(
    (a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  if (!obligations.length) {
    return `
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white fw-semibold">Unit ${obj.number} &mdash; Floor ${obj.floor}</div>
        <div class="card-body text-secondary">No obligations registered for this unit.</div>
      </div>
    `;
  }

  const rows = obligations.map((ob) => {
    const payment = ob.payments?.[0] ?? null;
    const isPaid = payment?.status === 'paid';

    const statusBadge = isPaid
      ? `<span class="badge bg-success">Paid</span>`
      : `<span class="badge bg-warning text-dark">Pending</span>`;

    const actionCell = isPaid
      ? `<span class="text-secondary small">—</span>`
      : `<button
           type="button"
           class="btn btn-sm btn-primary pay-btn"
           data-obligation-id="${ob.id}"
           data-payment-id="${payment?.id ?? ''}"
         >Pay</button>`;

    return `
      <tr>
        <td>${MONTH_NAMES[ob.month - 1]} ${ob.year}</td>
        <td class="text-end">${formatCurrency(ob.rate)}</td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center">${actionCell}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-header bg-white fw-semibold">
        Unit ${obj.number} &mdash; Floor ${obj.floor}
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Period</th>
              <th class="text-end">Amount</th>
              <th class="text-center">Status</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
};

const buildObligationsSectionHTML = (objects) => {
  if (!objects.length) {
    return `<p class="text-secondary">No properties are assigned to your account.</p>`;
  }

  return objects.map(buildObjectObligationsHTML).join('');
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

  container.innerHTML = `
    <div class="dashboard-page">
      <div class="d-flex align-items-center gap-2 text-secondary py-5 justify-content-center">
        <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
        <span>Loading dashboard…</span>
      </div>
    </div>
  `;

  const userId = getEffectiveUserId();

  if (!userId) {
    navigateTo('/login');
    return;
  }

  const [{ data: objects, error: objectsError }, { data: financials, error: financialsError }] =
    await Promise.all([fetchUserObjects(userId), fetchBuildingFinancials()]);

  if (objectsError) {
    notifyError(`Failed to load your obligations: ${objectsError.message}`);
    container.innerHTML = `
      <div class="dashboard-page">
        <p class="text-secondary mb-0">Unable to load obligations right now.</p>
      </div>
    `;
    return;
  }

  if (financialsError) {
    console.warn('Building financials unavailable:', financialsError.message);
  }

  const safeObjects = objects ?? [];
  const safeFinancials = financialsError ? null : financials;

  container.innerHTML = `
    <div class="dashboard-page">
      ${buildSummaryHTML(safeFinancials, safeObjects)}
      <h2 class="h5 mb-3">Your Obligations</h2>
      <div id="obligations-container">
        ${buildObligationsSectionHTML(safeObjects)}
      </div>
    </div>
  `;

  attachPayHandlers(container, userId, () => renderDashboardPage(container));
};
