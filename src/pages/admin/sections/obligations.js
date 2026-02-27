import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { state, loadInitialData, MONTH_NAMES, getPrevMonthYear } from '../adminState.js';

export const renderObligationsSection = (content) => {
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
    .map(
      (ob) => `
      <tr>
        <td>${MONTH_NAMES[ob.month - 1]} ${ob.year}</td>
        <td>${ob.properties?.number ?? '-'}</td>
        <td>${ob.rate}</td>
        <td class="admin-inline-actions">
          <button type="button" class="btn btn-sm btn-outline-primary" data-edit-obligation="${ob.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete-obligation="${ob.id}">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');

  content.innerHTML = `
    <div class="card border-0 shadow-sm admin-section-card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="h5 mb-0">Existing Obligations</h3>
          <button class="btn btn-sm btn-primary" type="button" id="open-obligation-form-btn">Create Obligation</button>
        </div>
        <div class="admin-table-wrap table-responsive">
          <table class="table table-sm align-middle">
            <thead><tr><th>Period</th><th>Object</th><th>Rate</th><th>Actions</th></tr></thead>
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
            <button class="btn btn-primary" type="submit">Save Obligations</button>
            <button class="btn btn-outline-secondary" type="button" id="close-obligation-form-btn">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const obligationFormPanel = content.querySelector('#obligation-form-panel');
  const openObligationFormButton = content.querySelector('#open-obligation-form-btn');
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
      await loadInitialData();
      renderObligationsSection(content);
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
      await loadInitialData();
      renderObligationsSection(content);
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
    await loadInitialData();
    renderObligationsSection(content);
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
      await loadInitialData();
      renderObligationsSection(content);
    });
  });
};
