import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../../components/toast/toast.js';
import { enableTableColumnFilters } from '../../../../components/table-filters/table-filters.js';
import { navigateTo } from '../../../../router/router.js';
import { state, loadObligationsData, MONTH_NAMES } from '../../adminState.js';
import template from './rates.html?raw';
import editIconSvg from '../../../../assets/icons/edit.svg?raw';
import './rates.css';

const sortByPeriodDesc = (left, right) => {
  if (left.year !== right.year) {
    return right.year - left.year;
  }

  return right.month - left.month;
};

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

const buildRates = () =>
  [...(state.rates ?? [])].sort(sortByPeriodDesc);

const hasPaidObligationForRate = (rateId) =>
  (state.obligations ?? [])
    .filter((obligation) => obligation.payment_rate_id === rateId)
    .some((obligation) => isObligationPaid(obligation));

const getRateByPeriod = (year, month) =>
  (state.rates ?? []).find((rate) => rate.year === year && rate.month === month) ?? null;

const toStatusBadge = (isActive) =>
  isActive
    ? '<span class="badge bg-success-subtle text-success-emphasis">Active</span>'
    : '<span class="badge bg-secondary-subtle text-secondary-emphasis">Not Active</span>';

const toToggleButtonMarkup = (rate) => {
  const paidExists = hasPaidObligationForRate(rate.id);
  const nextActive = !rate.is_active;
  const label = rate.is_active ? 'Deactivate' : 'Activate';
  const className = rate.is_active ? 'btn-outline-warning' : 'btn-outline-success';
  const disabled = rate.is_active && paidExists;
  const title = disabled
    ? 'Cannot deactivate when at least one property obligation is already paid.'
    : label;

  return `
    <button
      type="button"
      class="btn btn-sm ${className}"
      data-toggle-rate="${rate.id}"
      data-next-active="${String(nextActive)}"
      title="${title}"
      ${disabled ? 'disabled' : ''}
    >${label}</button>
  `;
};

const buildRateRowsMarkup = (rates) => {
  if (rates.length === 0) {
    return '<tr><td colspan="3" class="text-secondary">No rates yet.</td></tr>';
  }

  return rates
    .map((rate) => `
      <tr>
        <td>${MONTH_NAMES[rate.month - 1]} ${rate.year}</td>
        <td>${toStatusBadge(rate.is_active)}</td>
        <td class="admin-inline-actions">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-edit-rate="${rate.id}"
            aria-label="Edit rate ${rate.id}"
            title="Edit"
          >${editIconSvg}</button>
          ${toToggleButtonMarkup(rate)}
        </td>
      </tr>
    `)
    .join('');
};

const setRateActive = async (rateId, isActive) => {
  const { error } = await supabase
    .from('payment_rates')
    .update({ is_active: isActive })
    .eq('id', rateId);

  if (error) {
    notifyError(error.message || 'Failed to update rate status.');
    return false;
  }

  return true;
};

const createRateForPeriod = async (year, month) => {
  const { data, error } = await supabase
    .from('payment_rates')
    .insert({ year, month, is_active: true })
    .select('id,year,month,is_active')
    .single();

  if (error || !data) {
    notifyError(error?.message || 'Failed to create rate.');
    return null;
  }

  return data;
};

const createRateObligationsForAllProperties = async (rate) => {
  if (!state.objects.length) {
    return true;
  }

  const payload = state.objects.map((property) => ({
    payment_rate_id: rate.id,
    year: rate.year,
    month: rate.month,
    independent_object_id: property.id,
    rate: 0
  }));

  const { error } = await supabase
    .from('payment_obligations')
    .upsert(payload, { onConflict: 'year,month,independent_object_id' });

  if (error) {
    notifyError(error.message || 'Failed to create obligations for the rate.');
    return false;
  }

  return true;
};

export const renderRatesSection = async (content) => {
  content.textContent = '';
  const loadingWrap = document.createElement('div');
  loadingWrap.className = 'd-flex align-items-center gap-2 text-secondary py-5 justify-content-center';
  const loadingSpinner = document.createElement('div');
  loadingSpinner.className = 'spinner-border spinner-border-sm';
  loadingSpinner.setAttribute('role', 'status');
  loadingSpinner.setAttribute('aria-hidden', 'true');
  const loadingText = document.createElement('span');
  loadingText.textContent = 'Loading rates…';
  loadingWrap.append(loadingSpinner, loadingText);
  content.appendChild(loadingWrap);

  try {
    await loadObligationsData();
  } catch (error) {
    notifyError(error.message || 'Failed to load rates.');
    content.textContent = '';
    const errorText = document.createElement('p');
    errorText.className = 'text-secondary mb-0';
    errorText.textContent = 'Unable to load rates.';
    content.appendChild(errorText);
    return;
  }

  const rows = buildRateRowsMarkup(buildRates());

  content.innerHTML = template
    .replace('{{rows}}', rows)
    .replace('{{defaultYear}}', String(new Date().getFullYear()))
    .replace('{{defaultMonth}}', String(new Date().getMonth() + 1));

  enableTableColumnFilters(content, { skipColumns: ['actions'] });

  const rateCreatePanel = content.querySelector('#rate-create-panel');
  const rateCreateForm = content.querySelector('#rate-create-form');

  const hideCreatePanel = () => {
    rateCreatePanel.classList.add('d-none');
  };

  content.querySelector('#open-rate-create-btn')?.addEventListener('click', () => {
    rateCreateForm.reset();
    rateCreateForm.elements.year.value = String(new Date().getFullYear());
    rateCreateForm.elements.month.value = String(new Date().getMonth() + 1);
    rateCreatePanel.classList.remove('d-none');
  });

  content.querySelector('#close-rate-create-btn')?.addEventListener('click', hideCreatePanel);

  content.querySelectorAll('[data-edit-rate]').forEach((button) => {
    button.addEventListener('click', () => {
      const rateId = String(button.dataset.editRate);
      navigateTo(`/admin/panel?section=payment-obligations&rateId=${encodeURIComponent(rateId)}`);
    });
  });

  content.querySelectorAll('[data-toggle-rate]').forEach((button) => {
    button.addEventListener('click', async () => {
      const rateId = String(button.dataset.toggleRate);
      const nextActive = String(button.dataset.nextActive) === 'true';
      const updated = await setRateActive(rateId, nextActive);
      if (!updated) {
        return;
      }

      notifyInfo(nextActive ? 'Rate activated.' : 'Rate deactivated.');
      await renderRatesSection(content);
    });
  });

  rateCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(rateCreateForm);
    const year = Number(formData.get('year'));
    const month = Number(formData.get('month'));

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      notifyError('Enter valid year and month.');
      return;
    }

    const existingRate = getRateByPeriod(year, month);
    if (existingRate) {
      notifyInfo('Rate already exists for this period.');
      navigateTo(`/admin/panel?section=payment-obligations&rateId=${encodeURIComponent(existingRate.id)}`);
      return;
    }

    const rate = await createRateForPeriod(year, month);
    if (!rate) {
      return;
    }

    const createdObligations = await createRateObligationsForAllProperties(rate);
    if (!createdObligations) {
      return;
    }

    notifyInfo('Rate created.');
    navigateTo(`/admin/panel?section=payment-obligations&rateId=${encodeURIComponent(rate.id)}`);
  });
};
