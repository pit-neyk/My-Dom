import template from './admin-home.html?raw';
import './admin-home.css';
import { getCurrentSession, isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { enableTableColumnFilters } from '../../components/table-filters/table-filters.js';
import { notifyError } from '../../components/toast/toast.js';

const formatCurrency = (value) =>
  new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'
];

const fetchProperties = async () =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .order('number');

const fetchObligations = async () =>
  supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number,floor),payments(id,status)')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

const fetchBuildingFinancials = async () =>
  supabase.rpc('get_building_financials');

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
    { data: financials, error: financialsError }
  ] = await Promise.all([fetchProperties(), fetchObligations(), fetchBuildingFinancials()]);

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

  const safeProperties = properties ?? [];
  const safeObligations = obligations ?? [];

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

  const pendingObligations = safeObligations.filter((obligation) => !isObligationPaid(obligation));

  const propertiesById = new Map(safeProperties.map((property) => [property.id, property]));
  const propertiesWithPendingSet = new Set(pendingObligations.map((obligation) => obligation.independent_object_id));

  const propertyFinancials = new Map(
    safeProperties.map((property) => [property.id, { paid: 0, due: 0 }])
  );

  safeObligations.forEach((obligation) => {
    const propertyId = obligation.independent_object_id;
    const rate = Number(obligation.rate ?? 0);

    if (!propertyFinancials.has(propertyId)) {
      propertyFinancials.set(propertyId, { paid: 0, due: 0 });
    }

    const current = propertyFinancials.get(propertyId);
    if (isObligationPaid(obligation)) {
      current.paid += rate;
    } else {
      current.due += rate;
    }
  });

  const pendingRows = pendingObligations
    .map((obligation) => {
      const objectId = obligation.independent_object_id;
      const property = propertiesById.get(objectId);
      return {
        propertyId: objectId,
        propertyNumber: obligation.properties?.number ?? property?.number ?? '-',
        floor: obligation.properties?.floor ?? property?.floor ?? '-',
        obligationId: obligation.id,
        year: obligation.year,
        month: obligation.month,
        rate: Number(obligation.rate ?? 0)
      };
    })
    .sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }

      if (a.month !== b.month) {
        return b.month - a.month;
      }

      return String(a.propertyNumber).localeCompare(String(b.propertyNumber), undefined, { numeric: true, sensitivity: 'base' });
    });

  const withDebt = safeProperties.filter((property) => propertiesWithPendingSet.has(property.id)).length;
  const noDebt = safeProperties.length - withDebt;

  const selectAllCheckbox = container.querySelector('#admin-select-all-obligations');
  const paySelectedButton = container.querySelector('#admin-pay-selected-btn');
  const selectedTotalLabel = container.querySelector('#admin-selected-total');

  const getEligibleCheckboxes = () => Array.from(
    container.querySelectorAll('[data-obligation-checkbox]:not(:disabled)')
  );

  const getCheckedCheckboxes = () => getEligibleCheckboxes().filter((checkbox) => checkbox.checked);

  const updateSelectionControls = () => {
    const eligible = getEligibleCheckboxes();
    const checked = getCheckedCheckboxes();
    const selectedTotal = checked.reduce((sum, checkbox) => sum + Number(checkbox.dataset.obligationAmount ?? 0), 0);

    const hasEligible = eligible.length > 0;
    selectAllCheckbox.disabled = !hasEligible;
    selectAllCheckbox.checked = hasEligible && checked.length === eligible.length;
    selectAllCheckbox.indeterminate = checked.length > 0 && checked.length < eligible.length;

    paySelectedButton.disabled = checked.length === 0;
    selectedTotalLabel.textContent = `Selected total: ${formatCurrency(selectedTotal)}`;
  };

  const renderRows = (filter = 'all') => {
    const clearRows = safeProperties
      .filter((property) => !propertiesWithPendingSet.has(property.id))
      .map((property) => ({
        propertyId: property.id,
        propertyNumber: property.number,
        floor: property.floor,
        paidAmount: propertyFinancials.get(property.id)?.paid ?? 0,
        dueAmount: propertyFinancials.get(property.id)?.due ?? 0
      }))
      .sort((a, b) => String(a.propertyNumber).localeCompare(String(b.propertyNumber), undefined, { numeric: true, sensitivity: 'base' }));

    const pendingRowsHtml = pendingRows
      .map(
        (obligation) => `
        <tr>
          <td class="text-center">
            <input
              class="form-check-input"
              type="checkbox"
              data-obligation-checkbox="${obligation.obligationId}"
              data-obligation-amount="${obligation.rate}"
              aria-label="Select obligation ${obligation.propertyNumber} ${MONTH_NAMES[(obligation.month ?? 1) - 1] ?? ''} ${obligation.year ?? ''}"
            />
          </td>
          <td>${obligation.propertyNumber}</td>
          <td>${obligation.floor}</td>
          <td>${MONTH_NAMES[(obligation.month ?? 1) - 1] ?? ''} ${obligation.year}</td>
          <td class="text-end">${formatCurrency(obligation.rate)}</td>
          <td>
            <span class="badge bg-danger-subtle text-danger-emphasis">Pending</span>
          </td>
        </tr>
      `
      )
      .join('');

    const clearRowsHtml = clearRows
      .map(
        (property) => `
        <tr>
          <td class="text-center">
            <input class="form-check-input" type="checkbox" disabled />
          </td>
          <td>${property.propertyNumber}</td>
          <td>${property.floor}</td>
          <td>-</td>
          <td class="text-end">
            <span class="d-block">Paid: ${formatCurrency(property.paidAmount)}</span>
            <span class="d-block text-secondary small">Left: ${formatCurrency(property.dueAmount)}</span>
          </td>
          <td>
            <span class="badge bg-success-subtle text-success-emphasis">Paid</span>
          </td>
        </tr>
      `
      )
      .join('');

    let rows = '';
    if (filter === 'debt') {
      rows = pendingRowsHtml;
    } else if (filter === 'clear') {
      rows = clearRowsHtml;
    } else {
      rows = `${pendingRowsHtml}${clearRowsHtml}`;
    }

    container.querySelector('#admin-properties-overview').innerHTML =
      rows || '<tr><td colspan="6" class="text-secondary">No properties found for the selected filter.</td></tr>';

    container.querySelectorAll('[data-obligation-checkbox]').forEach((checkbox) => {
      checkbox.addEventListener('change', updateSelectionControls);
    });

    enableTableColumnFilters(container, { skipColumns: [''] });

    updateSelectionControls();
  };

  const collected = Number(financials?.total_collected ?? 0);
  const due = Number(financials?.total_due ?? 0);

  container.querySelector('#admin-total-properties').textContent = String(safeProperties.length);
  container.querySelector('#admin-clear-properties').textContent = String(noDebt);
  container.querySelector('#admin-debt-properties').textContent = String(withDebt);
  container.querySelector('#admin-total-collected').textContent = formatCurrency(collected);
  container.querySelector('#admin-total-due').textContent = formatCurrency(due);

  const filterCards = Array.from(container.querySelectorAll('.admin-home-filter-card'));
  const setActiveFilter = (filter) => {
    filterCards.forEach((card) => {
      const isActive = card.dataset.filter === filter;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    renderRows(filter);
  };

  filterCards.forEach((card) => {
    const applyFilter = () => setActiveFilter(card.dataset.filter || 'all');
    card.addEventListener('click', applyFilter);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        applyFilter();
      }
    });
  });

  selectAllCheckbox.addEventListener('change', () => {
    const shouldCheck = selectAllCheckbox.checked;
    getEligibleCheckboxes().forEach((checkbox) => {
      checkbox.checked = shouldCheck;
    });
    updateSelectionControls();
  });

  paySelectedButton.addEventListener('click', async () => {
    const selectedObligationIds = getCheckedCheckboxes().map((checkbox) => checkbox.dataset.obligationCheckbox);

    if (selectedObligationIds.length === 0) {
      return;
    }

    const userId = getCurrentSession()?.user?.id;
    const today = new Date().toISOString().split('T')[0];
    const payload = selectedObligationIds.map((obligationId) => ({
      payment_obligation_id: obligationId,
      status: 'paid',
      date: today,
      marked_by_user_id: userId
    }));

    paySelectedButton.disabled = true;
    const originalLabel = paySelectedButton.textContent;
    paySelectedButton.textContent = 'Paying...';

    const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'payment_obligation_id' });

    if (error) {
      paySelectedButton.textContent = originalLabel;
      updateSelectionControls();
      notifyError(`Failed to mark obligations as paid: ${error.message}`);
      return;
    }

    await renderAdminHomePage(container);
  });

  setActiveFilter('all');
};
