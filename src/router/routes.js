import { renderHomePage } from '../pages/home/home.js';
import { renderDashboardPage } from '../pages/dashboard/dashboard.js';
import { renderLoginPage } from '../pages/login/login.js';
import { renderRegisterPage } from '../pages/register/register.js';
import { renderAdminPanelPage } from '../pages/admin/admin.js';
import { renderAdminHomePage } from '../pages/admin-home/admin-home.js';
import { renderPaymentsPage } from '../pages/payments/payments.js';

export const routeMap = {
  '/': renderHomePage,
  '/login': renderLoginPage,
  '/register': renderRegisterPage,
  '/dashboard': renderDashboardPage,
  '/payments': renderPaymentsPage,
  '/admin': renderAdminHomePage,
  '/admin/panel': renderAdminPanelPage
};

export const navigationLinks = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Login' },
  { href: '/register', label: 'Register' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/events', label: 'Events' },
  { href: '/payments', label: 'Payments' },
  { href: '/discussions', label: 'Discussions' },
  { href: '/profile', label: 'Profile' },
  { href: '/admin', label: 'Admin Home' },
  { href: '/admin/panel', label: 'Admin Panel' }
];

export const routeTitles = {
  '/': 'Home',
  '/login': 'Login',
  '/register': 'Register',
  '/dashboard': 'Dashboard',
  '/events': 'Events',
  '/payments': 'Payments',
  '/discussions': 'Discussions',
  '/profile': 'Profile',
  '/admin': 'Admin Home',
  '/admin/panel': 'Admin Panel'
};

export const getRouteTitle = (path) => routeTitles[path] ?? null;
