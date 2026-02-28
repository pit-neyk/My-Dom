import { supabase } from '../../../../lib/supabase.js';
import { notifyError, notifyInfo } from '../../../../components/toast/toast.js';
import { state, loadObligationsData, MONTH_NAMES } from '../../adminState.js';
import template from './payment-obligations.html?raw';
import './payment-obligations.css';

const toRateAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Number(parsed.toFixed(2));
};

const getSelectedRateId = () => new URLSearchParams(window.location.search).get('rateId');

const getRateById = (rateId) =>
  (state.rates ?? []).find((rate) => rate.id === rateId) ?? null;

const buildObligationByPropertyMap = (rateId) => {
  const obligationsMap = new Map();

  (state.obligations ?? [])
    .filter((obligation) => obligation.payment_rate_id === rateId)
    .forEach((obligation) => {
      obligationsMap.set(String(obligation.independent_object_id), obligation);
    });

  return obligationsMap;
};

const buildRowsMarkup = (rateId) => {
  const obligationsByProperty = buildObligationByPropertyMap(rateId);

  if (!state.objects.length) {
    return '<tr><td colspan="2" class="text-secondary">No properties found.</td></tr>';
  }

  return state.objects
    .map((property) => {
      const obligation = obligationsByProperty.get(String(property.id));
      const rate = Number(obligation?.rate ?? 0);

      return `
        <tr>
          <td>Property ${property.number}</td>
          <td>
            <input
              class="form-control"
              type="number"
              step="0.01"
              min="0"
              value="${rate.toFixed(2)}"
              data-property-rate-input="${property.id}"
            />
          </td>
        </tr>
      `;
    })
    .join('');
};

const saveRateObligations = async (rate, entries) => {
  const payload = entries.map((entry) => ({
    payment_rate_id: rate.id,
    year: rate.year,
    month: rate.month,
    independent_object_id: entry.propertyId,
    rate: toRateAmount(entry.rate)
  }));

  const { error } = await supabase
    .from('payment_obligations')
    .upsert(payload, { onConflict: 'year,month,independent_object_id' });

  if (error) {
    notifyError(error.message || 'Failed to save payment obligations.');
    return false;
  }

  return true;
};

export const renderPaymentObligationsSection = async (content) => {
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

  const rateId = getSelectedRateId();
  if (!rateId) {
    content.innerHTML = '<p class="text-secondary mb-0">No rate selected. Open a rate from the Rates page.</p>';
    return;
  }

  const rate = getRateById(rateId);
  if (!rate) {
    content.innerHTML = '<p class="text-secondary mb-0">Selected rate was not found.</p>';
    return;
  }

  const rows = buildRowsMarkup(rate.id);
  content.innerHTML = template.replace('{{rows}}', rows);

  const periodText = `${MONTH_NAMES[rate.month - 1]} ${rate.year}`;
  const periodNode = content.querySelector('#payment-obligations-period');
  if (periodNode) {
    periodNode.textContent = periodText;
  }

  const form = content.querySelector('#payment-obligations-form');
  form.elements.rate_id.value = String(rate.id);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const entries = Array.from(content.querySelectorAll('[data-property-rate-input]')).map((input) => ({
      propertyId: String(input.dataset.propertyRateInput),
      rate: input.value
    }));

    const saved = await saveRateObligations(rate, entries);
    if (!saved) {
      return;
    }

    notifyInfo('Payment obligations saved.');
    await renderPaymentObligationsSection(content);
  });
};
