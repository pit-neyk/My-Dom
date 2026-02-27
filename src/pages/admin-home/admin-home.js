import template from './admin-home.html?raw';
import './admin-home.css';
import { isAdmin, isAuthenticated } from '../../features/auth/auth.js';
import { navigateTo } from '../../router/router.js';
import { supabase } from '../../lib/supabase.js';
import { notifyError } from '../../components/toast/toast.js';

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
    .select(`
      id, number, floor,
      payment_obligations (
        id, rate,
        payments ( id, status )
      )
    `)
    .order('number');

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

  const [{ data: properties, error: propertiesError }, { data: financials, error: financialsError }] =
    await Promise.all([fetchProperties(), fetchBuildingFinancials()]);

  if (propertiesError) {
    notifyError(`Failed to load properties overview: ${propertiesError.message}`);
    return;
  }

  if (financialsError) {
    notifyError(`Failed to load building totals: ${financialsError.message}`);
  }

  const safeProperties = properties ?? [];

  let withDebt = 0;
  let noDebt = 0;

  const rows = safeProperties
    .map((property) => {
      const obligations = property.payment_obligations ?? [];
      const hasPending = obligations.some((obligation) => {
        const payment = obligation.payments?.[0] ?? null;
        return payment?.status !== 'paid';
      });

      if (hasPending) {
        withDebt += 1;
      } else {
        noDebt += 1;
      }

      return `
        <tr>
          <td>${property.number}</td>
          <td>${property.floor}</td>
          <td>
            ${hasPending
              ? '<span class="badge bg-danger-subtle text-danger-emphasis">Pending</span>'
              : '<span class="badge bg-success-subtle text-success-emphasis">Clear</span>'}
          </td>
          <td class="text-end">${obligations.length}</td>
        </tr>
      `;
    })
    .join('');

  const collected = Number(financials?.total_collected ?? 0);
  const due = Number(financials?.total_due ?? 0);

  container.querySelector('#admin-total-properties').textContent = String(safeProperties.length);
  container.querySelector('#admin-clear-properties').textContent = String(noDebt);
  container.querySelector('#admin-debt-properties').textContent = String(withDebt);
  container.querySelector('#admin-total-collected').textContent = formatCurrency(collected);
  container.querySelector('#admin-total-due').textContent = formatCurrency(due);
  container.querySelector('#admin-properties-overview').innerHTML =
    rows || '<tr><td colspan="4" class="text-secondary">No properties found.</td></tr>';
};
