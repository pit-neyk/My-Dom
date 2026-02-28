import './payments.css';
import { getCurrentSession, isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
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

const renderBase = (container, mode) => {
  const title = mode === 'with_no_dues' ? 'Properties Without Obligations' : 'Properties With Obligations';

  container.innerHTML = `
    <section class="payments-page">
      <div class="row g-4">
        <aside class="col-12 col-lg-3">
          <div class="card border-0 shadow-sm sticky-top payments-sidebar">
            <div class="card-body">
              <div class="nav flex-column nav-pills gap-2">
                <a class="btn btn-outline-secondary text-start" href="/admin" data-link="router">Admin Home</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=objects" data-link="router">Properties</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=obligations" data-link="router">Payment Obligations</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=events" data-link="router">Events</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=documents" data-link="router">Documents</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=messages" data-link="router">Messages</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=impersonation" data-link="router">View As User</a>
                <a class="btn btn-outline-secondary text-start" href="/admin/panel?section=profile" data-link="router">My Profile</a>
              </div>
            </div>
          </div>
        </aside>

        <div class="col-12 col-lg-9">
          <div class="card border-0 shadow-sm mb-3">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <h2 class="h5 mb-0">${title}</h2>
                <div class="d-flex gap-2">
                  <a class="btn btn-sm ${mode === 'with_no_dues' ? 'btn-primary' : 'btn-outline-secondary'}" href="/payments?dues=with_no_dues" data-link="router">Without Obligations</a>
                  <a class="btn btn-sm ${mode === 'with_dues' ? 'btn-primary' : 'btn-outline-secondary'}" href="/payments?dues=with_dues" data-link="router">With Obligations</a>
                </div>
              </div>
            </div>
          </div>

          <div class="card border-0 shadow-sm">
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                  <thead id="payments-table-head"></thead>
                  <tbody id="payments-table-body">
                    <tr><td colspan="7" class="text-secondary">Loading...</td></tr>
                  </tbody>
                </table>
              </div>

              <div id="payments-detail-panel" class="payment-details-panel d-none mt-3">
                <h3 class="h6 mb-3" id="payments-detail-title">Details</h3>
                <div id="payments-detail-content"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
};

export const renderPaymentsPage = async (container) => {
  if (!isAuthenticated()) {
    navigateTo('/login');
    return;
  }

  if (!isAdmin()) {
    navigateTo('/dashboard');
    return;
  }

  const mode = getDuesMode();
  renderBase(container, mode);

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

  const showDetails = (title, content) => {
    detailTitle.textContent = title;
    detailContent.innerHTML = content;
    detailPanel.classList.remove('d-none');
  };

  if (mode === 'with_no_dues') {
    tableHead.innerHTML = `
      <tr>
        <th></th>
        <th>Property</th>
        <th>Floor</th>
        <th class="text-end">Total Due</th>
        <th class="text-end">Paid</th>
        <th class="text-end">Left</th>
      </tr>
    `;

    tableBody.innerHTML = withNoDues.length
      ? withNoDues
          .map(
            (item) => `
              <tr class="payment-property-row">
                <td>
                  <input type="radio" class="form-check-input" name="selected-property" value="${item.propertyId}" aria-label="View payments for ${item.number}" />
                </td>
                <td>${item.number}</td>
                <td>${item.floor}</td>
                <td class="text-end">${formatCurrency(item.totalDue)}</td>
                <td class="text-end">${formatCurrency(item.paid)}</td>
                <td class="text-end text-success">${formatCurrency(item.left)}</td>
              </tr>
            `
          )
          .join('')
      : '<tr><td colspan="6" class="text-secondary">No properties without obligations.</td></tr>';

    tableBody.querySelectorAll('input[name="selected-property"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const propertyId = radio.value;
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

        const detailsHtml = `
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead><tr><th>Period</th><th class="text-end">Paid Amount</th><th>Date</th></tr></thead>
              <tbody>
                ${payments.length
                  ? payments
                      .map(
                        (payment) => `
                          <tr>
                            <td>${MONTH_NAMES[(payment.month ?? 1) - 1]} ${payment.year}</td>
                            <td class="text-end">${formatCurrency(payment.amount)}</td>
                            <td>${payment.date ? new Date(payment.date).toLocaleDateString('bg-BG') : '-'}</td>
                          </tr>
                        `
                      )
                      .join('')
                  : '<tr><td colspan="3" class="text-secondary">No payments found.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;

        showDetails(`Payments for ${property.number}`, detailsHtml);
      });
    });

    return;
  }

  tableHead.innerHTML = `
    <tr>
      <th></th>
      <th>Property</th>
      <th>Floor</th>
      <th class="text-end">Pending Total</th>
      <th class="text-end">Pending Items</th>
    </tr>
  `;

  tableBody.innerHTML = withDues.length
    ? withDues
        .map(
          (item) => `
            <tr class="payment-property-row">
              <td>
                <input type="radio" class="form-check-input" name="selected-property" value="${item.propertyId}" aria-label="View obligations for ${item.number}" />
              </td>
              <td>${item.number}</td>
              <td>${item.floor}</td>
              <td class="text-end text-danger">${formatCurrency(item.due)}</td>
              <td class="text-end">${item.pendingCount}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5" class="text-secondary">No properties with obligations.</td></tr>';

  tableBody.querySelectorAll('input[name="selected-property"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const propertyId = radio.value;
      const property = propertiesById.get(propertyId);
      if (!property) return;

      const pendingObligations = safeObligations
        .filter((obligation) => obligation.independent_object_id === propertyId && !isObligationPaid(obligation))
        .sort((a, b) => (b.year - a.year) || (b.month - a.month));

      const detailsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="text-secondary small">Select one or many obligations to pay.</span>
          <button type="button" class="btn btn-sm btn-primary" id="pay-selected-property-obligations" ${pendingObligations.length ? '' : 'disabled'}>Pay Selected</button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th class="text-center"><input type="checkbox" class="form-check-input" id="select-all-property-obligations" /></th>
                <th>Period</th>
                <th class="text-end">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${pendingObligations.length
                ? pendingObligations
                    .map(
                      (obligation) => `
                        <tr>
                          <td class="text-center"><input type="checkbox" class="form-check-input" data-obligation-id="${obligation.id}" data-obligation-amount="${Number(obligation.rate ?? 0)}" /></td>
                          <td>${MONTH_NAMES[(obligation.month ?? 1) - 1]} ${obligation.year}</td>
                          <td class="text-end">${formatCurrency(Number(obligation.rate ?? 0))}</td>
                          <td><span class="badge bg-danger-subtle text-danger-emphasis">Pending</span></td>
                        </tr>
                      `
                    )
                    .join('')
                : '<tr><td colspan="4" class="text-secondary">No pending obligations.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

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
    });
  });
};
