const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, loadTS, A, B } = require('./helpers/runtime.cjs');
const { readMarketResearch } = loadTS('src/lib/marketResearch.ts');
const research = { version: 1, market: 'US', currency: 'USD', status: 'found', query: 'Camera', checkedAt: '2026-11-19T12:00:00Z', offers: [
  { marketplace: 'amazon', url: 'https://www.amazon.com/dp/B000000001', title: 'Camera', currency: 'USD', price: 25, condition: 'used', match: 'similar' }
] };
test('UI rejects unsafe links, invalid amounts and non-USD prices without fabricating a value', () => {
  assert.equal(readMarketResearch(research).offers[0].price, 25);
  for (const patch of [{ url: 'javascript:alert(1)' }, { url: 'https://www.amazon.com.evil.test/dp/B000000001' }, { price: -1 }, { price: '25' }, { currency: 'MXN' }]) {
    const result = readMarketResearch({ ...research, offers: [{ ...research.offers[0], ...patch }] });
    assert.equal(result.offers.length, 0); assert.equal(result.status, 'not_found');
  }
  assert.equal(readMarketResearch(null), null);
  const results = { ...research.offers[0], marketplace: 'ebay', sourceType: 'results', url: 'https://www.ebay.com/b/Cameras/625/bn_123' };
  assert.equal(readMarketResearch({ ...research, offers: [results] }).offers[0].sourceType, 'results');
  assert.equal(readMarketResearch({ ...research, offers: [{ ...results, sourceType: 'listing' }] }).offers.length, 0);
});
test('Migration preserves legacy items and stores references independently of value under owner RLS', async () => {
  const db = await fixture();
  try {
    // Supabase's base grants and RLS flags predate this repository's migrations.
    await db.exec('grant select on all tables in schema public to authenticated; grant update on public.items to authenticated; alter table public.items enable row level security;');
    const before = (await db.query("select value,market_research from items where id='item-1'")).rows[0];
    assert.equal(before.value, '100'); assert.equal(before.market_research, null);
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);
    await db.query("update items set market_research=$1,value='' where id='item-1'", [research]);
    const saved = (await db.query("select value,market_research from items where id='item-1'")).rows[0];
    assert.equal(saved.value, ''); assert.deepEqual(saved.market_research, research);
    await db.exec(`set request.jwt.claim.sub='${B}'`);
    assert.equal((await db.query("select market_research from items where id='item-1'")).rows.length, 0);
  } finally { await db.close(); }
});
