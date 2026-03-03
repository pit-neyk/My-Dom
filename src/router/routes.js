import { renderHomePage } from '../pages/home/home.js';
import { renderDashboardPage } from '../pages/dashboard/dashboard.js';
import { renderLoginPage } from '../pages/login/login.js';
import { renderRegisterPage } from '../pages/register/register.js';
import { renderAdminPanelPage } from '../pages/admin/admin.js';
import { renderAdminHomePage } from '../pages/admin-home/admin-home.js';
import { renderPaymentsPage } from '../pages/payments/payments.js';
import { renderDiscussionsPage } from '../pages/discussions/discussions.js';
import { renderDocumentsPage } from '../pages/documents/documents.js';
import { renderProfilePage } from '../pages/profile/profile.js';

export const routeMap = {
  '/': renderHomePage,
  '/login': renderLoginPage,
  '/register': renderRegisterPage,
  '/dashboard': renderDashboardPage,
  '/discussions': renderDiscussionsPage,
  '/documents': renderDocumentsPage,
  '/payments': renderPaymentsPage,
  '/profile': renderProfilePage,
  '/admin': renderAdminHomePage,
  '/admin/panel': renderAdminPanelPage
};

export const navigationLinks = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Login' },
  { href: '/register', label: 'Register' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/payments', label: 'Payments' },
  { href: '/discussions', label: 'Discussions' },
  { href: '/documents', label: 'Documents' },
  { href: '/profile', label: 'Profile' },
  { href: '/admin', label: 'Admin Home' },
  { href: '/admin/panel', label: 'Admin Panel' }
];

export const routeTitles = {
  '/': 'Home',
  '/login': 'Login',
  '/register': 'Register',
  '/dashboard': 'Dashboard',
  '/payments': 'Payments',
  '/discussions': 'Discussions',
  '/documents': 'Documents',
  '/profile': 'Profile',
  '/admin': 'Admin Home',
  '/admin/panel': 'Admin Panel'
};

export const getRouteTitle = (path) => routeTitles[path] ?? null;
