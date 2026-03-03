import { test, expect } from '@playwright/test';

const routes = [
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/payments',
  '/discussions',
  '/documents',
  '/profile',
  '/admin',
  '/admin/panel'
];

for (const route of routes) {
  test(`route ${route} renders app shell`, async ({ page }) => {
    const pageErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto(route, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#page-slot')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to load page content');

    expect(pageErrors).toEqual([]);
  });
}
