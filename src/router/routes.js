import { renderHomePage } from '../pages/home/home.js';
import { renderDashboardPage } from '../pages/dashboard/dashboard.js';
import { renderLoginPage } from '../pages/login/login.js';
import { renderRegisterPage } from '../pages/register/register.js';

export const routeMap = {
  '/': renderHomePage,
  '/login': renderLoginPage,
  '/register': renderRegisterPage,
  '/dashboard': renderDashboardPage
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
  { href: '/admin', label: 'Admin Panel' }
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
  '/admin': 'Admin Panel'
};

export const getRouteTitle = (path) => routeTitles[path] ?? null;
