import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function freshGame(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.hub:not(.swap-out)')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await freshGame(page);
});

test('fresh run, pending-result reload, and Kaden day-two story', async ({ page }) => {
  await expect(page.locator('.choice')).toHaveCount(6);
  await expect(page.locator('[data-location="house_of_middleway"]')).toContainText(
    'Brian is expecting you',
  );

  await page.locator('[data-location="spiritual_community"]').click();
  await expect(page.locator('.location')).toBeVisible();
  await page.locator('.location .btn-primary').click();
  await expect(page.locator('[role="dialog"][aria-label="Day result"]')).toBeVisible();

  const totals = await page.locator('.modal-totals').textContent();
  await page.reload();
  await expect(page.locator('[role="dialog"][aria-label="Day result"]')).toBeVisible();
  await expect(page.locator('.modal-totals')).toHaveText(totals);

  await page.getByRole('button', { name: /Continue/ }).click();
  const story = page.locator('[role="dialog"][aria-label="A Rumour Finds Its Feet"]');
  await expect(story).toBeVisible();
  await expect(story).toContainText('Kaden');
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: /Face the day/ })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(story.getByRole('button', { name: /Kaden — view portrait/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /Face the day/ })).toBeFocused();
  await page.getByRole('button', { name: /Face the day/ }).click();
  await expect(page.locator('.hub:not(.swap-out)')).toBeVisible();
  await expect(page.locator('#hud-day')).toHaveText('Journey Day 2');
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
});

test('settings, portrait lightbox, and portable save round-trip', async ({ page }) => {
  await page.locator('#hud-portrait-btn').click();
  await expect(page.locator('.portrait-lightbox')).toBeVisible();
  await expect(page.locator('.portrait-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.portrait-lightbox')).toHaveCount(0);
  await expect(page.locator('#hud-portrait-btn')).toBeFocused();

  await page.locator('#settings-button').click();
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();
  await expect(page.getByLabel('Music volume')).toHaveValue('0.25');

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^secondbarnone-day-1-seed-\d+\.json$/);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.v).toBe(6);
  expect(exported.journeyDay).toBe(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Import save file').setInputFiles(path);
  await page.waitForLoadState('load');
  await expect(page.locator('.hub:not(.swap-out)')).toBeVisible();
  await expect(page.locator('#hud-day')).toHaveText('Journey Day 1');
});

test('long trip is atomic and hard energy collapse restarts cleanly', async ({ page }) => {
  await page.evaluate(() => {
    window.__game.gs.journeyDay = 20;
    window.__game.gs.reputation = 100;
    window.__game.api.goto.location('mountain_retreat');
  });
  await expect(page.locator('.location')).toContainText('Fontainebleau Retreat');
  await page.locator('.location .btn-primary').click();
  await expect(page.locator('[aria-label="Day result"]')).toContainText(
    'Three days pass in silence',
  );
  await expect(page.locator('#hud-day')).toHaveText('Journey Day 22');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('#hud-day')).toHaveText('Journey Day 23');

  await page.evaluate(() => {
    window.__game.gs.energy = 1;
    window.__game.api.goto.location('bar');
  });
  await page.locator('.location .btn-primary').click();
  await expect(page.locator('.gameover')).toContainText('Léon drops down due to exhaustion');
  await page.getByRole('button', { name: 'Begin again' }).click();
  await expect(page.locator('.hub:not(.swap-out)')).toBeVisible();
  await expect(page.locator('#hud-day')).toHaveText('Journey Day 1');
});
