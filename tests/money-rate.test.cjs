const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const page = readFileSync(require('node:path').join(__dirname, '../money.html'), 'utf8');
const source = page.slice(page.indexOf('  async function fetchRate()'), page.indexOf('  // ---------------- load'));

function setup({ usd = 1.2, error = null, fetchError = null } = {}) {
  const requests = [], notices = [];
  const settings = { display_currency: 'EUR', eur_usd_rate: 1.1545 };
  const context = vm.createContext({
    settings, userId: 'test-user', RATE_URL: 'https://example.test/rate',
    rate: () => settings.eur_usd_rate,
    showRate: note => notices.push(note), render() {},
    toast: message => notices.push(message),
    fetch: async () => {
      if (fetchError) throw fetchError;
      return { ok: true, json: async () => ({ rates: { USD: usd } }) };
    },
    db: { from: table => ({ upsert: (row, options) => ({
      then(resolve, reject) {
        requests.push({ table, row, options });
        return Promise.resolve({ error }).then(resolve, reject);
      }
    }) }) }
  });
  vm.runInContext(source, context);
  return { refresh: () => context.fetchRate(), requests, notices, settings };
}

test('executes the lazy upsert for a refreshed rate', async () => {
  const app = setup();
  await app.refresh();
  assert.equal(app.requests.length, 1);
  const { table, row, options } = app.requests[0];
  assert.equal(table, 'finance_settings');
  assert.equal(row.user_id, 'test-user');
  assert.equal(row.display_currency, 'EUR');
  assert.equal(row.eur_usd_rate, 1.2);
  assert.ok(Number.isFinite(Date.parse(row.updated_at)));
  assert.equal(options.onConflict, 'user_id');
});

test('does not write an unchanged rate', async () => {
  const app = setup({ usd: 1.1545 });
  await app.refresh();
  assert.equal(app.requests.length, 0);
});

test('keeps the saved rate when the API returns no rate or fails', async () => {
  for (const options of [{ usd: '' }, { usd: null }, { fetchError: new Error('offline') }]) {
    const app = setup(options);
    await app.refresh();
    assert.equal(app.requests.length, 0);
    assert.equal(app.settings.eur_usd_rate, 1.1545);
    assert.deepEqual(app.notices, ['saved']);
  }
});

test('reports a persistence error', async () => {
  const app = setup({ error: { message: 'write denied' } });
  await app.refresh();
  assert.ok(app.notices.includes('Could not save rate: write denied'));
});
