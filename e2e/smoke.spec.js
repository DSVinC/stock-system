import { test, expect } from '@playwright/test';

test.describe('Stock System E2E', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/投资系统|Stock/);
  });

  test('select page loads successfully', async ({ page }) => {
    await page.goto('/select.html');
    await expect(page).toHaveTitle(/选股|Stock/);
  });
});