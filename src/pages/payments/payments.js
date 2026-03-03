import './payments.css';
import template from './payments.html?raw';
import rowWithDuesTemplate from './row-with-dues.html?raw';
import emptyRowTemplate from './empty-row.html?raw';
import detailsPaidTemplate from './details-paid.html?raw';
import detailsPaidRowTemplate from './details-paid-row.html?raw';
import detailsPendingTemplate from './details-pending.html?raw';
import detailsPendingRowTemplate from './details-pending-row.html?raw';
import {
  getCurrentSession,
  isAdmin,
  isAuthenticated,
  isImpersonating
} from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';
import { fillTemplate } from '../../lib/template.js';
import { enableTableColumnFilters } from '../../components/table-filters/table-filters.js';
import { clearViewState, readViewState, writeViewState } from '../../lib/view-state.js';

const PAYMENTS_VIEW_STATE_KEY = 'payments_page_state';

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

const fetchAllProperties = async () =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .order('number');

const fetchAllActiveObligations = async () =>
  supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number,floor),payments(id,status,date),payment_rates!inner(is_active)')
    .eq('payment_rates.is_active', true)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

const isMissingPropertyContactsTableError = (error) =>
  error?.code === 'PGRST205' || error?.code === '42P01' || error?.status === 404;

const fetchPropertiesByOwnerUserId = async (userId) =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .eq('owner_user_id', userId)
    .order('number');

const fetchPropertiesByIds = async (propertyIds) => {
  if (!propertyIds.length) {
    return { data: [], error: null };
  }

  return supabase
    .from('properties')
    .select('id,number,floor')
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

const fetchUserScopedProperties = async (userId, userEmail) => {
  const ownedRes = await fetchPropertiesByOwnerUserId(userId);
  if (ownedRes.error) {
    return ownedRes;
  }

  const owned = ownedRes.data ?? [];
  const ownedIdSet = new Set(owned.map((item) => item.id));

  const contactIdsRes = await fetchOwnerContactPropertyIds(userEmail);
  if (contactIdsRes.error) {
    return { data: null, error: contactIdsRes.error };
  }

  const additionalIds = (contactIdsRes.data ?? []).filter((id) => !ownedIdSet.has(id));
  if (!additionalIds.length) {
    return { data: owned, error: null };
  }

  const additionalRes = await fetchPropertiesByIds(additionalIds);
  if (additionalRes.error) {
    return additionalRes;
  }

  const merged = [...owned, ...(additionalRes.data ?? [])].sort((left, right) =>
    String(left.number ?? '').localeCompare(String(right.number ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );

  return { data: merged, error: null };
};

const fetchObligationsForPropertyIds = async (propertyIds) => {
  if (!propertyIds.length) {
    return { data: [], error: null };
  }

  return supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number,floor),payments(id,status,date),payment_rates!inner(is_active)')
    .eq('payment_rates.is_active', true)
    .in('independent_object_id', propertyIds)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
};

const fetchBuildingFinancials = async () =>
  supabase.rpc('get_building_financials');

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

const hasPositiveAmount = (obligation) => Number(obligation?.rate ?? 0) > 0;

const getDuesMode = () => {
  const dues = new URLSearchParams(window.location.search).get('dues');
  if (dues === 'collected') {
    return 'collected';
  }

  if (dues === 'still_due') {
    return 'still_due';
  }

  return dues === 'with_no_dues' ? 'with_no_dues' : 'with_dues';
};

const renderBase = (container, mode, readOnly = false) => {
  const titleByMode = {
    with_no_dues: 'Properties Without Obligations',
    with_dues: 'Properties With Obligations',
    collected: 'Collected Obligations',
    still_due: 'Properties With Obligations'
  };
  const title = titleByMode[mode] ?? 'Properties With Obligations';

  container.innerHTML = template;

  const titleNode = container.querySelector('#payments-page-title');
  const withoutObligationsLink = container.querySelector('#payments-without-obligations-link');
  const withObligationsLink = container.querySelector('#payments-with-obligations-link');

  if (titleNode) {
    titleNode.textContent = title;
  }

  if (readOnly) {
    const sidebar = container.querySelector('aside.col-12.col-lg-3');
    sidebar?.remove();

    const mainColumn = container.querySelector('.col-12.col-lg-9');
    mainColumn?.classList.remove('col-lg-9');
    mainColumn?.classList.add('col-lg-12');
  }

  withoutObligationsLink?.classList.toggle('btn-primary', mode === 'with_no_dues');
  withoutObligationsLink?.classList.toggle('btn-outline-secondary', mode !== 'with_no_dues');
  withObligationsLink?.classList.toggle('btn-primary', mode === 'with_dues');
  withObligationsLink?.classList.toggle('btn-outline-secondary', mode !== 'with_dues');
};

export const renderPaymentsPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  const adminMode = isAdmin() && !isImpersonating();
  const readOnlyMode = !adminMode;

  const mode = getDuesMode();
  const viewState = readViewState(PAYMENTS_VIEW_STATE_KEY, {
    mode: '',
    selectedPropertyId: ''
  });

  if (viewState.mode !== mode) {
    clearViewState(PAYMENTS_VIEW_STATE_KEY);
  }

  const persistedSelectedPropertyId = viewState.mode === mode ? String(viewState.selectedPropertyId ?? '') : '';
  renderBase(container, mode, readOnlyMode);

  const [
    { data: properties, error: propertiesError },
    { data: obligations, error: obligationsError },
    { data: financials, error: financialsError }
  ] = await Promise.all([fetchAllProperties(), fetchAllActiveObligations(), fetchBuildingFinancials()]);

  if (propertiesError || obligationsError) {
    notifyError(`Failed to load payments page data: ${propertiesError?.message || obligationsError?.message}`);
    return;
  }

  if (financialsError) {
    notifyError(`Failed to load building totals: ${financialsError.message}`);
  }

  const safeProperties = properties ?? [];
  const safeObligations = obligations ?? [];
  const propertiesById = new Map(safeProperties.map((property) => [property.id, property]));

  const propertyTotals = new Map(safeProperties.map((property) => [property.id, { paid: 0, due: 0 }]));

  safeObligations.forEach((obligation) => {
    const propertyId = obligation.independent_object_id;
    if (!propertyTotals.has(propertyId)) {
      propertyTotals.set(propertyId, { paid: 0, due: 0 });
    }

    const rate = Number(obligation.rate ?? 0);
    const current = propertyTotals.get(propertyId);
    if (isObligationPaid(obligation)) {
      current.paid += rate;
    } else {
      current.due += rate;
    }
  });

  const withNoDues = safeProperties
    .filter((property) => (propertyTotals.get(property.id)?.due ?? 0) === 0)
    .map((property) => {
      const totals = propertyTotals.get(property.id) ?? { paid: 0, due: 0 };
      return {
        propertyId: property.id,
        number: property.number,
        floor: property.floor,
        totalDue: totals.paid + totals.due,
        paid: totals.paid,
        left: totals.due
      };
    });

  const withDues = safeProperties
    .filter((property) => (propertyTotals.get(property.id)?.due ?? 0) > 0)
    .map((property) => {
      const totals = propertyTotals.get(property.id) ?? { paid: 0, due: 0 };
      const periods = safeObligations
        .filter((obligation) =>
          obligation.independent_object_id === property.id
          && !isObligationPaid(obligation)
          && hasPositiveAmount(obligation)
        )
        .sort((a, b) => (b.year - a.year) || (b.month - a.month))
        .map((obligation) => `${MONTH_NAMES[(obligation.month ?? 1) - 1]} ${obligation.year}`)
        .join(', ');

      return {
        propertyId: property.id,
        number: property.number,
        floor: property.floor,
        due: totals.due,
        periods
      };
    });

  const collectedObligations = safeObligations
    .flatMap((obligation) => {
      if (!hasPositiveAmount(obligation)) {
        return [];
      }

      const paidPayment = toPaymentsArray(obligation.payments)
        .find((payment) => payment?.status === 'paid');

      if (!paidPayment) {
        return [];
      }

      const property = propertiesById.get(obligation.independent_object_id);

      return [{
        propertyId: obligation.independent_object_id,
        number: property?.number ?? '-',
        floor: property?.floor ?? '-',
        year: obligation.year,
        month: obligation.month,
        amount: Number(obligation.rate ?? 0),
        paidDate: paidPayment.date
      }];
    })
    .sort((a, b) => (b.year - a.year) || (b.month - a.month));

  const tableHead = container.querySelector('#payments-table-head');
  const tableBody = container.querySelector('#payments-table-body');
  const detailPanel = container.querySelector('#payments-detail-panel');
  const detailTitle = container.querySelector('#payments-detail-title');
  const detailContent = container.querySelector('#payments-detail-content');

  const setTableHead = (columns) => {
    tableHead.textContent = '';
    const row = document.createElement('tr');
    columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column.label;
      if (column.className) {
        th.className = column.className;
      }
      row.appendChild(th);
    });
    tableHead.appendChild(row);
  };

  const enableMainTableFilters = () => {
    enableTableColumnFilters(container, {
      tableSelector: '#payments-main-table',
      skipColumns: ['actions']
    });
  };

  const showDetails = (title, content) => {
    detailTitle.classList.remove('d-none');
    detailTitle.textContent = title;
    detailContent.innerHTML = content;
    detailPanel.classList.remove('d-none');
  };

  if (mode === 'collected') {
    setTableHead([
      { label: 'Property' },
      { label: 'Floor' },
      { label: 'Period' },
      { label: 'Paid Amount', className: 'text-end' },
      { label: 'Paid On', className: 'text-end' }
    ]);

    const collectedTotal = collectedObligations.reduce((sum, item) => sum + item.amount, 0);

    tableBody.innerHTML = collectedObligations.length
      ? `
          ${collectedObligations
            .map((item) => `
              <tr>
                <td>${item.number}</td>
                <td>${item.floor}</td>
                <td>${MONTH_NAMES[(item.month ?? 1) - 1]} ${item.year}</td>
                <td class="text-end text-success">${formatCurrency(item.amount)}</td>
                <td class="text-end">${item.paidDate ? new Date(item.paidDate).toLocaleDateString('bg-BG') : '-'}</td>
              </tr>
            `)
            .join('')}
          <tr class="table-light fw-semibold" data-sort-fixed-bottom="true">
            <td colspan="3" class="text-end">Total</td>
            <td class="text-end text-success">${formatCurrency(collectedTotal)}</td>
            <td></td>
          </tr>
        `
      : fillTemplate(emptyRowTemplate, { colspan: 5, text: 'No paid obligations found.' });

    detailPanel.classList.add('d-none');
    detailContent.innerHTML = '';
    clearViewState(PAYMENTS_VIEW_STATE_KEY);
    enableMainTableFilters();
    return;
  }

  if (mode === 'still_due') {
    setTableHead([
      { label: 'Property' },
      { label: 'Floor' },
      { label: 'Period' },
      { label: 'Pending Total', className: 'text-end' }
    ]);

    const dueTotal = withDues.reduce((sum, item) => sum + Number(item.due ?? 0), 0);

    tableBody.innerHTML = withDues.length
      ? `
          ${withDues
            .map((item) => `
              <tr>
                <td>${item.number}</td>
                <td>${item.floor}</td>
                <td>${item.periods || '-'}</td>
                <td class="text-end text-danger">${formatCurrency(item.due)}</td>
              </tr>
            `)
            .join('')}
          <tr class="table-light fw-semibold" data-sort-fixed-bottom="true">
            <td colspan="3" class="text-end">Total</td>
            <td class="text-end text-danger">${formatCurrency(dueTotal)}</td>
          </tr>
        `
      : fillTemplate(emptyRowTemplate, { colspan: 4, text: 'No properties with obligations.' });

    detailPanel.classList.add('d-none');
    detailContent.innerHTML = '';
    clearViewState(PAYMENTS_VIEW_STATE_KEY);
    enableMainTableFilters();
    return;
  }

  if (mode === 'with_no_dues') {
    setTableHead([
      { label: 'Property' },
      { label: 'Floor' },
      { label: 'Total Due', className: 'text-end' },
      { label: 'Paid', className: 'text-end' },
      { label: 'Left', className: 'text-end' }
    ]);

    tableBody.innerHTML = withNoDues.length
      ? withNoDues
          .map((item) => `
            <tr class="payment-property-row" data-property-id="${item.propertyId}">
              <td>${item.number}</td>
              <td>${item.floor}</td>
              <td class="text-end">${formatCurrency(item.totalDue)}</td>
              <td class="text-end">${formatCurrency(item.paid)}</td>
              <td class="text-end text-success">${formatCurrency(item.left)}</td>
            </tr>
          `)
          .join('')
      : fillTemplate(emptyRowTemplate, { colspan: 5, text: 'No properties without obligations.' });

    const showNoDuesDetails = (propertyId) => {
        writeViewState(PAYMENTS_VIEW_STATE_KEY, {
          mode,
          selectedPropertyId: String(propertyId ?? '')
        });

        const property = withNoDues.find((item) => item.propertyId === propertyId);
        if (!property) return;

        const payments = safeObligations
          .filter((obligation) => obligation.independent_object_id === propertyId)
          .flatMap((obligation) =>
            toPaymentsArray(obligation.payments)
              .filter((payment) => payment?.status === 'paid')
              .filter(() => hasPositiveAmount(obligation))
              .map((payment) => ({
                month: obligation.month,
                year: obligation.year,
                amount: Number(obligation.rate ?? 0),
                date: payment?.date ?? null
              }))
          )
          .sort((a, b) => (b.year - a.year) || (b.month - a.month));

        const detailsRows = payments.length
          ? payments
              .map((payment) =>
                fillTemplate(detailsPaidRowTemplate, {
                  period: `${MONTH_NAMES[(payment.month ?? 1) - 1]} ${payment.year}`,
                  amount: formatCurrency(payment.amount),
                  date: payment.date ? new Date(payment.date).toLocaleDateString('bg-BG') : '-'
                })
              )
              .join('')
          : fillTemplate(emptyRowTemplate, { colspan: 3, text: 'No payments found.' });

        const detailsHtml = fillTemplate(detailsPaidTemplate, { rows: detailsRows });

        showDetails(`Payments for ${property.number}`, detailsHtml);
    };

    tableBody.querySelectorAll('.payment-property-row[data-property-id]').forEach((row) => {
      row.addEventListener('click', () => {
        showNoDuesDetails(row.getAttribute('data-property-id'));
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showNoDuesDetails(row.getAttribute('data-property-id'));
        }
      });
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Show payments for property ${row.children[0]?.textContent ?? ''}`);
    });

    if (persistedSelectedPropertyId) {
      const persistedRow = tableBody.querySelector(`[data-property-id="${CSS.escape(persistedSelectedPropertyId)}"]`);
      if (persistedRow) {
        showNoDuesDetails(persistedSelectedPropertyId);
      }
    }

    enableMainTableFilters();
    return;
  }

  setTableHead(
    [
      { label: 'Property' },
      { label: 'Floor' },
      { label: 'Period' },
      { label: 'Pending Total', className: 'text-end' }
    ]
  );

  tableBody.innerHTML = withDues.length
    ? withDues
        .map((item) => fillTemplate(rowWithDuesTemplate, {
          propertyId: item.propertyId,
          number: item.number,
          floor: item.floor,
          periods: item.periods,
          due: formatCurrency(item.due)
        }))
        .join('')
    : fillTemplate(emptyRowTemplate, { colspan: 4, text: 'No properties with obligations.' });

  const showReadOnlyWithDuesDetails = (propertyId) => {
      writeViewState(PAYMENTS_VIEW_STATE_KEY, {
        mode,
        selectedPropertyId: String(propertyId ?? '')
      });

      const property = propertiesById.get(propertyId);
      if (!property) {
        return;
      }

      const pendingObligations = safeObligations
        .filter((obligation) =>
          obligation.independent_object_id === propertyId
          && !isObligationPaid(obligation)
          && hasPositiveAmount(obligation)
        )
        .sort((a, b) => (b.year - a.year) || (b.month - a.month));

      const readOnlyRows = pendingObligations.length
        ? pendingObligations
            .map((obligation) => `
              <tr>
                <td>${MONTH_NAMES[(obligation.month ?? 1) - 1]} ${obligation.year}</td>
                <td class="text-end">${formatCurrency(Number(obligation.rate ?? 0))}</td>
                <td><span class="badge bg-danger-subtle text-danger-emphasis">Pending</span></td>
              </tr>
            `)
            .join('')
        : fillTemplate(emptyRowTemplate, { colspan: 3, text: 'No pending obligations.' });

      const readOnlyDetailsHtml = `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Period</th>
                <th class="text-end">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${readOnlyRows}</tbody>
          </table>
        </div>
      `;

      showDetails(`Obligations for ${property.number}`, readOnlyDetailsHtml);
  };

  const getPendingObligationsForProperty = (propertyId) =>
    safeObligations
      .filter((obligation) =>
        obligation.independent_object_id === propertyId
        && !isObligationPaid(obligation)
        && hasPositiveAmount(obligation)
      )
      .sort((a, b) => (b.year - a.year) || (b.month - a.month));

  const showAdminWithDuesDetails = (propertyId) => {
    writeViewState(PAYMENTS_VIEW_STATE_KEY, {
      mode,
      selectedPropertyId: String(propertyId ?? '')
    });

    const property = propertiesById.get(propertyId);
    if (!property) {
      return;
    }

    const pendingObligations = getPendingObligationsForProperty(propertyId);

    const rows = pendingObligations.length
      ? pendingObligations
          .map((obligation) =>
            fillTemplate(detailsPendingRowTemplate, {
              id: obligation.id,
              amountRaw: Number(obligation.rate ?? 0),
              period: `${MONTH_NAMES[(obligation.month ?? 1) - 1]} ${obligation.year}`,
              amount: formatCurrency(Number(obligation.rate ?? 0))
            })
          )
          .join('')
      : fillTemplate(emptyRowTemplate, { colspan: 4, text: 'No pending obligations.' });

    showDetails(
      `Obligations for ${property.number}`,
      fillTemplate(detailsPendingTemplate, {
        rows,
        disabled: pendingObligations.length ? '' : 'disabled'
      })
    );

    const selectAll = container.querySelector('#select-all-property-obligations');
    const selectedAmountNode = container.querySelector('#selected-obligations-total-amount');
    const paySelectedButton = container.querySelector('#pay-selected-property-obligations');
    const obligationCheckboxes = Array.from(container.querySelectorAll('[data-obligation-id]'));

    const updateSelectionState = () => {
      const selectedCheckboxes = obligationCheckboxes.filter((checkbox) => checkbox.checked);
      const selectedTotal = selectedCheckboxes
        .reduce((sum, checkbox) => sum + Number(checkbox.getAttribute('data-obligation-amount') ?? 0), 0);

      if (selectedAmountNode) {
        selectedAmountNode.textContent = formatCurrency(selectedTotal);
      }

      if (paySelectedButton) {
        paySelectedButton.disabled = selectedCheckboxes.length === 0;
      }

      if (selectAll) {
        selectAll.checked = obligationCheckboxes.length > 0 && selectedCheckboxes.length === obligationCheckboxes.length;
        selectAll.indeterminate = selectedCheckboxes.length > 0 && selectedCheckboxes.length < obligationCheckboxes.length;
      }
    };

    obligationCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', updateSelectionState);
    });

    selectAll?.addEventListener('change', () => {
      const shouldCheck = selectAll.checked;
      obligationCheckboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
      updateSelectionState();
    });

    paySelectedButton?.addEventListener('click', async () => {
      const selectedObligationIds = obligationCheckboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.getAttribute('data-obligation-id'));

      if (!selectedObligationIds.length) {
        return;
      }

      const obligationsToPay = pendingObligations.filter((obligation) => selectedObligationIds.includes(obligation.id));
      if (!obligationsToPay.length) {
        return;
      }

      const userId = getCurrentSession()?.user?.id ?? null;
      const today = new Date().toISOString().split('T')[0];
      const payload = obligationsToPay.map((obligation) => ({
        payment_obligation_id: obligation.id,
        status: 'paid',
        date: today,
        marked_by_user_id: userId
      }));

      paySelectedButton.disabled = true;
      const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'payment_obligation_id' });

      if (error) {
        notifyError(`Failed to pay selected obligations: ${error.message}`);
        updateSelectionState();
        return;
      }

      notifyInfo('Selected obligations marked as paid.');
      renderPaymentsPage(container);
    });

    updateSelectionState();
  };

  tableBody.querySelectorAll('.payment-property-row[data-property-id]').forEach((row) => {
    const setActiveRow = () => {
      tableBody.querySelectorAll('.payment-property-row-active').forEach((activeRow) => {
        activeRow.classList.remove('payment-property-row-active');
      });
      row.classList.add('payment-property-row-active');
    };

    const showDetailsForRow = () => {
      const propertyId = row.getAttribute('data-property-id');
      if (!propertyId) {
        return;
      }

      setActiveRow();

      if (readOnlyMode) {
        showReadOnlyWithDuesDetails(propertyId);
        return;
      }

      showAdminWithDuesDetails(propertyId);
    };

    row.addEventListener('click', showDetailsForRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showDetailsForRow();
      }
    });
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Show obligations for property ${row.children[0]?.textContent ?? ''}`);
  });

  if (persistedSelectedPropertyId) {
    const persistedRow = tableBody.querySelector(`[data-property-id="${CSS.escape(persistedSelectedPropertyId)}"]`);
    if (persistedRow) {
      const persistedDetailsHandler = () => {
        const propertyId = persistedRow.getAttribute('data-property-id');
        if (!propertyId) {
          return;
        }

        persistedRow.classList.add('payment-property-row-active');

        if (readOnlyMode) {
          showReadOnlyWithDuesDetails(propertyId);
        } else {
          showAdminWithDuesDetails(propertyId);
        }
      };

      persistedDetailsHandler();
    }
  }

  enableMainTableFilters();
};
