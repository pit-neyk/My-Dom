import './payments.css';
import template from './payments.html?raw';
import rowNoDuesTemplate from './row-no-dues.html?raw';
import rowWithDuesTemplate from './row-with-dues.html?raw';
import emptyRowTemplate from './empty-row.html?raw';
import detailsPaidTemplate from './details-paid.html?raw';
import detailsPaidRowTemplate from './details-paid-row.html?raw';
import { getCurrentSession, isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';
import { fillTemplate } from '../../lib/template.js';
import { enableTableColumnFilters } from '../../components/table-filters/table-filters.js';

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

const fetchProperties = async () =>
  supabase
    .from('properties')
    .select('id,number,floor')
    .order('number');

const fetchObligations = async () =>
  supabase
    .from('payment_obligations')
    .select('id,year,month,rate,independent_object_id,properties(number,floor),payments(id,status,date),payment_rates!inner(is_active)')
    .eq('payment_rates.is_active', true)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

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

  const adminMode = isAdmin();
  const readOnlyMode = !adminMode;

  const mode = getDuesMode();
  renderBase(container, mode, readOnlyMode);

  const [
    { data: properties, error: propertiesError },
    { data: obligations, error: obligationsError },
    { data: financials, error: financialsError }
  ] = await Promise.all([fetchProperties(), fetchObligations(), fetchBuildingFinancials()]);

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
        .filter((obligation) => obligation.independent_object_id === property.id && !isObligationPaid(obligation))
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
    enableMainTableFilters();
    return;
  }

  if (mode === 'with_no_dues') {
    setTableHead(
      readOnlyMode
        ? [
            { label: 'Property' },
            { label: 'Floor' },
            { label: 'Total Due', className: 'text-end' },
            { label: 'Paid', className: 'text-end' },
            { label: 'Left', className: 'text-end' }
          ]
        : [
            { label: '' },
            { label: 'Property' },
            { label: 'Floor' },
            { label: 'Total Due', className: 'text-end' },
            { label: 'Paid', className: 'text-end' },
            { label: 'Left', className: 'text-end' }
          ]
    );

    tableBody.innerHTML = withNoDues.length
      ? withNoDues
          .map((item) => {
            if (readOnlyMode) {
              return `
                <tr class="payment-property-row" data-property-id="${item.propertyId}">
                  <td>${item.number}</td>
                  <td>${item.floor}</td>
                  <td class="text-end">${formatCurrency(item.totalDue)}</td>
                  <td class="text-end">${formatCurrency(item.paid)}</td>
                  <td class="text-end text-success">${formatCurrency(item.left)}</td>
                </tr>
              `;
            }

            return fillTemplate(rowNoDuesTemplate, {
              propertyId: item.propertyId,
              number: item.number,
              floor: item.floor,
              totalDue: formatCurrency(item.totalDue),
              paid: formatCurrency(item.paid),
              left: formatCurrency(item.left)
            });
          })
          .join('')
      : fillTemplate(emptyRowTemplate, { colspan: readOnlyMode ? 5 : 6, text: 'No properties without obligations.' });

    const showNoDuesDetails = (propertyId) => {
        const property = withNoDues.find((item) => item.propertyId === propertyId);
        if (!property) return;

        const payments = safeObligations
          .filter((obligation) => obligation.independent_object_id === propertyId)
          .flatMap((obligation) =>
            toPaymentsArray(obligation.payments)
              .filter((payment) => payment?.status === 'paid')
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

    if (readOnlyMode) {
      tableBody.querySelectorAll('.payment-property-row[data-property-id]').forEach((row) => {
        row.addEventListener('click', () => {
          showNoDuesDetails(row.getAttribute('data-property-id'));
        });
      });
    } else {
      tableBody.querySelectorAll('input[name="selected-property"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          showNoDuesDetails(radio.value);
        });
      });
    }

    enableMainTableFilters();
    return;
  }

  setTableHead(
    readOnlyMode
      ? [
          { label: 'Property' },
          { label: 'Floor' },
          { label: 'Period' },
          { label: 'Pending Total', className: 'text-end' }
        ]
      : [
          { label: '', className: 'text-center' },
          { label: 'Property' },
          { label: 'Floor' },
          { label: 'Period' },
          { label: 'Pending Total', className: 'text-end' }
        ]
  );

  if (!readOnlyMode) {
    const headerCheckbox = document.createElement('input');
    headerCheckbox.type = 'checkbox';
    headerCheckbox.className = 'form-check-input';
    headerCheckbox.id = 'select-all-due-properties';
    headerCheckbox.setAttribute('aria-label', 'Select all properties with obligations');

    const firstHeaderCell = tableHead.querySelector('th');
    if (firstHeaderCell) {
      firstHeaderCell.textContent = '';
      firstHeaderCell.classList.add('text-center');
      firstHeaderCell.appendChild(headerCheckbox);
    }
  }

  tableBody.innerHTML = withDues.length
    ? withDues
        .map((item) => {
          if (readOnlyMode) {
            return `
              <tr class="payment-property-row" data-property-id="${item.propertyId}">
                <td>${item.number}</td>
                <td>${item.floor}</td>
                <td>${item.periods}</td>
                <td class="text-end text-danger">${formatCurrency(item.due)}</td>
              </tr>
            `;
          }

          return fillTemplate(rowWithDuesTemplate, {
            propertyId: item.propertyId,
            number: item.number,
            floor: item.floor,
            periods: item.periods,
            due: formatCurrency(item.due)
          });
        })
        .join('')
    : fillTemplate(emptyRowTemplate, { colspan: readOnlyMode ? 4 : 5, text: 'No properties with obligations.' });

  const showReadOnlyWithDuesDetails = (propertyId) => {
      const property = propertiesById.get(propertyId);
      if (!property) {
        return;
      }

      const pendingObligations = safeObligations
        .filter((obligation) => obligation.independent_object_id === propertyId && !isObligationPaid(obligation))
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

  const showAdminWithDuesSelectionPanel = (propertyIds) => {
      const selectedPropertyIds = propertyIds ?? [];

      if (!selectedPropertyIds.length) {
        detailPanel.classList.add('d-none');
        detailContent.innerHTML = '';
        return;
      }

      const selectedPropertyIdSet = new Set(selectedPropertyIds);
      const pendingObligations = safeObligations
        .filter((obligation) => selectedPropertyIdSet.has(obligation.independent_object_id) && !isObligationPaid(obligation));

      const totalAmount = pendingObligations.reduce((sum, obligation) => sum + Number(obligation.rate ?? 0), 0);

      detailTitle.textContent = '';
      detailTitle.classList.add('d-none');
      detailContent.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="fw-semibold">Total Amount: ${formatCurrency(totalAmount)}</span>
          <button type="button" class="btn btn-sm btn-primary" id="pay-selected-property-obligations" ${pendingObligations.length ? '' : 'disabled'}>Pay Selected</button>
        </div>
      `;
      detailPanel.classList.remove('d-none');

      const paySelectedButton = container.querySelector('#pay-selected-property-obligations');
      if (!paySelectedButton) {
        return;
      }

      paySelectedButton.addEventListener('click', async () => {
        if (!pendingObligations.length) {
          return;
        }

        const userId = getCurrentSession()?.user?.id ?? null;
        const today = new Date().toISOString().split('T')[0];
        const payload = pendingObligations.map((obligation) => ({
          payment_obligation_id: obligation.id,
          status: 'paid',
          date: today,
          marked_by_user_id: userId
        }));

        paySelectedButton.disabled = true;
        const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'payment_obligation_id' });

        if (error) {
          notifyError(`Failed to pay selected obligations: ${error.message}`);
          paySelectedButton.disabled = false;
          return;
        }

        notifyInfo('Selected obligations marked as paid.');
        renderPaymentsPage(container);
      });
  };

  if (readOnlyMode) {
    tableBody.querySelectorAll('.payment-property-row[data-property-id]').forEach((row) => {
      row.addEventListener('click', () => {
        showReadOnlyWithDuesDetails(row.getAttribute('data-property-id'));
      });
    });
  } else {
    const propertyCheckboxes = Array.from(tableBody.querySelectorAll('input[name="selected-property"]'));
    const selectAllProperties = container.querySelector('#select-all-due-properties');

    const getSelectedPropertyIds = () =>
      propertyCheckboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);

    const refreshPropertySelection = () => {
      const selectedIds = getSelectedPropertyIds();

      if (selectAllProperties) {
        selectAllProperties.checked = propertyCheckboxes.length > 0 && selectedIds.length === propertyCheckboxes.length;
        selectAllProperties.indeterminate = selectedIds.length > 0 && selectedIds.length < propertyCheckboxes.length;
      }

      showAdminWithDuesSelectionPanel(selectedIds);
    };

    propertyCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', refreshPropertySelection);
    });

    selectAllProperties?.addEventListener('change', () => {
      const shouldCheck = selectAllProperties.checked;
      propertyCheckboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
      refreshPropertySelection();
    });

    refreshPropertySelection();
  }

  enableMainTableFilters();
};
