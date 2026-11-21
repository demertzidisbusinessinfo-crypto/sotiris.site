const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright');

const moneyPage = readFileSync(join(__dirname, '../money.html'), 'utf8');
const artifacts = process.env.MONEY_TEST_ARTIFACTS;
const user = { id: 'test-user', email: 'money@example.com' };
const session = { user, access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600 };
const categories = [
  { id: '1', name: 'Software', kind: 'business', sort_order: 0 },
  { id: '2', name: 'Groceries', kind: 'personal', sort_order: 1 }
];
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN });
});
after(async () => {
  await browser?.close();
});

async function capture(page, name) {
  if (artifacts) await page.screenshot({ path: join(artifacts, name), animations: 'disabled' });
}

async function openMoney(t, categoryResponse) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  t.after(() => page.close());
  const writes = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' && url.pathname === '/money.html') {
      return route.fulfill({ contentType: 'text/html', body: moneyPage });
    }
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/supabase-js@')) {
      return route.continue();
    }
    if (url.pathname === '/auth/v1/token') return route.fulfill({ json: session });
    if (url.pathname === '/rest/v1/finance_categories') {
      return route.fulfill(await categoryResponse);
    }
    if (url.pathname === '/rest/v1/finance_settings') return route.fulfill({ json: [] });
    if (url.pathname === '/rest/v1/finance_entries') {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] });
      const entry = route.request().postDataJSON();
      writes.push(entry);
      return route.fulfill({ status: 201, json: { id: String(writes.length), ...entry } });
    }
    return route.fulfill({ status: 204 });
  });
  await page.goto('http://localhost:8080/money.html');
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Password').fill('local-fixture-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('[data-open="out"]').click();
  return { page, writes };
}

test('empty categories explain setup and block expenses, but not income', async (t) => {
  const { page, writes } = await openMoney(t, { json: [] });
  await page.getByText('Nothing logged yet.').waitFor();
  assert.equal(await page.locator('.tile').count(), 0);
  await page.getByRole('button', { name: '5', exact: true }).click();
  const expense = page.getByRole('button', { name: 'Add expense' });
  if (await expense.isEnabled()) {
    await expense.click();
    await page.locator('#toast.on').waitFor();
    await capture(page, 'money-before.png');
  }
  assert.ok(await expense.isDisabled(), `Empty picker left Add expense enabled: "${await page.locator('#toast').textContent()}"`);
  assert.match(await page.locator('#category-setup').innerText(), /Finances tab.*reload Money/s);
  assert.equal(await page.getByRole('link', { name: 'dashboard' }).getAttribute('href'), '/client-dashboard');
  assert.deepEqual(writes, []);
  await capture(page, 'money-after.png');

  await page.locator('[data-direction="in"]').click();
  assert.ok(await page.locator('#category-setup').isHidden());
  await page.getByRole('button', { name: 'Add income' }).click();
  await page.locator('#feed').getByText('Income', { exact: true }).waitFor();
  assert.deepEqual(writes.map(({ direction, amount, category_id }) => ({ direction, amount, category_id })), [
    { direction: 'in', amount: 5, category_id: null }
  ]);
  await capture(page, 'money-income-saved.png');
});

test('categories arriving while the sheet is open enable a categorized expense', async (t) => {
  let respond;
  const pending = new Promise((resolve) => { respond = resolve; });
  const { page, writes } = await openMoney(t, pending);
  try {
    assert.ok(await page.getByText('Loading categories…').isVisible());
    assert.ok(await page.getByRole('button', { name: 'Add expense' }).isDisabled());
    assert.ok(await page.locator('#category-setup').isHidden());
  } finally {
    respond({ json: categories });
  }
  const groceries = page.getByRole('button', { name: 'Groceries personal' });
  await groceries.click();
  assert.ok(await page.locator('#category-setup').isHidden());
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('#feed').getByText('Groceries', { exact: false }).waitFor();
  assert.deepEqual(writes.map(({ direction, amount, category_id }) => ({ direction, amount, category_id })), [
    { direction: 'out', amount: 8, category_id: '2' }
  ]);
  await capture(page, 'money-expense-saved.png');
});

test('a missing finance table is not reported as an empty category list', async (t) => {
  const { page, writes } = await openMoney(t, {
    status: 400,
    json: { code: '42P01', message: 'relation "finance_categories" does not exist' }
  });
  await page.getByText('Could not load categories. Reload Money to try again.').waitFor();
  assert.match(await page.locator('#setup-notice').innerText(), /finance tables are not set up/);
  assert.ok(await page.locator('#category-setup').isHidden());
  assert.ok(await page.getByRole('button', { name: 'Add expense' }).isDisabled());
  assert.deepEqual(writes, []);
});
