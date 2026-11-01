import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntries, cookieKey, exportToRedis } from '../src/exporter.js';
import { FakeRedis } from './fakeRedis.js';

const config = {
  subdomains: ['http://secureline.tools.avast.com', 'http://gf.tools.avast.com'],
  cookies: [
    { name: 'dlp-avast', host: 'amazon', value: 'mmm_amz_dlp_777_ppc_m' },
    { name: 'dlp-avg', host: 'amazon', value: 'mmm_amz_dlp_779_ppc_m' },
  ],
};

test('cookieKey follows cookie:%NAME%:%HOST%', () => {
  assert.equal(cookieKey('dlp-avast', 'amazon'), 'cookie:dlp-avast:amazon');
});

test('buildEntries stores subdomains as a JSON array', () => {
  const entries = buildEntries(config);
  assert.equal(
    entries.get('subdomains'),
    '["http://secureline.tools.avast.com","http://gf.tools.avast.com"]',
  );
  assert.deepEqual(JSON.parse(entries.get('subdomains')), config.subdomains);
});

test('buildEntries creates one key per cookie', () => {
  const entries = buildEntries(config);
  assert.deepEqual([...entries.keys()], [
    'subdomains',
    'cookie:dlp-avast:amazon',
    'cookie:dlp-avg:amazon',
  ]);
  assert.equal(entries.get('cookie:dlp-avast:amazon'), 'mmm_amz_dlp_777_ppc_m');
});

test('buildEntries stores an empty JSON array when there are no subdomains', () => {
  assert.equal(buildEntries({ subdomains: [], cookies: [] }).get('subdomains'), '[]');
});

test('buildEntries: duplicate cookie name/host keeps the last value', () => {
  const entries = buildEntries({
    subdomains: [],
    cookies: [
      { name: 'a', host: 'b', value: 'first' },
      { name: 'a', host: 'b', value: 'second' },
    ],
  });
  assert.equal(entries.size, 2);
  assert.equal(entries.get('cookie:a:b'), 'second');
});

test('exportToRedis writes all entries and returns saved keys', async () => {
  const redis = new FakeRedis();
  await redis.connect();
  const saved = await exportToRedis(redis, buildEntries(config));

  assert.deepEqual(saved, ['subdomains', 'cookie:dlp-avast:amazon', 'cookie:dlp-avg:amazon']);
  assert.deepEqual(JSON.parse(redis.get('subdomains')), config.subdomains);
  assert.equal(redis.get('cookie:dlp-avast:amazon'), 'mmm_amz_dlp_777_ppc_m');
  assert.equal(redis.get('cookie:dlp-avg:amazon'), 'mmm_amz_dlp_779_ppc_m');
});

test('exportToRedis removes stale cookie keys but leaves unrelated keys alone', async () => {
  const redis = new FakeRedis({
    'cookie:old:host': 'stale',
    'cookie:dlp-avast:amazon': 'outdated',
    subdomains: '["http://old.example"]',
    'unrelated:key': 'keep me',
    cookies: 'not a cookie:* key, keep me',
  });
  await redis.connect();
  await exportToRedis(redis, buildEntries(config));

  assert.equal(redis.get('cookie:old:host'), null);
  assert.equal(redis.get('cookie:dlp-avast:amazon'), 'mmm_amz_dlp_777_ppc_m');
  assert.deepEqual(JSON.parse(redis.get('subdomains')), config.subdomains);
  assert.equal(redis.get('unrelated:key'), 'keep me');
  assert.equal(redis.get('cookies'), 'not a cookie:* key, keep me');
});

test('exportToRedis applies deletes and writes in a single transaction', async () => {
  const redis = new FakeRedis({ 'cookie:old:host': 'stale' });
  await redis.connect();
  await exportToRedis(redis, buildEntries(config));
  assert.equal(redis.execCount, 1);
});

test('exportToRedis is idempotent', async () => {
  const redis = new FakeRedis();
  await redis.connect();
  await exportToRedis(redis, buildEntries(config));
  const snapshot = new Map(redis.store);
  await exportToRedis(redis, buildEntries(config));
  assert.deepEqual(redis.store, snapshot);
});
