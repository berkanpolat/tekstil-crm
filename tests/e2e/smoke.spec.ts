import { test, expect } from '@playwright/test'

test('acilis ekrani yukleniyor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tekstil A.Ş. CRM' })).toBeVisible()
})
