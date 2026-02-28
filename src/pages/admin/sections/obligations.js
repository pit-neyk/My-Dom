import { supabase } from '../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../components/toast/toast.js';
import { getCurrentSession } from '../../../features/auth/auth.js';
import { enableTableColumnFilters } from '../../../components/table-filters/table-filters.js';
import { state, loadObligationsData, MONTH_NAMES, getPrevMonthYear } from '../adminState.js';
import template from './obligations.html?raw';
import objectCheckTemplate from './obligations-object-check.html?raw';
import rowTemplate from './obligations-row.html?raw';
import statusPaidTemplate from './status-paid.html?raw';
import statusPendingTemplate from './status-pending.html?raw';
import payButtonTemplate from './obligations-pay-button.html?raw';
import payIconSvg from '../../../assets/icons/pay.svg?raw';
import editIconSvg from '../../../assets/icons/edit.svg?raw';
import deleteIconSvg from '../../../assets/icons/delete.svg?raw';
import { fillTemplate } from '../../../lib/template.js';
import './obligations.css';

export const renderObligationsSection = async (content) => {
  content.textContent = '';
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'd-flex align-items-center gap-2 text-secondary py-5 justify-content-center';
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'spinner-border spinner-border-sm';
  loadingSpinner.setAttribute('role', 'status');
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingText = document.createElement('span');
  loadingText.textContent = 'Loading payment obligations…';
  loadingWrap.append(loadingSpinner, loadingText);
  content.appendChild(loadingWrap);

  try {
    await loadObligationsData();
  } catch (error) {
    notifyError(error.message || 'Failed to load payment obligations.');
    content.textContent = '';
    const errorText = document.createElement('p');
    errorText.className = 'text-secondary mb-0';
    errorText.textContent = 'Unable to load payment obligations.';
    content.appendChild(errorText);
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
    .map((obj) => fillTemplate(objectCheckTemplate, { id: obj.id, number: obj.number }))
    .join('');

  const rows = state.obligations
    .slice(0, 200)
    .map((ob) => {
      const paid = isObligationPaid(ob);

      return fillTemplate(rowTemplate, {
        id: ob.id,
        disabled: paid ? 'disabled' : '',
        period: `${MONTH_NAMES[ob.month - 1]} ${ob.year}`,
        property: ob.properties?.number ?? '-',
        rate: ob.rate,
        statusBadge: paid ? statusPaidTemplate : statusPendingTemplate,
        payButton: paid ? '' : fillTemplate(payButtonTemplate, { id: ob.id, payIcon: payIconSvg }),
        editIcon: editIconSvg,
        deleteIcon: deleteIconSvg
      });
    })
    .join('');

  content.innerHTML = template
    .replace('{{rows}}', rows)
    .replace('{{defaultYear}}', String(new Date().getFullYear()))
    .replace('{{defaultMonth}}', String(new Date().getMonth() + 1))
    .replace('{{objectChecks}}', objectChecks);

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

  openObligationFormButton.addEventListener('click', () => {
    form.reset();
    form.elements.id.value = '';
    openObligationForm();
  });

  closeObligationFormButton.addEventListener('click', () => {
    renderObligationsSection(content);
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
