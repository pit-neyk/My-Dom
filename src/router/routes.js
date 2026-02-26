import { renderHomePage } from '../pages/home/home.js';
import { renderDashboardPage } from '../pages/dashboard/dashboard.js';

export const routeMap = {
  '/': renderHomePage,
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
