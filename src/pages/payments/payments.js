import './payments.css';
import template from './payments.html?raw';
import rowNoDuesTemplate from './row-no-dues.html?raw';
import rowWithDuesTemplate from './row-with-dues.html?raw';
import emptyRowTemplate from './empty-row.html?raw';
import detailsPaidTemplate from './details-paid.html?raw';
import detailsPaidRowTemplate from './details-paid-row.html?raw';
import detailsPendingTemplate from './details-pending.html?raw';
import detailsPendingRowTemplate from './details-pending-row.html?raw';
import { getCurrentSession, isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../components/toast/toast.js';
import { fillTemplate } from '../../lib/template.js';

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
  return dues === 'with_no_dues' ? 'with_no_dues' : 'with_dues';
};

const renderBase = (container, mode, readOnly = false) => {
  const title = mode === 'with_no_dues' ? 'Properties Without Obligations' : 'Properties With Obligations';

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
      const pendingCount = safeObligations.filter(
        (obligation) => obligation.independent_object_id === property.id && !isObligationPaid(obligation)
      ).length;

      return {
        propertyId: property.id,
        number: property.number,
        floor: property.floor,
        due: totals.due,
        pendingCount
      };
    });

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

  const showDetails = (title, content) => {
    detailTitle.textContent = title;
    detailContent.innerHTML = content;
    detailPanel.classList.remove('d-none');
  };

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

    return;
  }

  setTableHead(
    readOnlyMode
      ? [
          { label: 'Property' },
          { label: 'Floor' },
          { label: 'Pending Total', className: 'text-end' },
          { label: 'Pending Items', className: 'text-end' }
        ]
      : [
          { label: '' },
          { label: 'Property' },
          { label: 'Floor' },
          { label: 'Pending Total', className: 'text-end' },
          { label: 'Pending Items', className: 'text-end' }
        ]
  );

  tableBody.innerHTML = withDues.length
    ? withDues
        .map((item) => {
          if (readOnlyMode) {
            return `
              <tr class="payment-property-row" data-property-id="${item.propertyId}">
                <td>${item.number}</td>
                <td>${item.floor}</td>
                <td class="text-end text-danger">${formatCurrency(item.due)}</td>
                <td class="text-end">${item.pendingCount}</td>
              </tr>
            `;
          }

          return fillTemplate(rowWithDuesTemplate, {
            propertyId: item.propertyId,
            number: item.number,
            floor: item.floor,
            due: formatCurrency(item.due),
            pendingCount: item.pendingCount
          });
        })
        .join('')
    : fillTemplate(emptyRowTemplate, { colspan: readOnlyMode ? 4 : 5, text: 'No properties with obligations.' });

  const showWithDuesDetails = (propertyId) => {
      const property = propertiesById.get(propertyId);
      if (!property) return;

      const pendingObligations = safeObligations
        .filter((obligation) => obligation.independent_object_id === propertyId && !isObligationPaid(obligation))
        .sort((a, b) => (b.year - a.year) || (b.month - a.month));

      const pendingRows = pendingObligations.length
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

      if (readOnlyMode) {
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
        return;
      }

      const detailsHtml = fillTemplate(detailsPendingTemplate, {
        rows: pendingRows,
        disabled: pendingObligations.length ? '' : 'disabled'
      });

      showDetails(`Obligations for ${property.number}`, detailsHtml);

      const selectAll = container.querySelector('#select-all-property-obligations');
      const paySelectedButton = container.querySelector('#pay-selected-property-obligations');

      const getCheckboxes = () => Array.from(container.querySelectorAll('[data-obligation-id]'));
      const getChecked = () => getCheckboxes().filter((checkbox) => checkbox.checked);

      const refreshSelection = () => {
        const all = getCheckboxes();
        const checked = getChecked();

        if (selectAll) {
          selectAll.checked = all.length > 0 && checked.length === all.length;
          selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
        }

        if (paySelectedButton) {
          paySelectedButton.disabled = checked.length === 0;
        }
      };

      if (selectAll) {
        selectAll.addEventListener('change', () => {
          const shouldCheck = selectAll.checked;
          getCheckboxes().forEach((checkbox) => {
            checkbox.checked = shouldCheck;
          });
          refreshSelection();
        });
      }

      getCheckboxes().forEach((checkbox) => {
        checkbox.addEventListener('change', refreshSelection);
      });

      if (paySelectedButton) {
        paySelectedButton.addEventListener('click', async () => {
          const selected = getChecked().map((checkbox) => checkbox.dataset.obligationId);
          if (!selected.length) return;

          const userId = getCurrentSession()?.user?.id ?? null;
          const today = new Date().toISOString().split('T')[0];
          const payload = selected.map((obligationId) => ({
            payment_obligation_id: obligationId,
            status: 'paid',
            date: today,
            marked_by_user_id: userId
          }));

          paySelectedButton.disabled = true;
          const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'payment_obligation_id' });

          if (error) {
            notifyError(`Failed to pay selected obligations: ${error.message}`);
            refreshSelection();
            return;
          }

          notifyInfo('Selected obligations marked as paid.');
          renderPaymentsPage(container);
        });
      }

      refreshSelection();
  };

  if (readOnlyMode) {
    tableBody.querySelectorAll('.payment-property-row[data-property-id]').forEach((row) => {
      row.addEventListener('click', () => {
        showWithDuesDetails(row.getAttribute('data-property-id'));
      });
    });
  } else {
    tableBody.querySelectorAll('input[name="selected-property"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        showWithDuesDetails(radio.value);
      });
    });
  }
};
