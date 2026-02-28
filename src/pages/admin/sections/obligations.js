import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, loadObligationsData, MONTH_NAMES, getPrevMonthYear } from '../adminState.js';

export const renderObligationsSection = async (content) => {
  content.innerHTML = `
    <div class="d-flex align-items-center gap-2 text-secondary py-5 justify-content-center">
      <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
      <span>Loading payment obligations…</span>
    </div>
  `;

  try {
    await loadObligationsData();
  } catch (error) {
    notifyError(error.message || 'Failed to load payment obligations.');
    content.innerHTML = '<p class="text-secondary mb-0">Unable to load payment obligations.</p>';
    return;
  }

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

  const objectChecks = state.objects
    .map(
      (obj) => `
      <div class="form-check col-6 col-md-4">
        <input class="form-check-input" type="checkbox" name="object_ids" value="${obj.id}" id="ob-${obj.id}" />
        <label class="form-check-label" for="ob-${obj.id}">${obj.number}</label>
      </div>
    `
    )
    .join('');

  const rows = state.obligations
    .slice(0, 200)
    .map((ob) => {
      const paid = isObligationPaid(ob);

      return `
      <tr>
        <td class="text-center">
          <input class="form-check-input" type="checkbox" data-obligation-select="${ob.id}" ${paid ? 'disabled' : ''} />
        </td>
        <td>${MONTH_NAMES[ob.month - 1]} ${ob.year}</td>
        <td>${ob.properties?.number ?? '-'}</td>
        <td>${ob.rate}</td>
        <td>
          ${paid
            ? '<span class="badge bg-success-subtle text-success-emphasis">Paid</span>'
            : '<span class="badge bg-danger-subtle text-danger-emphasis">Pending</span>'}
        </td>
        <td class="admin-inline-actions">
          ${paid ? '' : `<button type="button" class="btn btn-sm btn-success" data-pay-obligation="${ob.id}">Pay</button>`}
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-obligation="${ob.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-obligation="${ob.id}">Delete</button>
        </td>
      </tr>
    `;
    })
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Existing Obligations</h3>
          <div class="admin-inline-actions">
            <button class="btn btn-sm btn-success" type="button" id="pay-selected-obligations-btn" disabled>Pay Selected</button>
            <button class="btn btn-sm btn-primary" type="button" id="open-obligation-form-btn">Create Obligation</button>
          </div>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th class="text-center"><input class="form-check-input" type="checkbox" id="select-all-obligations" aria-label="Select all pending obligations" /></th>
                <th>Period</th>
                <th>Object</th>
                <th>Rate</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm d-none" id="obligation-form-panel">
      <div class="card-body">
        <h3 class="h5 mb-3">Create / Update Obligations</h3>
        <form id="obligation-form" class="row g-3">
          <input type="hidden" name="id" />
          <div class="col-3">
            <label class="form-label">Year</label>
            <input class="form-control" name="year" type="number" min="2020" required value="${new Date().getFullYear()}" />
          </div>
          <div class="col-3">
            <label class="form-label">Month</label>
            <input class="form-control" name="month" type="number" min="1" max="12" required value="${new Date().getMonth() + 1}" />
          </div>
          <div class="col-3">
            <label class="form-label">Rate</label>
            <input class="form-control" name="rate" type="number" step="0.01" min="0" required />
          </div>
          <div class="col-3">
            <label class="form-label">Mode</label>
            <select class="form-select" name="mode">
              <option value="scratch">From scratch</option>
              <option value="copy">Copy previous month</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label">Target objects</label>
            <div class="row g-2">${objectChecks}</div>
          </div>
          <div class="col-12 admin-inline-actions">
            <button class="btn btn-primary" type="submit">Save</button>
            <button class="btn btn-outline-secondary" type="button" id="close-obligation-form-btn">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const obligationFormPanel = content.querySelector('#obligation-form-panel');
  enableTableColumnFilters(content, { skipColumns: ['', 'actions'] });

  const openObligationFormButton = content.querySelector('#open-obligation-form-btn');
  const paySelectedButton = content.querySelector('#pay-selected-obligations-btn');
  const selectAllCheckbox = content.querySelector('#select-all-obligations');
  const form = content.querySelector('#obligation-form');
  const closeObligationFormButton = content.querySelector('#close-obligation-form-btn');

  content.prepend(obligationFormPanel);

  const openObligationForm = () => {
    obligationFormPanel.classList.remove('d-none');
  };

  const closeObligationForm = () => {
    obligationFormPanel.classList.add('d-none');
  };

  openObligationFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openObligationForm();
  });

  closeObligationFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    closeObligationForm();
  });

  const getEligibleCheckboxes = () => Array.from(
    content.querySelectorAll('[data-obligation-select]:not(:disabled)')
  );

  const getCheckedCheckboxes = () => getEligibleCheckboxes().filter((checkbox) => checkbox.checked);

  const updateSelectionControls = () => {
    const eligible = getEligibleCheckboxes();
    const checked = getCheckedCheckboxes();

    if (selectAllCheckbox) {
      const hasEligible = eligible.length > 0;
      selectAllCheckbox.disabled = !hasEligible;
      selectAllCheckbox.checked = hasEligible && checked.length === eligible.length;
      selectAllCheckbox.indeterminate = checked.length > 0 && checked.length < eligible.length;
    }

    if (paySelectedButton) {
      paySelectedButton.disabled = checked.length === 0;
    }
  };

  const markObligationsAsPaid = async (obligationIds) => {
    if (!obligationIds.length) {
      return;
    }

    const userId = getCurrentSession()?.user?.id ?? null;
    const today = new Date().toISOString().split('T')[0];
    const payload = obligationIds.map((obligationId) => ({
      payment_obligation_id: obligationId,
      status: 'paid',
      date: today,
      marked_by_user_id: userId
    }));

    const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'payment_obligation_id' });

    if (error) {
      notifyError(error.message || 'Failed to mark selected obligations as paid.');
      return;
    }

    await loadObligationsData();
    await renderObligationsSection(content);
  };

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      const shouldCheck = selectAllCheckbox.checked;
      getEligibleCheckboxes().forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
      updateSelectionControls();
    });
  }

  content.querySelectorAll('[data-obligation-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', updateSelectionControls);
  });

  if (paySelectedButton) {
    paySelectedButton.addEventListener('click', async () => {
      const selectedIds = getCheckedCheckboxes().map((checkbox) => checkbox.dataset.obligationSelect);
      await markObligationsAsPaid(selectedIds);
    });
  }

  updateSelectionControls();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const year = Number(formData.get('year'));
    const month = Number(formData.get('month'));
    const rate = Number(formData.get('rate'));
    const mode = String(formData.get('mode'));
    const selectedObjectIds = formData.getAll('object_ids').map(String);
    const obligationId = String(formData.get('id') || '');

    if (selectedObjectIds.length === 0 && !obligationId) {
      notifyError('Select at least one property.');
      return;
    }

    if (obligationId) {
      const { error } = await supabase
        .from('payment_obligations')
        .update({ year, month, rate })
        .eq('id', obligationId);

      if (error) {
        notifyError(error.message || 'Failed to update obligation.');
        return;
      }

      notifyInfo('Payment obligation updated.');
      await loadObligationsData();
      await renderObligationsSection(content);
      return;
    }

    if (mode === 'copy') {
      const prev = getPrevMonthYear(year, month);
      const { data: prevObligations, error: prevError } = await supabase
        .from('payment_obligations')
        .select('independent_object_id,rate')
        .eq('year', prev.year)
        .eq('month', prev.month)
        .in('independent_object_id', selectedObjectIds);

      if (prevError) {
        notifyError(prevError.message || 'Failed to load previous month obligations.');
        return;
      }

      if ((prevObligations ?? []).length === 0) {
        notifyError('No previous month obligations found for selected objects.');
        return;
      }

      const payload = prevObligations.map((item) => ({
        year,
        month,
        independent_object_id: item.independent_object_id,
        rate: item.rate
      }));

      const { error } = await supabase
        .from('payment_obligations')
        .upsert(payload, { onConflict: 'year,month,independent_object_id' });

      if (error) {
        notifyError(error.message || 'Failed to copy obligations.');
        return;
      }

      notifyInfo('Monthly obligations copied from previous month.');
      await loadObligationsData();
      await renderObligationsSection(content);
      return;
    }

    const payload = selectedObjectIds.map((objectId) => ({
      year,
      month,
      independent_object_id: objectId,
      rate
    }));

    const { error } = await supabase
      .from('payment_obligations')
      .upsert(payload, { onConflict: 'year,month,independent_object_id' });

    if (error) {
      notifyError(error.message || 'Failed to create obligations.');
      return;
    }

    notifyInfo('Monthly obligations saved.');
    await loadObligationsData();
    await renderObligationsSection(content);
  });

  content.querySelectorAll('[data-edit-obligation]').forEach((button) => {
    button.addEventListener('click', () => {
      const obligation = state.obligations.find((item) => item.id === button.dataset.editObligation);
      if (!obligation) return;

      form.elements.id.value = obligation.id;
      form.elements.year.value = obligation.year;
      form.elements.month.value = obligation.month;
      form.elements.rate.value = obligation.rate;
      const checkbox = form.querySelector(`input[name="object_ids"][value="${obligation.independent_object_id}"]`);
      if (checkbox) checkbox.checked = true;
      openObligationForm();
    });
  });

  content.querySelectorAll('[data-pay-obligation]').forEach((button) => {
    button.addEventListener('click', async () => {
      await markObligationsAsPaid([button.dataset.payObligation]);
    });
  });

  content.querySelectorAll('[data-delete-obligation]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this payment obligation?');
      if (!confirmed) return;

      const { error } = await supabase.from('payment_obligations').delete().eq('id', button.dataset.deleteObligation);

      if (error) {
        notifyError(error.message || 'Failed to delete payment obligation.');
        return;
      }

      notifyInfo('Payment obligation deleted.');
      await loadObligationsData();
      await renderObligationsSection(content);
    });
  });
};
